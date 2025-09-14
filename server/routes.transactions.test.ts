import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { insertTransactionSchema } from '@shared/schema';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
const { requireAuth } = await import('./auth');

function createApp(storage: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: 'u1', branchId: 'b1' };
    next();
  });
  app.post('/api/transactions', requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { customerId, customerName, customerPhone, ...transactionData } = req.body;
      const validated = insertTransactionSchema.parse(transactionData);
      let orderId = validated.orderId;
      if (!orderId) {
        const order = await storage.createOrder({
          customerId,
          customerName: customerName || 'Walk-in',
          customerPhone: customerPhone || '',
          items: validated.items,
          subtotal: validated.subtotal,
          tax: validated.tax,
          total: validated.total,
          paymentMethod: validated.paymentMethod,
          status: 'handed_over',
          sellerName: validated.sellerName,
          branchId: user.branchId,
        });
        orderId = order.id;
      }
      const tx = await storage.createTransaction({
        ...validated,
        branchId: user.branchId,
        orderId,
      });
      res.json(tx);
    } catch {
      res.status(400).json({ message: 'Failed to create transaction' });
    }
  });
  return app;
}

test('creates order when posting transaction without orderId', async () => {
  let createdOrder: any = null;
  let createdTransaction: any = null;
  const storage = {
    createOrder: async (data: any) => {
      createdOrder = data;
      return { id: 'o1', ...data };
    },
    createTransaction: async (data: any) => {
      createdTransaction = data;
      return { id: 't1', ...data };
    },
  };
  const app = createApp(storage);
  const res = await request(app)
    .post('/api/transactions')
    .send({
      items: [],
      subtotal: '0',
      tax: '0',
      total: '0',
      paymentMethod: 'cash',
      sellerName: 'Alice',
      customerName: 'Bob',
      customerPhone: '123',
    });
  assert.equal(res.status, 200);
  assert.ok(createdOrder);
  assert.equal(createdOrder.branchId, 'b1');
  assert.equal(createdOrder.status, 'handed_over');
  assert.equal(createdOrder.paymentMethod, 'cash');
  assert.equal(createdTransaction.orderId, 'o1');
});
