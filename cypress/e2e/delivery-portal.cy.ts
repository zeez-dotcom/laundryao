describe("Delivery tracking portal", () => {
  it("authenticates and streams live updates", () => {
    const deliveryId = "del-123";
    const orderId = "order-99";

    cy.intercept("POST", "/api/portal/delivery-auth/request", {
      statusCode: 200,
      body: { message: "sent", debugOtp: "654321" },
    }).as("requestOtp");

    cy.intercept("POST", "/api/portal/delivery-auth/verify", {
      statusCode: 200,
      body: { delivery: { id: deliveryId, orderId } },
    }).as("verifyOtp");

    const portalPayload = {
      delivery: {
        id: deliveryId,
        orderId,
        status: "driver_enroute",
        scheduledDeliveryTime: new Date(Date.now() + 45 * 60000).toISOString(),
        driverId: "driver-1",
        fee: "5.00",
      },
      order: {
        id: "order-1",
        number: "A123",
        customerName: "Jamie Rivera",
        customerPhone: "+15551234567",
        address: "123 Market St",
        total: 24.5,
      },
      tracking: {
        etaMinutes: 18,
        distanceKm: 4.2,
        driverLocation: { lat: 40.7128, lng: -74.006, timestamp: new Date().toISOString() },
        deliveryLocation: { lat: 40.715, lng: -74.002 },
      },
      reschedulePolicy: {
        minimumNoticeMinutes: 45,
        maxReschedules: 3,
        remainingReschedules: 3,
        windows: [
          {
            start: new Date(Date.now() + 60 * 60000).toISOString(),
            end: new Date(Date.now() + 90 * 60000).toISOString(),
          },
        ],
      },
      compensationPolicy: {
        maxPercent: 0.25,
        maxAmount: 6,
        previouslyOffered: 0,
      },
    };

    cy.intercept("GET", `/api/portal/delivery/${deliveryId}`, {
      statusCode: 200,
      body: portalPayload,
    }).as("getPortal");

    cy.intercept("GET", `/api/portal/delivery/${deliveryId}/messages`, {
      statusCode: 200,
      body: { messages: [] },
    }).as("getMessages");

    cy.intercept("GET", `/api/portal/delivery/${deliveryId}/reschedule-windows`, {
      statusCode: 200,
      body: {
        deliveryId,
        windows: portalPayload.reschedulePolicy.windows,
        minimumNoticeMinutes: portalPayload.reschedulePolicy.minimumNoticeMinutes,
        remainingReschedules: portalPayload.reschedulePolicy.remainingReschedules,
      },
    }).as("getReschedule");

    cy.intercept("POST", `/api/portal/delivery/${deliveryId}/messages`, {
      statusCode: 201,
      body: {
        message: {
          id: "msg-1",
          deliveryId,
          orderId,
          senderType: "customer",
          body: "Hello!",
          createdAt: new Date().toISOString(),
        },
      },
    }).as("postMessage");

    cy.intercept("POST", `/api/portal/delivery/${deliveryId}/reschedule`, {
      statusCode: 200,
      body: {
        deliveryId,
        scheduledDeliveryTime: portalPayload.reschedulePolicy.windows[0].start,
        windowEnd: portalPayload.reschedulePolicy.windows[0].end,
      },
    }).as("postReschedule");

    cy.intercept("POST", `/api/portal/delivery/${deliveryId}/compensation`, {
      statusCode: 200,
      body: {
        deliveryId,
        amount: 5,
        currency: "USD",
        reason: "Delay",
        totalCompensation: 5,
      },
    }).as("postCompensation");

    cy.visit(`/portal/delivery-tracking?deliveryId=${deliveryId}`, {
      onBeforeLoad(win) {
        class MockWebSocket {
          static instances: MockWebSocket[] = [];
          public readyState = 1;
          public url: string;
          public onopen: ((event?: any) => void) | null = null;
          public onmessage: ((event: { data: string }) => void) | null = null;
          constructor(url: string) {
            this.url = url;
            MockWebSocket.instances.push(this);
            setTimeout(() => {
              this.onopen?.({});
            }, 0);
          }
          send() {}
          close() {}
        }
        (win as any).MockWebSocket = MockWebSocket;
        (win as any).WebSocket = MockWebSocket as any;
      },
    });

    cy.get("#delivery-id").should("have.value", deliveryId);
    cy.get("#contact").type("+15555551234");
    cy.contains("Send verification code").click();
    cy.wait("@requestOtp");

    cy.window().then((win) => {
      (win as any).__setDeliveryPortalOtp?.("654321");
    });
    cy.contains("Verify").click();
    cy.wait("@verifyOtp");
    cy.wait("@getPortal");
    cy.wait("@getMessages");

    cy.contains("Delivery tracking portal").should("exist");
    cy.contains("Jamie Rivera").should("exist");
    cy.contains("Driver en route").should("exist");

    cy.get("textarea").type("Hello!");
    cy.contains("Send").click();
    cy.wait("@postMessage");
    cy.contains("Laundry team").should("not.exist");
    cy.contains("Hello!").should("exist");

    cy.window().then((win) => {
      const sockets = (win as any).MockWebSocket.instances as Array<{
        onmessage?: (event: { data: string }) => void;
      }>;
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          eventType: "message",
          orderId,
          message: {
            id: "msg-2",
            deliveryId,
            orderId,
            senderType: "agent",
            body: "We are five minutes away",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    cy.contains("We are five minutes away").should("exist");

    cy.contains("Adjust delivery").click();
    cy.wait("@getReschedule");
    cy.contains("Confirm reschedule").click();
    cy.wait("@postReschedule");

    cy.contains("Request compensation").click();
    cy.wait("@postCompensation");
  });
});
