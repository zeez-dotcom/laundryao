import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import http from "http";

import { registerGraphql } from "./index";
import { requireAuth } from "../auth";
import type { IStorage } from "../storage";
import type { Customer, Order } from "@shared/schema";

const iso = new Date("2024-05-01T10:00:00.000Z");

const customer: Customer = {
  publicId: 1 as any,
  id: "cust-1",
  phoneNumber: "+201234567890",
  name: "Amina",
  nickname: "am",
  email: "amina@example.com",
  passwordHash: "hash",
  address: "123 Nile Street",
  branchId: "branch-1",
  balanceDue: "25.00" as any,
  totalSpent: "420.00" as any,
  loyaltyPoints: 120,
  isActive: true,
  createdAt: iso,
  updatedAt: iso,
};

const baseOrder: Order = {
  publicId: 10 as any,
  id: "order-1",
  orderNumber: "INV-1001",
  customerId: customer.id,
  customerName: customer.name,
  customerPhone: customer.phoneNumber,
  items: [
    {
      service: { id: "svc-1", name: "Wash" },
      clothingItem: { id: "cloth-1", name: "Shirt" },
      quantity: 3,
      total: "90.00",
    },
  ],
  subtotal: "90.00" as any,
  tax: "0.00" as any,
  total: "90.00" as any,
  paymentMethod: "cash",
  status: "ready",
  estimatedPickup: null,
  actualPickup: null,
  readyBy: iso,
  promisedReadyDate: iso,
  promisedReadyOption: "tomorrow",
  notes: null,
  sellerName: "Main",
  branchId: customer.branchId,
  isDeliveryRequest: true,
  packageUsages: null,
  createdAt: iso,
  updatedAt: iso,
};

const orderWithPayment = { ...baseOrder, paid: "80.00", remaining: "10.00" };
const orderWithBalance = { ...baseOrder, balanceDue: "10.00", customerNickname: null };

const delivery = {
  id: "delivery-1",
  orderId: baseOrder.id,
  branchId: customer.branchId,
  deliveryMode: "driver_pickup",
  pickupAddressId: "addr-1",
  deliveryAddressId: "addr-2",
  scheduledPickupTime: iso,
  actualPickupTime: null,
  scheduledDeliveryTime: null,
  actualDeliveryTime: null,
  driverId: "driver-1",
  deliveryInstructions: "Leave at reception",
  deliveryNotes: null,
  deliveryStatus: "pending",
  estimatedDistance: "3.2",
  actualDistance: null,
  deliveryFee: "15.00",
  createdAt: iso,
  updatedAt: iso,
  order: baseOrder,
};

const storageStub: IStorage = {
  async getCustomers() {
    return { items: [customer], total: 1 };
  },
  async getCustomer(id: string) {
    return id === customer.id ? customer : undefined;
  },
  async getCustomersByIds(ids: string[]) {
    return ids.includes(customer.id) ? [customer] : [];
  },
  async getCustomerAddresses(customerId: string) {
    if (customerId !== customer.id) return [];
    return [
      {
        id: "addr-1",
        customerId: customer.id,
        label: "Home",
        address: "123 Nile Street",
        cityId: null,
        governorateId: null,
        lat: "30.1" as any,
        lng: "31.2" as any,
        isDefault: true,
        createdAt: iso,
        updatedAt: iso,
      },
    ];
  },
  async getCustomerEngagementPlan(customerId: string) {
    if (customerId !== customer.id) return undefined;
    return {
      id: "plan-1",
      customerId: customer.id,
      branchId: customer.branchId,
      churnTier: "loyal",
      preferredServices: ["Wash"],
      recommendedAction: "Send thank-you",
      recommendedChannel: "sms",
      nextContactAt: iso,
      lastActionAt: iso,
      lastActionChannel: "sms",
      lastOutcome: "replied",
      source: "auto",
      rateLimitedUntil: null,
      createdAt: iso,
      updatedAt: iso,
    } as any;
  },
  async getOrdersByCustomer(customerId: string) {
    return customerId === customer.id ? [orderWithPayment] : [];
  },
  async getOrders() {
    return [orderWithBalance as any];
  },
  async getOrder(id: string) {
    return id === baseOrder.id ? baseOrder : undefined;
  },
  async getDeliveryOrders() {
    return [delivery as any];
  },
  async getDeliveryOrderById(id: string) {
    return id === delivery.id ? (delivery as any) : undefined;
  },
  async getRevenueSummaryByDateRange() {
    return {
      totalOrders: 1,
      totalRevenue: 90,
      averageOrderValue: 90,
      daily: [{ date: "2024-05-01", orders: 1, revenue: 90 }],
    };
  },
  async getTopServices() {
    return [{ service: "Wash", count: 1, revenue: 90 }];
  },
  async getTopProducts() {
    return [{ product: "Detergent", count: 1, revenue: 45 }];
  },
  async getTopPackages() {
    return [{ pkg: "Monthly", count: 1, revenue: 200 }];
  },
  async getPaymentMethodBreakdown() {
    return [{ method: "cash", count: 1, revenue: 90 }];
  },
  // Unused methods stubbed for interface compliance
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCustomersByIdsWithStats(ids: string[]): Promise<any[]> {
    return [];
  },
} as unknown as IStorage;

const workflowEngineStub = {
  listWorkflows: async () => [
    {
      id: "wf-1",
      name: "Welcome",
      description: "Greets new customers",
      status: "active",
      metadata: { version: 1 },
      createdAt: iso,
      updatedAt: iso,
      nodes: [
        {
          id: "node-1",
          workflowId: "wf-1",
          key: "start",
          label: "Start",
          kind: "trigger",
          type: "orders.created",
          config: {},
          positionX: 0,
          positionY: 0,
          createdAt: iso,
          updatedAt: iso,
        },
      ],
      edges: [],
    },
  ],
  getWorkflow: async (id: string) => {
    const [workflow] = await workflowEngineStub.listWorkflows();
    return workflow.id === id ? workflow : null;
  },
  listTriggers: () => [
    {
      type: "orders.created",
      label: "Order Created",
      description: "Runs when a new order is received",
      schema: null,
      resolveContext: async () => ({}),
    },
  ],
  listActions: () => [
    {
      type: "notifications.dispatch",
      label: "Send Notification",
      description: "Queues a notification",
      run: async () => ({ status: "success" as const }),
    },
  ],
};

const customerInsightsServiceStub = {
  async generateSummary() {
    return {
      customerId: customer.id,
      summary: "Amina orders regularly and prefers wash services",
      purchaseFrequency: "Monthly",
      preferredServices: ["Wash"],
      sentiment: "positive",
      generatedAt: iso,
    };
  },
};

const optimizationServiceStub = {
  async recommendAssignments({ deliveryIds }: { deliveryIds?: string[] }) {
    const assignments = (deliveryIds ?? []).includes(delivery.id)
      ? [
          {
            deliveryId: delivery.id,
            driverId: "driver-optim",
            etaMinutes: 15,
            distanceKm: 2.5,
            confidence: 0.8,
            reasons: ["Closest driver"],
          },
        ]
      : [];
    return {
      generatedAt: iso.toISOString(),
      assignments,
      unassignedDeliveries: [],
    };
  },
};

test("graphql endpoint mirrors core REST data", async (t) => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "admin-1", role: "admin", branchId: customer.branchId };
    req.session = {};
    (req as any).tenantId = customer.branchId;
    next();
  });

  const httpServer = http.createServer(app);

  await registerGraphql({
    app,
    httpServer,
    storage: storageStub,
    workflowEngine: workflowEngineStub as any,
    requireAuth,
    services: {
      customerInsightsService: customerInsightsServiceStub as any,
      optimizationService: optimizationServiceStub as any,
    },
  });

  const agent = request(httpServer);

  const query = `
    query Dashboard($customerId: ID!, $deliveryId: ID!) {
      me { id role }
      customer(id: $customerId) {
        id
        name
        balanceDue
        orders { id financials { paid remaining } }
        insights { summary sentiment }
      }
      orders { id financials { balanceDue } }
      delivery(id: $deliveryId) {
        id
        deliveryStatus
        optimization { driverId etaMinutes }
        order { id orderNumber }
      }
      analyticsSummary {
        totalOrders
        totalRevenue
        topServices { name count }
        paymentMethods { name revenue }
      }
      workflows { id status }
      workflowCatalog { triggers { type } actions { type } }
    }
  `;

  const response = await agent.post("/graphql").send({
    query,
    variables: { customerId: customer.id, deliveryId: delivery.id },
  });

  assert.equal(response.status, 200, `GraphQL error: ${JSON.stringify(response.body)}`);

  assert.ok(!response.body.errors, JSON.stringify(response.body.errors));

  const data = response.body.data;
  assert.equal(data.me.id, "admin-1");
  assert.equal(data.customer.id, customer.id);
  assert.equal(data.customer.orders[0].id, baseOrder.id);
  assert.equal(data.customer.orders[0].financials.paid, 80);
  assert.equal(data.customer.insights.sentiment, "positive");
  assert.equal(data.orders[0].financials.balanceDue, 10);
  assert.equal(data.delivery.optimization.driverId, "driver-optim");
  assert.equal(data.analyticsSummary.totalOrders, 1);
  assert.equal(data.analyticsSummary.topServices[0].name, "Wash");
  assert.equal(data.workflows[0].id, "wf-1");
  assert.equal(data.workflowCatalog.triggers[0].type, "orders.created");

  await new Promise((resolve) => httpServer.close(resolve));
});

