import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { validateDriverToken, issueDriverToken } = await import('./auth');
const { storage } = await import('./storage');

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/delivery/my-orders', validateDriverToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const orders = await (storage as any).getDeliveryOrdersByDriver(
        user.id,
        user.branchId,
      );
      res.json(orders);
    } catch {
      res.status(500).json({ message: 'Failed to fetch delivery orders' });
    }
  });
  return app;
}

test('driver receives only their assigned delivery orders', async () => {
  const calls: Array<[string, string | undefined]> = [];
  const fakeOrders = [{ orderId: 'o1', status: 'dispatched' }];

  (storage as any).getDeliveryOrdersByDriver = async (
    driverId: string,
    branchId?: string,
  ) => {
    calls.push([driverId, branchId]);
    return fakeOrders;
  };

  (storage as any).getUser = async (id: string) => ({
    id,
    role: 'driver',
    branchId: 'b1',
  });

  const app = createApp();
  const token = issueDriverToken('d1');
  const res = await request(app)
    .get('/api/delivery/my-orders')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, fakeOrders);
  assert.deepEqual(calls, [['d1', 'b1']]);
});

