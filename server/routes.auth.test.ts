import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

// Ensure DATABASE_URL is set to allow importing auth module without DB
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireAdminOrSuperAdmin, requireAuth } = await import('./auth');

function createApp(user?: { role: string }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => Boolean(user);
    if (user) {
      req.user = user;
    }
    next();
  });
  // Routes under test
  app.get('/api/products', requireAuth, (_req, res) => res.json({ ok: true }));
  app.get('/api/clothing-items', requireAuth, (_req, res) => res.json({ ok: true }));
  app.get('/api/laundry-services', requireAuth, (_req, res) => res.json({ ok: true }));
  app.post('/api/receipts/email', requireAuth, (_req, res) => res.json({ ok: true }));
  app.post('/api/clothing-items', requireAdminOrSuperAdmin, (_req, res) => res.json({ ok: true }));
  app.put('/api/clothing-items/:id', requireAdminOrSuperAdmin, (_req, res) => res.json({ ok: true }));
  app.post('/api/laundry-services', requireAdminOrSuperAdmin, (_req, res) => res.json({ ok: true }));
  app.put('/api/laundry-services/:id', requireAdminOrSuperAdmin, (_req, res) => res.json({ ok: true }));
  app.delete('/api/clothing-items/:id', requireAdminOrSuperAdmin, (_req, res) => res.json({ ok: true }));
  app.delete('/api/laundry-services/:id', requireAdminOrSuperAdmin, (_req, res) => res.json({ ok: true }));
  return app;
}

test('unauthenticated requests receive 401 for protected routes', async () => {
  const app = createApp();
  await request(app).get('/api/products').expect(401);
  await request(app).get('/api/clothing-items').expect(401);
  await request(app).get('/api/laundry-services').expect(401);
  await request(app).post('/api/receipts/email').send({}).expect(401);
});

test('authenticated requests can access protected routes', async () => {
  const app = createApp({ role: 'user' });
  const r1 = await request(app).get('/api/products');
  assert.equal(r1.status, 200);
  const r2 = await request(app).get('/api/clothing-items');
  assert.equal(r2.status, 200);
  const r3 = await request(app).get('/api/laundry-services');
  assert.equal(r3.status, 200);
  const r4 = await request(app).post('/api/receipts/email').send({});
  assert.equal(r4.status, 200);
});

test('non-admin requests receive 403', async () => {
  const app = createApp();
  await request(app).post('/api/clothing-items').send({}).expect(403);
  await request(app).put('/api/clothing-items/1').send({}).expect(403);
  await request(app).post('/api/laundry-services').send({}).expect(403);
  await request(app).put('/api/laundry-services/1').send({}).expect(403);
  await request(app).delete('/api/clothing-items/1').expect(403);
  await request(app).delete('/api/laundry-services/1').expect(403);
});

test('admin requests can modify items', async () => {
  const app = createApp({ role: 'admin' });
  const res1 = await request(app).post('/api/clothing-items').send({});
  assert.equal(res1.status, 200);
  const res2 = await request(app).put('/api/clothing-items/1').send({});
  assert.equal(res2.status, 200);
  const res3 = await request(app).post('/api/laundry-services').send({});
  assert.equal(res3.status, 200);
  const res4 = await request(app).put('/api/laundry-services/1').send({});
  assert.equal(res4.status, 200);
  const res5 = await request(app).delete('/api/clothing-items/1');
  assert.equal(res5.status, 200);
  const res6 = await request(app).delete('/api/laundry-services/1');
  assert.equal(res6.status, 200);
});
