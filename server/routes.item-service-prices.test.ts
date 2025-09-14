import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

import { insertItemServicePriceSchema } from '@shared/schema';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireAdminOrSuperAdmin } = await import('./auth');

function createApp(storage: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { role: 'admin', branchId: 'b1' };
    next();
  });

  app.post('/api/item-service-prices', requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const body = { ...req.body, branchId: req.body.branchId ?? req.user.branchId };
      const data = insertItemServicePriceSchema.parse(body);
      const record = await storage.createItemServicePrice(data);
      res.json(record);
    } catch {
      res.status(500).json({ message: 'Failed to upsert item service price' });
    }
  });

  return app;
}

test('POST /api/item-service-prices upserts existing record', async () => {
  const store: Record<string, any> = {};
  const storage = {
    async createItemServicePrice(data: any) {
      const key = `${data.clothingItemId}-${data.serviceId}-${data.branchId}`;
      store[key] = { ...data };
      return store[key];
    },
  };
  const app = createApp(storage);

  const first = await request(app).post('/api/item-service-prices').send({
    clothingItemId: 'item1',
    serviceId: 'service1',
    price: '1.00',
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.price, '1.00');

  const second = await request(app).post('/api/item-service-prices').send({
    clothingItemId: 'item1',
    serviceId: 'service1',
    price: '2.50',
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.price, '2.50');
});

