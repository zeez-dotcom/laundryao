import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { storage } = await import('./storage');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const customerId = req.header('X-Customer-Id');
    (req.session as any) = {};
    if (customerId) (req.session as any).customerId = customerId;
    next();
  });

  app.post('/api/chatbot', async (req, res) => {
    const customerId = (req.session as any).customerId as string | undefined;
    if (!customerId) return res.status(401).json({ message: 'Login required' });
    const message = String(req.body?.message || '').toLowerCase();
    try {
      if (message.includes('package')) {
        const packages = await storage.getCustomerPackagesWithUsage(customerId);
        return res.json({ reply: 'Here are your packages', packages });
      }
      if (message.includes('order')) {
        let orders = await storage.getOrdersByCustomer(customerId);
        orders = orders
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10)
          .map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            createdAt: o.createdAt,
            itemCount: Array.isArray(o.items)
              ? o.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
              : 0,
            subtotal: o.subtotal,
            paid: o.paid,
            remaining: o.remaining,
          }));
        return res.json({ reply: 'Here is your recent order history', orders });
      }
      return res.json({ reply: 'I can help show your packages or order history.' });
    } catch {
      res.status(500).json({ message: 'Failed to process request' });
    }
  });

  return app;
}

test('chatbot returns packages for authenticated customer', async () => {
  const mockPackages = [{ id: 'pkg1' }];
  const origGetPackages = storage.getCustomerPackagesWithUsage;
  storage.getCustomerPackagesWithUsage = async (id: string) => (id === 'cust1' ? mockPackages : []);
  try {
    const app = createApp();
    const res = await request(app)
      .post('/api/chatbot')
      .set('X-Customer-Id', 'cust1')
      .send({ message: 'show my packages' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.packages, mockPackages);
  } finally {
    storage.getCustomerPackagesWithUsage = origGetPackages;
  }
});

test('chatbot returns order history with counts', async () => {
  const mockOrders = [
    { id: 'o1', orderNumber: 'A1', createdAt: '2024-01-01', items: [{ quantity: 2 }, { quantity: 1 }], subtotal: '5', paid: '0', remaining: '5' }
  ];
  const origGetOrders = storage.getOrdersByCustomer;
  storage.getOrdersByCustomer = async (id: string) => (id === 'cust1' ? mockOrders : []);
  try {
    const app = createApp();
    const res = await request(app)
      .post('/api/chatbot')
      .set('X-Customer-Id', 'cust1')
      .send({ message: 'order history' });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.orders));
    assert.equal(res.body.orders[0].itemCount, 3);
  } finally {
    storage.getOrdersByCustomer = origGetOrders;
  }
});

test('chatbot rejects unauthenticated requests', async () => {
  const app = createApp();
  const res = await request(app).post('/api/chatbot').send({ message: 'show my packages' });
  assert.equal(res.status, 401);
});
