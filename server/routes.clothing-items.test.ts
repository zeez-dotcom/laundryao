import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireAdminOrSuperAdmin } = await import('./auth');
import { insertClothingItemSchema } from '@shared/schema';

function createApp(storage: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: 'u1', role: 'admin' };
    next();
  });
  app.post('/api/clothing-items', requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const validated = insertClothingItemSchema.parse(req.body);
      const userId = (req as any).user.id;
      const category = await storage.getCategory(validated.categoryId, userId);
      if (!category) {
        return res.status(400).json({ message: 'Invalid category' });
      }
      if (category.type !== 'clothing') {
        return res.status(400).json({ message: 'Invalid category type' });
      }
      const newItem = await storage.createClothingItem({ ...validated, userId });
      res.json(newItem);
    } catch (err) {
      res.status(500).json({ message: 'Failed to create clothing item' });
    }
  });
  return app;
}

test('creates clothing item when category type is clothing', async () => {
  let created = false;
  const storage = {
    getCategory: async (_id: string, _userId: string) => ({ id: 'c1', type: 'clothing' }),
    createClothingItem: async (data: any) => {
      created = true;
      return { id: 'i1', ...data };
    },
  };
  const app = createApp(storage);
  const res = await request(app)
    .post('/api/clothing-items')
    .send({ name: 'Shirt', categoryId: 'c1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'i1');
  assert.ok(created);
});

test('returns 400 for non-clothing category type', async () => {
  let created = false;
  const storage = {
    getCategory: async (_id: string, _userId: string) => ({ id: 'c1', type: 'service' }),
    createClothingItem: async (_data: any) => {
      created = true;
      return {};
    },
  };
  const app = createApp(storage);
  const res = await request(app)
    .post('/api/clothing-items')
    .send({ name: 'Shirt', categoryId: 'c1' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: 'Invalid category type' });
  assert.equal(created, false);
});
