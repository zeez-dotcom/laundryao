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
  // Simulate session via header for tests
  app.use((req: any, _res, next) => {
    if (opts.withSession !== false) {
      const customerId = req.header('X-Customer-Id') || 'cust1';
      req.session = { customerId };
    }
    next();
  });

  // Minimal route logic copied from server/routes.ts
  app.get('/customer/ads', async (req: any, res) => {
    try {
      const customerId = req.session?.customerId as string | undefined;
      if (!customerId) return res.status(401).json({ message: 'Not authenticated' });
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: 'Customer not found' });
      const ads = await storage.getActiveAds(customer.branchId);
      res.json(ads);
    } catch {
      res.status(500).json({ message: 'Failed to fetch ads' });
    }
  });

  return app;
}

test('GET /customer/ads requires authentication', async () => {
  const app = createApp({ withSession: false });
  const res = await request(app).get('/customer/ads');
  assert.equal(res.status, 401);
});

test('GET /customer/ads returns active ads for customer branch', async () => {
  const origGetCustomer = storage.getCustomer;
  const origGetActiveAds = storage.getActiveAds;
  storage.getCustomer = async (id: string) => ({ id, branchId: 'b1' } as any);
  const sample = [{ id: 'ad1', titleEn: 'Promo' }];
  storage.getActiveAds = async (branchId: string) => {
    return branchId === 'b1' ? (sample as any) : [];
  };

  try {
    const app = createApp();
    const res = await request(app).get('/customer/ads').set('X-Customer-Id', 'custX');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, sample);
  } finally {
    storage.getCustomer = origGetCustomer;
    storage.getActiveAds = origGetActiveAds;
  }
});

