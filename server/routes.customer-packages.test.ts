import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { requireCustomerOrAdmin } = await import('./auth');
const { storage } = await import('./storage');
const logger = (await import('./logger')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { role: 'admin', branchId: 'b1' };
    (req.session as any) = { customerId: req.header('X-Customer-Id') || 'cust1' };
    next();
  });

  app.get('/customer/packages', requireCustomerOrAdmin, async (req, res) => {
    try {
      const customerId = (req.session as any).customerId as string;
      const packages = await storage.getCustomerPackagesWithUsage(customerId);
      res.json(packages);
    } catch (error) {
      logger.error({ err: error, customerId: (req.session as any).customerId }, 'Failed to fetch customer packages');
      res.status(500).json({ message: 'Failed to fetch customer packages' });
    }
  });

  return app;
}

test('GET /customer/packages as staff returns packages', async () => {
  const mockPackages = [
    {
      id: 'cp1',
      packageId: 'pkg1',
      nameEn: 'Test Package',
      nameAr: null,
      balance: 5,
      totalCredits: 10,
    },
  ];
  const original = storage.getCustomerPackagesWithUsage;
  storage.getCustomerPackagesWithUsage = async (id: string) => {
    return id === 'cust1' ? mockPackages : [];
  };

  try {
    const app = createApp();
    const res = await request(app).get('/customer/packages').set('X-Customer-Id', 'cust1');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, mockPackages);
  } finally {
    storage.getCustomerPackagesWithUsage = original;
  }
});
