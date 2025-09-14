import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireAuth } = await import('./auth');

const DELIVERY_STATUS_TRANSITIONS = {
  pending: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
} as const;

type DeliveryStatus = keyof typeof DELIVERY_STATUS_TRANSITIONS;

function createApp(user: any, current: any, storage: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = user;
    next();
  });
  app.patch('/api/delivery-orders/:id/status', requireAuth, async (req, res) => {
    try {
      const { status } = req.body as { status?: DeliveryStatus };
      if (!status) {
        return res.status(400).json({ message: 'Status required' });
      }
      if (!current) {
        return res.status(404).json({ message: 'Delivery order not found' });
      }
      if (user.role !== 'super_admin' && current.order.branchId !== user.branchId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const allowed = DELIVERY_STATUS_TRANSITIONS[current.delivery.deliveryStatus as DeliveryStatus];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: 'Invalid status transition' });
      }
      const updated = await storage.updateDeliveryStatus(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ message: 'Delivery order not found' });
      }
      res.json(updated);
    } catch {
      res.status(500).json({ message: 'Failed to update delivery status' });
    }
  });
  return app;
}

test('allows driver from same branch to update delivery status', async () => {
  let called = false;
  const storage = {
    updateDeliveryStatus: async (_id: string, status: DeliveryStatus) => {
      called = true;
      return { orderId: 'o1', deliveryStatus: status };
    },
  };
  const current = { order: { branchId: 'b1' }, delivery: { deliveryStatus: 'pending' } };
  const app = createApp({ id: 'u1', role: 'driver', branchId: 'b1' }, current, storage);
  const res = await request(app)
    .patch('/api/delivery-orders/o1/status')
    .send({ status: 'assigned' });
  assert.equal(res.status, 200);
  assert.equal(res.body.deliveryStatus, 'assigned');
  assert.ok(called);
});

test('rejects user from different branch', async () => {
  let called = false;
  const storage = {
    updateDeliveryStatus: async (_id: string, status: DeliveryStatus) => {
      called = true;
      return { orderId: 'o1', deliveryStatus: status };
    },
  };
  const current = { order: { branchId: 'b1' }, delivery: { deliveryStatus: 'pending' } };
  const app = createApp({ id: 'u2', role: 'driver', branchId: 'b2' }, current, storage);
  const res = await request(app)
    .patch('/api/delivery-orders/o1/status')
    .send({ status: 'assigned' });
  assert.equal(res.status, 403);
  assert.ok(!called);
});
