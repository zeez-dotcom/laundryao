import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { storage } = await import('./storage');

function createApp() {
  const app = express();
  app.use(express.json());
  // Mock session per request using header
  app.use((req, _res, next) => {
    const customerId = req.header('X-Customer-Id') || 'cust1';
    (req.session as any) = { customerId };
    next();
  });

  app.get('/customer/packages', async (req, res) => {
    const customerId = (req.session as any).customerId as string | undefined;
    if (!customerId) return res.status(401).json({ message: 'Login required' });
    try {
      const packages = await storage.getCustomerPackagesWithUsage(customerId);
      res.json(packages);
    } catch {
      res.status(500).json({ message: 'Failed to fetch packages' });
    }
  });

  return app;
}

test('GET /customer/packages returns only session customer packages', async () => {
  const packages1 = [{ id: 'cp1', balance: 5 }];
  const packages2 = [{ id: 'cp2', balance: 3 }];
  const original = storage.getCustomerPackagesWithUsage;
  storage.getCustomerPackagesWithUsage = async (id: string) => {
    return id === 'cust1' ? packages1 : packages2;
  };

  try {
    const app = createApp();
    const res1 = await request(app).get('/customer/packages').set('X-Customer-Id', 'cust1');
    assert.equal(res1.status, 200);
    assert.deepEqual(res1.body, packages1);

    const res2 = await request(app).get('/customer/packages').set('X-Customer-Id', 'cust2');
    assert.equal(res2.status, 200);
    assert.deepEqual(res2.body, packages2);
  } finally {
    storage.getCustomerPackagesWithUsage = original;
  }
});
