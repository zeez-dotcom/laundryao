import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://user:pass@localhost/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const stubPath = join(__dirname, "__stubs__");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "kafkajs") {
    return join(stubPath, "kafkajs/index.mjs");
  }
  if (request === "@google-cloud/pubsub") {
    return join(stubPath, "@google-cloud/pubsub/index.mjs");
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { requireAuth } = await import("./auth");
const { registerSmartOrderRoutes } = await import("./routes/orders.smart");
Module._resolveFilename = originalResolveFilename;

function createApp({
  storageOverrides = {},
  user = { id: "user-1", role: "admin", branchId: "branch-1" },
  suggestionsService = {
    generate: async () => {
      throw new Error("suggestions should not run");
    },
  },
  anomaliesService = {
    detect: async () => {
      throw new Error("anomalies should not run");
    },
  },
}: {
  storageOverrides?: Record<string, unknown>;
  user?: any;
  suggestionsService?: any;
  anomaliesService?: any;
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = user;
    next();
  });

  const storage = {
    getCustomer: async () => ({ id: "cust-1", branchId: "branch-1" }),
    getCustomerPackagesWithUsage: async () => [],
    ...storageOverrides,
  };

  const eventBus = { publish: async () => {} };

  registerSmartOrderRoutes({
    app,
    requireAuth,
    storage: storage as any,
    logger: noopLogger as any,
    eventBus: eventBus as any,
    suggestionsService: suggestionsService as any,
    anomaliesService: anomaliesService as any,
  });

  return { app, storage };
}

test("rejects requests for unauthorized branches", async () => {
  let packagesCalls = 0;
  let customerCalls = 0;
  const { app } = createApp({
    storageOverrides: {
      getCustomer: async () => {
        customerCalls += 1;
        return { id: "cust-1", branchId: "branch-1" };
      },
      getCustomerPackagesWithUsage: async () => {
        packagesCalls += 1;
        return [];
      },
    },
  });

  const res = await request(app)
    .get("/api/orders/smart")
    .query({ branchId: "branch-2" });

  assert.equal(res.status, 403);
  assert.equal(packagesCalls, 0);
  assert.equal(customerCalls, 0);
});

test("rejects access to customers outside the branch", async () => {
  let packagesCalls = 0;
  let customerCalls = 0;
  const { app } = createApp({
    storageOverrides: {
      getCustomer: async () => {
        customerCalls += 1;
        return undefined;
      },
      getCustomerPackagesWithUsage: async () => {
        packagesCalls += 1;
        return [];
      },
    },
  });

  const res = await request(app)
    .get("/api/orders/smart")
    .query({ branchId: "branch-1", customerId: "cust-2" });

  assert.equal(res.status, 404);
  assert.equal(res.body.message, "Customer not found");
  assert.equal(packagesCalls, 0);
  assert.equal(customerCalls, 1);
});
