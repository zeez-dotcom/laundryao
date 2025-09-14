import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

import { insertLaundryServiceSchema } from '@shared/schema';

function createApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/laundry-services', (req, res) => {
    try {
      insertLaundryServiceSchema.parse(req.body);
      res.json({ ok: true });
    } catch {
      res.status(400).json({ message: 'Invalid data' });
    }
  });
  return app;
}

test('rejects empty or non-numeric price', async () => {
  const app = createApp();
  const base = { name: 'Wash', categoryId: 'cat1' };
  const r1 = await request(app)
    .post('/api/laundry-services')
    .send({ ...base, price: '' });
  assert.equal(r1.status, 400);
  const r2 = await request(app)
    .post('/api/laundry-services')
    .send({ ...base, price: 'abc' });
  assert.equal(r2.status, 400);
});
