const dossierResponse = {
  customer: {
    id: "cust-1",
    branchId: "b1",
    name: "Command Center Hero",
    phoneNumber: "+20111111111",
    email: "hero@example.com",
    loyaltyPoints: 42,
    isActive: true,
    createdAt: "2024-01-10T10:00:00.000Z",
  },
  financial: {
    balanceDue: 120.5,
    totalSpend: 2500,
    loyaltyPoints: 42,
    packageCredits: 5,
  },
  orders: [
    {
      id: "o-1",
      orderNumber: "1001",
      status: "completed",
      total: 220,
      paid: 220,
      remaining: 0,
      createdAt: "2024-03-10T09:00:00.000Z",
      promisedReadyDate: "2024-03-11T09:00:00.000Z",
      items: [],
    },
  ],
  packages: [
    {
      id: "pkg-1",
      name: "Premium",
      balance: 5,
      startsAt: "2024-01-01T00:00:00.000Z",
      expiresAt: "2024-06-01T00:00:00.000Z",
      totalCredits: 10,
    },
  ],
  outreachTimeline: [],
  auditTrail: [],
  actions: {
    issueCredit: {
      method: "POST",
      endpoint: "/api/customers/cust-1/payments",
      payloadExample: {},
    },
    schedulePickup: {
      method: "PUT",
      endpoint: "/api/customer-insights/cust-1/actions",
      payloadExample: {},
    },
    launchChat: {
      method: "PUT",
      endpoint: "/api/customer-insights/cust-1/actions",
      payloadExample: {},
    },
    queueCampaign: {
      method: "PUT",
      endpoint: "/api/customer-insights/cust-1/actions",
      payloadExample: {},
    },
  },
  insights: {
    customerId: "cust-1",
    summary: "Weekly customer with positive sentiment",
    purchaseFrequency: "Weekly",
    preferredServices: ["Wash & Fold"],
    sentiment: "positive",
    generatedAt: "2024-03-10T10:00:00.000Z",
  },
};

describe("Customer command center", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/customers/cust-1/command-center", dossierResponse);
    cy.visit("/customers/cust-1/command-center");
    cy.contains("Command Center Hero").should("be.visible");
  });

  it("issues credit, schedules pickup, launches chat, and queues campaign", () => {
    cy.intercept("POST", "/api/customers/cust-1/payments", (req) => {
      expect(req.body).to.deep.equal({
        amount: 80,
        paymentMethod: "credit",
        receivedBy: "Command Center",
        notes: "Customer retention credit",
      });
      req.reply({ statusCode: 200, body: {} });
    }).as("issueCredit");

    cy.get('[data-cy="issue-credit-form"]').within(() => {
      cy.get("#credit-amount").clear().type("80");
      cy.get("#credit-notes").clear().type("Customer retention credit");
      cy.contains("button", /Issue credit/i).click();
    });
    cy.wait("@issueCredit");
    cy.get('[data-cy="audit-trail"]').should("contain.text", "Issued manual credit");

    cy.intercept("PUT", "/api/customer-insights/cust-1/actions", (req) => {
      if (req.body?.recommendedAction === "Pickup scheduled") {
        expect(req.body).to.have.property("nextContactAt");
        req.reply({ statusCode: 200, body: {} });
      }
    }).as("updatePlan");

    cy.get('[data-cy="schedule-pickup-form"]').within(() => {
      cy.get("#pickup-at").type("2025-04-20T10:00");
      cy.get("#pickup-notes").clear().type("Driver coming at 10:00");
      cy.contains("button", /Log schedule/i).click();
    });
    cy.wait("@updatePlan");
    cy.get('[data-cy="outreach-timeline"]').should("contain.text", "Pickup scheduled");

    cy.get('[data-cy="launch-chat-card"] button').click();
    cy.get('[data-cy="outreach-timeline"]').should("contain.text", "Chat session launched");

    cy.get('[data-cy="queue-campaign-form"]').within(() => {
      cy.get("#campaign-name").clear().type("Ramadan SMS Blast");
      cy.contains("button", /Queue campaign/i).click();
    });
    cy.get('[data-cy="outreach-timeline"]').should("contain.text", "Campaign queued");
  });
});
