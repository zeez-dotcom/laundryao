import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
const { requireAdminOrSuperAdmin } = await import('./auth');

function createApp(storage: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: 'u1', role: 'admin' };
    next();
  });
  app.get('/api/order-logs', requireAdminOrSuperAdmin, async (req, res) => {
    const status = req.query.status as string | undefined;
    const logs = await storage.getOrderLogs(status);
    res.json(logs);
  });
  return app;
}

test('returns order logs with expected shape', async () => {
  const logs = [
    {
      id: '1',
      orderNumber: '001',
      customerName: 'Alice',
      packageName: 'Basic',
      status: 'ready',
      statusHistory: [],
      receivedAt: '2023-01-01T00:00:00.000Z',
      processedAt: null,
      readyAt: null,
      deliveredAt: null,
    },
  ];
  const storage = {
    getOrderLogs: async (_status?: string) => logs,
  };
  const app = createApp(storage);
  const res = await request(app).get('/api/order-logs');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].orderNumber, '001');
  assert.ok('receivedAt' in res.body[0]);
});

test('filters order logs by status', async () => {
  const logs = [
    {
      id: '1',
      orderNumber: '001',
      customerName: 'Alice',
      packageName: 'Basic',
      status: 'ready',
      statusHistory: [],
      receivedAt: '2023-01-01T00:00:00.000Z',
      processedAt: null,
      readyAt: null,
      deliveredAt: null,
    },
    {
      id: '2',
      orderNumber: '002',
      customerName: 'Bob',
      packageName: 'Premium',
      status: 'delivered',
      statusHistory: [],
      receivedAt: '2023-01-01T00:00:00.000Z',
      processedAt: null,
      readyAt: null,
      deliveredAt: '2023-01-04T00:00:00.000Z',
    },
  ];
  const storage = {
    getOrderLogs: async (status?: string) =>
      status ? logs.filter((l) => l.status === status) : logs,
  };
  const app = createApp(storage);
  const res = await request(app).get('/api/order-logs?status=ready');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, 'ready');
});

test('returns unique orders when customer has multiple packages', async () => {
  const logs = [
    {
      id: '1',
      orderNumber: '001',
      customerName: 'Alice',
      packageName: 'Basic',
      status: 'ready',
      statusHistory: [],
      receivedAt: '2023-01-01T00:00:00.000Z',
      processedAt: null,
      readyAt: null,
      deliveredAt: null,
    },
    {
      id: '1',
      orderNumber: '001',
      customerName: 'Alice',
      packageName: 'Premium',
      status: 'ready',
      statusHistory: [],
      receivedAt: '2023-01-01T00:00:00.000Z',
      processedAt: null,
      readyAt: null,
      deliveredAt: null,
    },
  ];
  const storage = {
    getOrderLogs: async () => {
      const map = new Map<string, any>();
      for (const log of logs) {
        if (!map.has(log.id)) {
          map.set(log.id, log);
        }
      }
      return Array.from(map.values());
    },
  };
  const app = createApp(storage);
  const res = await request(app).get('/api/order-logs');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].packageName, 'Basic');
});
