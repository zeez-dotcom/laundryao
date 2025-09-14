import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { insertOrderSchema } from '@shared/schema';

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
  app.post('/api/orders', requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { packageUsage, cartItems, customerId, branchCode, ...data } = req.body;
      if (!Array.isArray(cartItems) || cartItems.length === 0 || !customerId || !branchCode) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      const orderData = insertOrderSchema.parse({ ...data, items: cartItems, customerId });
      if (packageUsage) {
        const pkgs = await storage.getCustomerPackagesWithUsage(customerId);
        const pkg = pkgs.find((p: any) => p.id === packageUsage.packageId);
        if (!pkg) {
          return res.status(400).json({ message: 'Invalid package' });
        }
        for (const item of packageUsage.items || []) {
          const pkgItem = pkg.items?.find(
            (i: any) =>
              i.serviceId === item.serviceId &&
              i.clothingItemId === item.clothingItemId,
          );
          if (!pkgItem || pkgItem.balance < item.quantity) {
            return res.status(400).json({ message: 'Insufficient package credits' });
          }
        }
        for (const item of packageUsage.items || []) {
          const price = await storage.getItemServicePrice(
            item.clothingItemId,
            item.serviceId,
            user.id,
            user.branchId,
          );
          await storage.updateCustomerPackageBalance(
            packageUsage.packageId,
            -(price ?? 0) * item.quantity,
            item.serviceId,
            item.clothingItemId,
          );
        }
      }
      const order = await storage.createOrder({ ...orderData, branchId: user.branchId });
      res.json(order);
    } catch {
      res.status(400).json({ message: 'Failed to create order' });
    }
  });
  return app;
}

function createCustomerOrdersApp(storage: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: 'u1', branchId: 'b1' };
    next();
  });
  app.get('/api/customers/:customerId/orders', requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const orders = await storage.getOrdersByCustomer(req.params.customerId, user.branchId);
      res.json(
        orders.map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
          subtotal: o.subtotal,
          paid: o.paid,
          remaining: o.remaining,
        })),
      );
    } catch {
      res.status(500).json({ message: 'Failed to fetch customer orders' });
    }
  });
  return app;
}

test('accepts ISO string dates for pickup fields', async () => {
  let received: any = null;
  const storage = {
    createOrder: async (data: any) => {
      received = data;
      return { id: 'o1', ...data };
    },
  };
  const app = createApp(storage);
  const iso1 = new Date().toISOString();
  const iso2 = new Date(Date.now() + 3600_000).toISOString();
  const res = await request(app)
    .post('/api/orders')
    .send({
      cartItems: [{ id: 'i1', clothingItem: 'Shirt', service: 'Wash', quantity: 1, price: 1, total: 1 }],
      customerId: 'c1',
      branchCode: 'b1',
      customerName: 'Alice',
      customerPhone: '123',
      subtotal: '0',
      tax: '0',
      total: '0',
      paymentMethod: 'cash',
      status: 'start_processing',
      sellerName: 'Bob',
      estimatedPickup: iso1,
      actualPickup: iso2,
    });
  assert.equal(res.status, 200);
  assert.ok(received);
  assert(received.estimatedPickup instanceof Date);
  assert(received.actualPickup instanceof Date);
  assert.equal(received.estimatedPickup.toISOString(), iso1);
  assert.equal(received.actualPickup.toISOString(), iso2);
});

test('pay-later order remaining decreases with payments', async () => {
  const storage = (() => {
    const orders = [
      {
        id: 'o1',
        orderNumber: '001',
        customerId: 'c1',
        createdAt: new Date().toISOString(),
        subtotal: '100.00',
        total: '100.00',
      },
    ];
    const payments: any[] = [];
    return {
      orders,
      payments,
      async getOrdersByCustomer() {
        return orders.map((o) => {
          const paid = payments
            .filter((p) => p.orderId === o.id)
            .reduce((sum, p) => sum + Number(p.amount), 0);
          const remaining = Number(o.total) - paid;
          return {
            ...o,
            paid: paid.toFixed(2),
            remaining: remaining.toFixed(2),
          };
        });
      },
    };
  })();

  const app = createCustomerOrdersApp(storage);

  let res = await request(app).get('/api/customers/c1/orders');
  assert.equal(res.status, 200);
  assert.equal(res.body[0].paid, '0.00');
  assert.equal(res.body[0].remaining, '100.00');

  storage.payments.push({ id: 'p1', orderId: 'o1', amount: '40.00' });

  res = await request(app).get('/api/customers/c1/orders');
  assert.equal(res.status, 200);
  assert.equal(res.body[0].paid, '40.00');
  assert.equal(res.body[0].remaining, '60.00');
});

test('defaults promised ready fields', async () => {
  let received: any = null;
  const storage = {
    createOrder: async (data: any) => {
      received = data;
      return { id: 'o1', ...data };
    },
  };
  const app = createApp(storage);
  const res = await request(app)
    .post('/api/orders')
    .send({
      cartItems: [{ id: 'i1', clothingItem: 'Shirt', service: 'Wash', quantity: 1, price: 1, total: 1 }],
      customerId: 'c1',
      branchCode: 'b1',
      customerName: 'Bob',
      customerPhone: '456',
      subtotal: '0',
      tax: '0',
      total: '0',
      paymentMethod: 'cash',
      status: 'start_processing',
      sellerName: 'Sue',
    });
  assert.equal(res.status, 200);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(received.promisedReadyOption, 'tomorrow');
  assert.equal(
    new Date(received.promisedReadyDate).toDateString(),
    tomorrow.toDateString(),
  );
});

test('stores provided promised ready fields', async () => {
  let received: any = null;
  const storage = {
    createOrder: async (data: any) => {
      received = data;
      return { id: 'o2', ...data };
    },
  };
  const app = createApp(storage);
  const date = new Date();
  date.setDate(date.getDate() + 2);
  const res = await request(app)
    .post('/api/orders')
    .send({
      cartItems: [{ id: 'i1', clothingItem: 'Shirt', service: 'Wash', quantity: 1, price: 1, total: 1 }],
      customerId: 'c1',
      branchCode: 'b1',
      customerName: 'Carol',
      customerPhone: '789',
      subtotal: '0',
      tax: '0',
      total: '0',
      paymentMethod: 'cash',
      status: 'start_processing',
      sellerName: 'Dan',
      promisedReadyOption: 'day_after_tomorrow',
      promisedReadyDate: date.toISOString(),
    });
  assert.equal(res.status, 200);
  assert.equal(received.promisedReadyOption, 'day_after_tomorrow');
  assert.equal(received.promisedReadyDate, date.toISOString());
});

test('deducts package credits when provided', async () => {
  let updated: any = null;
  const storage: any = {
    createOrder: async (data: any) => ({ id: 'o1', ...data }),
    getCustomerPackagesWithUsage: async () => [
      {
        id: 'cp1',
        packageId: 'pkg1',
        balance: 5,
        nameEn: 'Everyday',
        nameAr: null,
        totalCredits: 5,
        items: [{ serviceId: 's1', clothingItemId: 'c1', balance: 5, totalCredits: 5 }],
      },
    ],
    updateCustomerPackageBalance: async (
      id: string,
      change: number,
      serviceId?: string,
      clothingItemId: string,
    ) => {
      updated = { id, change, serviceId, clothingItemId };
    },
    getItemServicePrice: async () => 1,
  };
  const app = createApp(storage);

  const res = await request(app)
    .post('/api/orders')
    .send({
      cartItems: [{ id: 'i1', clothingItem: 'Shirt', service: 'Wash', quantity: 2, price: 1, total: 2 }],
      customerId: 'cust1',
      branchCode: 'b1',
      customerName: 'Ann',
      customerPhone: '123',
      subtotal: '2',
      tax: '0',
      total: '2',
      paymentMethod: 'cash',
      status: 'start_processing',
      sellerName: 'Bob',
      packageUsage: { packageId: 'cp1', items: [{ serviceId: 's1', clothingItemId: 'c1', quantity: 2 }] },
    });
  assert.equal(res.status, 200);
  assert.deepEqual(updated, { id: 'cp1', change: -2, serviceId: 's1', clothingItemId: 'c1' });
});

test('accepts package usage with clothing item', async () => {
  let updated: any;
  const storage: any = {
    createOrder: async (data: any) => ({ id: 'o1', ...data }),
    getCustomerPackagesWithUsage: async () => [
      {
        id: 'cp1',
        packageId: 'pkg1',
        balance: 5,
        nameEn: 'Everyday',
        nameAr: null,
        totalCredits: 5,
        items: [{ serviceId: 's1', clothingItemId: 'ci1', balance: 5, totalCredits: 5 }],
      },
    ],
    updateCustomerPackageBalance: async (
      id: string,
      change: number,
      serviceId?: string,
      clothingItemId: string,
    ) => {
      updated = { id, change, serviceId, clothingItemId };
    },
    getItemServicePrice: async () => 1,
  };
  const app = createApp(storage);

  const res = await request(app)
    .post('/api/orders')
    .send({
      cartItems: [{ id: 'i1', clothingItem: 'Shirt', service: 'Wash', quantity: 2, price: 1, total: 2 }],
      customerId: 'cust1',
      branchCode: 'b1',
      customerName: 'Ann',
      customerPhone: '123',
      subtotal: '2',
      tax: '0',
      total: '2',
      paymentMethod: 'cash',
      status: 'start_processing',
      sellerName: 'Bob',
      packageUsage: { packageId: 'cp1', items: [{ serviceId: 's1', clothingItemId: 'ci1', quantity: 2 }] },
    });
  assert.equal(res.status, 200);
  assert.deepEqual(updated, { id: 'cp1', change: -2, serviceId: 's1', clothingItemId: 'ci1' });
});

test('rejects package usage when service-product pair is invalid', async () => {
  const storage: any = {
    createOrder: async (data: any) => ({ id: 'o1', ...data }),
    getCustomerPackagesWithUsage: async () => [
      {
        id: 'cp1',
        packageId: 'pkg1',
        balance: 5,
        nameEn: 'Everyday',
        nameAr: null,
        totalCredits: 5,
        items: [{ serviceId: 's1', clothingItemId: 'c1', balance: 5, totalCredits: 5 }],
      },
    ],
    updateCustomerPackageBalance: async () => {
      throw new Error('should not be called');
    },
    getItemServicePrice: async () => 1,
  };
  const app = createApp(storage);
  const res = await request(app)
    .post('/api/orders')
    .send({
      cartItems: [{ id: 'i1', clothingItem: 'Shirt', service: 'Wash', quantity: 1, price: 1, total: 1 }],
      customerId: 'c1',
      branchCode: 'b1',
      customerName: 'Alice',
      customerPhone: '123',
      subtotal: '0',
      tax: '0',
      total: '2',
      paymentMethod: 'cash',
      status: 'start_processing',
      sellerName: 'Bob',
      packageUsage: { packageId: 'cp1', items: [{ serviceId: 's1', clothingItemId: 'c2', quantity: 1 }] },
    });
  assert.equal(res.status, 400);
});

