import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { requireAdminOrSuperAdmin } = await import('./auth');
const { storage } = await import('./storage');

// Minimal customer object for stubs
const customerStub = {
  id: 'cust1',
  phoneNumber: '123',
  name: 'Test',
  branchId: 'b1',
  balanceDue: '0',
  totalSpent: '0',
  loyaltyPoints: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { role: 'admin', branchId: 'b1' };
    next();
  });

  // Import the same route logic as in routes.ts
  app.put('/api/customers/:id/password', requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      const branchId = user.role === 'super_admin' ? undefined : user.branchId;
      const { password } = req.body as { password: string };
      const existing = await storage.getCustomer(req.params.id, branchId);
      if (!existing) {
        return res.status(404).json({ message: 'Customer not found' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      await storage.updateCustomerPassword(req.params.id, passwordHash);
      res.json({ message: 'Password updated' });
    } catch (err) {
      res.status(500).json({ message: 'Failed to update password' });
    }
  });

  return app;
}

test('PUT /api/customers/:id/password updates password', async () => {
  let called: any = null;
  const originalGet = storage.getCustomer;
  const originalUpdate = storage.updateCustomerPassword;
  try {
    storage.getCustomer = async (id: string, _branchId?: string) => {
      return id === customerStub.id ? customerStub : undefined;
    };
    storage.updateCustomerPassword = async (id: string, passwordHash: string) => {
      called = { id, passwordHash };
      return { ...customerStub, id } as any;
    };

    const app = createApp();
    const res = await request(app)
      .put(`/api/customers/${customerStub.id}/password`)
      .send({ password: 'newpass99' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Password updated' });
    assert.equal(called.id, customerStub.id);
    assert.ok(await bcrypt.compare('newpass99', called.passwordHash));
  } finally {
    storage.getCustomer = originalGet;
    storage.updateCustomerPassword = originalUpdate;
  }
});
