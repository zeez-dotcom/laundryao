import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://user:pass@localhost/db";

const { registerCatalogExperimentRoutes, resetCatalogExperimentStore } = await import(
  "./routes/catalog/experiments"
);

function createApp() {
  const app = express();
  app.use(express.json());
  const requireAdminOrSuperAdmin = ((req, _res, next) => {
    req.user = {
      id: "admin-1",
      username: "admin",
      role: "admin",
      branchId: "b1",
    } as any;
    next();
  }) as express.RequestHandler;

  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as import("pino").Logger;

  registerCatalogExperimentRoutes({ app, requireAdminOrSuperAdmin, logger });
  return app;
}

test("catalog experiments require forecast before publish and block high-risk plans", async () => {
  resetCatalogExperimentStore();
  const app = createApp();

  const createRes = await request(app).post("/api/catalog/experiments").send({
    branchId: "b1",
    name: "Weekend wash uplift",
    hypothesis: "Offer slight premium for express wash",
    changes: [
      {
        serviceId: "svc-wash",
        serviceName: "Wash & Fold",
        baselinePrice: 40,
        proposedPrice: 44,
        expectedVolume: 120,
      },
    ],
  });
  assert.equal(createRes.status, 201);
  const experimentId = createRes.body.id;

  const prematurePublish = await request(app)
    .post(`/api/catalog/experiments/${experimentId}/publish`)
    .send({ confirm: true });
  assert.equal(prematurePublish.status, 409);

  const forecastRes = await request(app)
    .post(`/api/catalog/experiments/${experimentId}/forecast`)
    .send({ demandShift: 0.1 });
  assert.equal(forecastRes.status, 200);
  assert.equal(forecastRes.body.status, "forecasted");

  const publishRes = await request(app)
    .post(`/api/catalog/experiments/${experimentId}/publish`)
    .send({ confirm: true });
  assert.equal(publishRes.status, 200);
  assert.equal(publishRes.body.status, "published");

  const riskyCreate = await request(app).post("/api/catalog/experiments").send({
    branchId: "b1",
    name: "Aggressive price increase",
    hypothesis: "Test extremely high premium",
    changes: [
      {
        serviceId: "svc-dry",
        serviceName: "Dry Cleaning",
        baselinePrice: 30,
        proposedPrice: 80,
        expectedVolume: 80,
      },
    ],
  });
  const riskyId = riskyCreate.body.id;
  await request(app)
    .post(`/api/catalog/experiments/${riskyId}/forecast`)
    .send({ demandShift: -0.2 });

  const riskyPublish = await request(app)
    .post(`/api/catalog/experiments/${riskyId}/publish`)
    .send({ confirm: true });
  assert.equal(riskyPublish.status, 409);
  assert.match(riskyPublish.body.message, /High risk/);
});
