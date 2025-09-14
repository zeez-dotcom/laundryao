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

  app.get('/customer/orders', async (req, res) => {
    const customerId = (req.session as any).customerId as string | undefined;
    if (!customerId) return res.status(401).json({ message: 'Login required' });
    try {
      let orders = await storage.getOrdersByCustomer(customerId);
      orders = orders
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);
      const mapped = orders.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        subtotal: o.subtotal,
        paid: o.paid,
        remaining: o.remaining,
      }));
      res.json(mapped);
    } catch {
      res.status(500).json({ message: 'Failed to fetch orders' });
    }
  });

  app.get('/customer/orders/:id/receipt', async (req, res) => {
    const customerId = (req.session as any).customerId as string | undefined;
    if (!customerId) return res.status(401).json({ message: 'Login required' });
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order || order.customerId !== customerId) {
        return res.status(404).json({ message: 'Order not found' });
      }
      let packages: any[] = [];
      try {
        packages = await storage.getCustomerPackagesWithUsage(order.customerId);
      } catch {}
      res.json({ ...order, packages });
    } catch {
      res.status(500).json({ message: 'Failed to fetch order' });
    }
  });

  return app;
}

test('GET /customer/orders returns only session customer orders', async () => {
  const orders1 = [{ id: 'o1', orderNumber: 'A1', createdAt: '2024-01-01', subtotal: '5', paid: '0', remaining: '5' }];
  const orders2 = [{ id: 'o2', orderNumber: 'B1', createdAt: '2024-01-02', subtotal: '10', paid: '10', remaining: '0' }];
  const original = storage.getOrdersByCustomer;
  storage.getOrdersByCustomer = async (id: string) => (id === 'cust1' ? orders1 : orders2);
  try {
    const app = createApp();
    const res1 = await request(app).get('/customer/orders').set('X-Customer-Id', 'cust1');
    assert.equal(res1.status, 200);
    assert.deepEqual(res1.body, orders1);

    const res2 = await request(app).get('/customer/orders');
    assert.equal(res2.status, 401);
  } finally {
    storage.getOrdersByCustomer = original;
  }
});

test('GET /customer/orders/:id/receipt enforces ownership and auth', async () => {
  const order1 = {
    id: 'o1',
    customerId: 'cust1',
    orderNumber: 'A1',
    items: [],
    subtotal: '5',
    tax: '0',
    total: '5',
    paymentMethod: 'cash',
    sellerName: 's',
    branchId: 'b1',
    createdAt: '2024-01-01',
  };
  const order2 = { ...order1, id: 'o2', customerId: 'cust2' };
  const origGetOrder = storage.getOrder;
  const origGetPackages = storage.getCustomerPackagesWithUsage;
  storage.getOrder = async (id: string) => (id === 'o1' ? order1 : order2);
  storage.getCustomerPackagesWithUsage = async () => [{ id: 'pkg1' }];
  try {
    const app = createApp();
    const res1 = await request(app).get('/customer/orders/o1/receipt').set('X-Customer-Id', 'cust1');
    assert.equal(res1.status, 200);
    assert.equal(res1.body.id, 'o1');
    assert.ok(Array.isArray(res1.body.packages));

    const res2 = await request(app).get('/customer/orders/o1/receipt').set('X-Customer-Id', 'cust2');
    assert.equal(res2.status, 404);

    const res3 = await request(app).get('/customer/orders/o1/receipt');
    assert.equal(res3.status, 401);
  } finally {
    storage.getOrder = origGetOrder;
    storage.getCustomerPackagesWithUsage = origGetPackages;
  }
});
