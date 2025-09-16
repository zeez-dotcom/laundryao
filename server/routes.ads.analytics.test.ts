import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { storage } = await import('./storage');

function createApp(opts: { withSession?: boolean } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (opts.withSession !== false) {
      req.session = { customerId: 'cust1' };
    }
    next();
  });

  app.post('/customer/ads/:id/impression', async (req: any, res) => {
    if (!req.session?.customerId) return res.status(401).json({ message: 'Not authenticated' });
    await storage.recordAdImpression({ adId: req.params.id, branchId: 'b1', customerId: req.session.customerId });
    res.json({ ok: true });
  });

  app.post('/customer/ads/:id/click', async (req: any, res) => {
    if (!req.session?.customerId) return res.status(401).json({ message: 'Not authenticated' });
    await storage.recordAdClick({ adId: req.params.id, branchId: 'b1', customerId: req.session.customerId });
    res.json({ ok: true });
  });

  return app;
}

test('POST /customer/ads/:id/impression requires authentication', async () => {
  const app = createApp({ withSession: false });
  const res = await request(app).post('/customer/ads/xyz/impression');
  assert.equal(res.status, 401);
});

test('POST /customer/ads/:id/click requires authentication', async () => {
  const app = createApp({ withSession: false });
  const res = await request(app).post('/customer/ads/xyz/click');
  assert.equal(res.status, 401);
});

test('POST /customer/ads/:id/impression records an impression', async () => {
  let called = false;
  const orig = storage.recordAdImpression;
  storage.recordAdImpression = async (data: any) => {
    called = true;
    assert.equal(data.adId, 'ad1');
    assert.equal(data.branchId, 'b1');
    assert.equal(data.customerId, 'cust1');
  };
  try {
    const app = createApp();
    const res = await request(app).post('/customer/ads/ad1/impression');
    assert.equal(res.status, 200);
    assert.equal(called, true);
  } finally {
    storage.recordAdImpression = orig;
  }
});

test('POST /customer/ads/:id/click records a click', async () => {
  let called = false;
  const orig = storage.recordAdClick;
  storage.recordAdClick = async (data: any) => {
    called = true;
    assert.equal(data.adId, 'ad2');
    assert.equal(data.branchId, 'b1');
    assert.equal(data.customerId, 'cust1');
  };
  try {
    const app = createApp();
    const res = await request(app).post('/customer/ads/ad2/click');
    assert.equal(res.status, 200);
    assert.equal(called, true);
  } finally {
    storage.recordAdClick = orig;
  }
});

