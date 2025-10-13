import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://user:pass@localhost/db";

const { registerCustomerCommandCenterRoutes } = await import("./routes/customers/command-center");
const { CustomerInsightsService } = await import("./services/customer-insights");

function createLoggerStub() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as any;
}

test("GET /api/customers/:id/command-center aggregates dossier", async () => {
  const storageStub: any = {
    getCustomer: async (id: string) =>
      id === "cust-1"
        ? {
            id: "cust-1",
            branchId: "b1",
            name: "Command Center Hero",
            phoneNumber: "+20111111111",
            email: "hero@example.com",
            loyaltyPoints: 42,
            isActive: true,
            createdAt: new Date("2024-01-10T10:00:00Z"),
            balanceDue: "120.50",
            totalSpent: "2500.00",
          }
        : null,
    getOrdersByCustomer: async () => [
      {
        id: "o-1",
        orderNumber: "1001",
        status: "completed",
        total: "220.00",
        paid: "220.00",
        remaining: "0",
        createdAt: new Date("2024-03-10T09:00:00Z"),
        promisedReadyDate: new Date("2024-03-11T09:00:00Z"),
        items: [
          { serviceId: "svc-1", serviceName: "Wash & Fold", quantity: 2 },
          { serviceId: "svc-2", serviceName: "Ironing", quantity: 1 },
        ],
      },
    ],
    getCustomerPackagesWithUsage: async () => [
      {
        id: "pkg-1",
        name: "Premium",
        balance: "5",
        startsAt: new Date("2024-01-01T00:00:00Z"),
        expiresAt: new Date("2024-06-01T00:00:00Z"),
        totalCredits: 10,
      },
    ],
    getPaymentsByCustomer: async () => [
      {
        id: "pay-1",
        customerId: "cust-1",
        amount: "120.50",
        paymentMethod: "cash",
        createdAt: new Date("2024-03-10T09:30:00Z"),
      },
    ],
    getLoyaltyHistory: async () => [
      {
        id: "loy-1",
        customerId: "cust-1",
        change: 10,
        description: "Monthly bonus",
        createdAt: new Date("2024-03-01T08:00:00Z"),
      },
    ],
    getCustomerEngagementPlan: async () => ({
      id: "plan-1",
      customerId: "cust-1",
      branchId: "b1",
      lastActionAt: new Date("2024-03-08T07:00:00Z"),
      lastOutcome: "SMS follow-up",
      lastActionChannel: "sms",
    }),
  };

  const insightsServiceStub = {
    async generateSummary() {
      return {
        customerId: "cust-1",
        summary: "Weekly customer with positive sentiment",
        purchaseFrequency: "Weekly",
        preferredServices: ["Wash & Fold"],
        sentiment: "positive",
        generatedAt: new Date("2024-03-10T10:00:00Z"),
      };
    },
  } as unknown as CustomerInsightsService;

  const outreachEvents = [
    {
      id: "evt-1",
      occurredAt: "2024-03-05T09:00:00.000Z",
      channel: "email",
      summary: "Receipt emailed",
      relatedOrderId: "o-1",
    },
  ];

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { role: "admin", branchId: "b1" };
    next();
  });

  registerCustomerCommandCenterRoutes({
    app,
    storage: storageStub,
    requireAdminOrSuperAdmin: (_req, _res, next) => next(),
    logger: createLoggerStub(),
    customerInsightsService: insightsServiceStub,
    fetchOutreachEvents: async () => outreachEvents,
  });

  const res = await request(app).get("/api/customers/cust-1/command-center");
  assert.equal(res.status, 200);
  assert.equal(res.body.customer.name, "Command Center Hero");
  assert.equal(res.body.financial.balanceDue, 120.5);
  assert.equal(res.body.orders[0].orderNumber, "1001");
  assert.equal(res.body.packages[0].balance, 5);
  assert.equal(res.body.insights.purchaseFrequency, "Weekly");
  assert.equal(res.body.actions.issueCredit.endpoint, "/api/customers/cust-1/payments");
  assert.ok(Array.isArray(res.body.auditTrail));
  assert.equal(res.body.auditTrail[0].category, "payment");
});

test("GET /api/customers/:id/command-center returns 404 for missing customer", async () => {
  const storageStub: any = {
    getCustomer: async () => null,
  };

  const app = express();
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { role: "admin", branchId: "b1" };
    next();
  });

  registerCustomerCommandCenterRoutes({
    app,
    storage: storageStub,
    requireAdminOrSuperAdmin: (_req, _res, next) => next(),
    logger: createLoggerStub(),
    customerInsightsService: {
      generateSummary: async () => {
        throw new Error("Should not be called");
      },
    } as unknown as CustomerInsightsService,
  });

  const res = await request(app).get("/api/customers/cust-404/command-center");
  assert.equal(res.status, 404);
});
