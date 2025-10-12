import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireAdminOrSuperAdmin } = await import('./auth');

function createApp(storage: any, user: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = user;
    next();
  });

  app.get('/api/reports/top-services', requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const range = (req.query.range as string) || 'daily';
      const u = req.user as any;
      const services = await storage.getTopServices(range, u.branchId || undefined);
      res.json({ services });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch top services' });
    }
  });

  app.get('/api/reports/top-products', requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const range = (req.query.range as string) || 'daily';
      const u = req.user as any;
      const products = await storage.getTopProducts(range, u.branchId || undefined);
      res.json({ products });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch top products' });
    }
  });

  return app;
}

test('returns top services data for admins', async () => {
  let received: any = null;
  const storage = {
    async getTopServices(range: string, branchId?: string) {
      received = { range, branchId };
      return [{ service: 'Wash', count: 2, revenue: 30.5 }];
    },
    getTopProducts: async () => [],
  };
  const app = createApp(storage, { id: 'u1', role: 'admin', branchId: 'b1' });
  const res = await request(app).get('/api/reports/top-services?range=monthly');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { services: [{ service: 'Wash', count: 2, revenue: 30.5 }] });
  assert.deepEqual(received, { range: 'monthly', branchId: 'b1' });
});

test('returns top products data for admins', async () => {
  let received: any = null;
  const storage = {
    getTopServices: async () => [],
    async getTopProducts(range: string, branchId?: string) {
      received = { range, branchId };
      return [{ product: 'Shirt', count: 5, revenue: 42.75 }];
    },
  };
  const app = createApp(storage, { id: 'u2', role: 'admin', branchId: 'b2' });
  const res = await request(app).get('/api/reports/top-products?range=weekly');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { products: [{ product: 'Shirt', count: 5, revenue: 42.75 }] });
  assert.deepEqual(received, { range: 'weekly', branchId: 'b2' });
});

test('forbids non-admins from accessing top services', async () => {
  const storage = { getTopServices: async () => [], getTopProducts: async () => [] };
  const app = createApp(storage, { id: 'u3', role: 'user', branchId: 'b1' });
  const res = await request(app).get('/api/reports/top-services');
  assert.equal(res.status, 403);
});
