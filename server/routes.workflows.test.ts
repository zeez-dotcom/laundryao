import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import type { WorkflowEngine } from "./services/workflows/engine";
import { registerWorkflowRoutes } from "./routes/workflows";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://user:pass@localhost/db";

function createStubEngine() {
  const stubWorkflow = {
    id: "wf-1",
    name: "Order follow-up",
    description: "",
    status: "draft" as const,
    metadata: {},
    createdBy: null,
    branchId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    nodes: [],
    edges: [],
  };

  const engine: Partial<WorkflowEngine> & {
    calls: Record<string, unknown>;
  } = {
    calls: {},
    listTriggers: () => [
      {
        type: "orders.created",
        label: "Order Created",
        description: "",
        schema: undefined as any,
        resolveContext: async () => ({}),
      },
    ],
    listActions: () => [
      {
        type: "notifications.dispatch",
        label: "Send Notification",
        description: "",
        run: async () => ({ status: "success" }),
      },
    ],
    listWorkflows: async () => [stubWorkflow],
    createWorkflow: async (input) => {
      engine.calls.createWorkflow = input;
      return stubWorkflow;
    },
    getWorkflow: async (id) => {
      engine.calls.getWorkflow = id;
      return id === stubWorkflow.id ? stubWorkflow : null;
    },
    updateWorkflow: async (id, input) => {
      engine.calls.updateWorkflow = { id, input };
      return id === stubWorkflow.id ? stubWorkflow : null;
    },
    deleteWorkflow: async (id) => {
      engine.calls.deleteWorkflow = id;
      return id === stubWorkflow.id;
    },
    validateWorkflow: async (id) => {
      engine.calls.validateWorkflow = id;
      return id === stubWorkflow.id
        ? { valid: true, errors: [], warnings: [] }
        : null;
    },
    simulateWorkflow: async (id, triggerType, payload) => {
      engine.calls.simulateWorkflow = { id, triggerType, payload };
      return id === stubWorkflow.id
        ? {
            executionId: "exec-1",
            status: "completed",
            logs: [],
            context: payload,
            durationMs: 5,
          }
        : null;
    },
    runTrigger: async (type, payload) => {
      engine.calls.runTrigger = { type, payload };
      return [];
    },
  };

  return engine as WorkflowEngine & { calls: Record<string, unknown> };
}

function createApp(engine: WorkflowEngine & { calls: Record<string, unknown> }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { role: "super_admin" } as any;
    next();
  });
  registerWorkflowRoutes(app, engine);
  return app;
}

test("GET /api/workflows returns workflows", async () => {
  const engine = createStubEngine();
  const app = createApp(engine);
  const response = await request(app).get("/api/workflows");
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.workflows));
  assert.equal(response.body.workflows[0].id, "wf-1");
});

test("POST /api/workflows creates a workflow", async () => {
  const engine = createStubEngine();
  const app = createApp(engine);
  const payload = {
    definition: { name: "Test", description: "" },
    nodes: [
      { key: "trigger", label: "Order Created", kind: "trigger", type: "orders.created" },
      { key: "action", label: "Notify", kind: "action", type: "notifications.dispatch", config: { template: "welcome" } },
    ],
    edges: [
      { sourceNodeId: "trigger", targetNodeId: "action" },
    ],
  };

  const response = await request(app).post("/api/workflows").send(payload);
  assert.equal(response.status, 201);
  assert.deepEqual(engine.calls.createWorkflow, payload);
});

test("POST /api/workflows/:id/simulate runs simulation", async () => {
  const engine = createStubEngine();
  const app = createApp(engine);
  const response = await request(app)
    .post("/api/workflows/wf-1/simulate")
    .send({ triggerType: "orders.created", payload: { orderId: "1" } });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "completed");
  assert.deepEqual(engine.calls.simulateWorkflow, {
    id: "wf-1",
    triggerType: "orders.created",
    payload: { orderId: "1" },
  });
});

test("POST /api/workflows/trigger/:type executes trigger", async () => {
  const engine = createStubEngine();
  const app = createApp(engine);
  const response = await request(app)
    .post("/api/workflows/trigger/orders.created")
    .send({ orderId: "1" });
  assert.equal(response.status, 200);
  assert.deepEqual(engine.calls.runTrigger, {
    type: "orders.created",
    payload: { orderId: "1" },
  });
});
