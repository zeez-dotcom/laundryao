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
  app.get('/api/reports/clothing-items', requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const range = (req.query.range as string) || 'daily';
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const u = req.user as any;
      const items = await storage.getClothingItemStats(range, u.branchId, limit);
      res.json({ items });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch clothing item stats' });
    }
  });
  return app;
}

test('returns clothing item stats for admins', async () => {
  let params: any = null;
  const storage = {
    async getClothingItemStats(range: string, branchId?: string, limit?: number) {
      params = { range, branchId, limit };
      return [{ item: 'Shirt - Wash', count: 3, revenue: 30 }];
    },
  };
  const app = createApp(storage, { id: 'u1', role: 'admin', branchId: 'b1' });
  const res = await request(app).get('/api/reports/clothing-items?range=weekly&limit=5');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { items: [{ item: 'Shirt - Wash', count: 3, revenue: 30 }] });
  assert.deepEqual(params, { range: 'weekly', branchId: 'b1', limit: 5 });
});

test('forbids access to non-admins', async () => {
  const storage = { getClothingItemStats: async () => [] };
  const app = createApp(storage, { id: 'u1', role: 'user', branchId: 'b1' });
  const res = await request(app).get('/api/reports/clothing-items');
  assert.equal(res.status, 403);
});
