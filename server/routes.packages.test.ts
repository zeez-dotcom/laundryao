import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { insertPackageSchema } from '@shared/schema';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireAuth, requireAdminOrSuperAdmin } = await import('./auth');

function createApp(storage: any, user: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = user;
    next();
  });

  app.get('/api/packages', requireAuth, async (req: any, res) => {
    const u = req.user;
    const branchId = u.role === 'super_admin' ? req.query.branchId : u.branchId;
    if (!branchId) return res.status(400).json({ message: 'branchId required' });
    const pkgs = await storage.getPackages(branchId);
    res.json(pkgs);
  });

  app.get('/api/packages/:id', requireAuth, async (req: any, res) => {
    const u = req.user;
    const branchId = u.role === 'super_admin' ? req.query.branchId : u.branchId;
    if (!branchId) return res.status(400).json({ message: 'branchId required' });
    const pkg = await storage.getPackage(req.params.id, branchId);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    res.json(pkg);
  });

  app.post('/api/packages', requireAdminOrSuperAdmin, async (req: any, res) => {
    try {
      const u = req.user;
      const data = u.role === 'super_admin' ? req.body : { ...req.body, branchId: u.branchId };
      const parsed = insertPackageSchema.parse(data);
      const pkg = await storage.createPackage(parsed);
      res.json(pkg);
    } catch {
      res.status(400).json({ message: 'Invalid package data' });
    }
  });

  return app;
}

test('super admins must specify branchId and packages are scoped to branch', async () => {
  let captured: string | null = null;
  const storage = {
    getPackages: async (branchId: string) => {
      captured = branchId;
      return [{ id: 'p1', branchId, packageItems: [] }];
    },
    getPackage: async () => null,
    createPackage: async (data: any) => data,
  };
  const app = createApp(storage, { id: 'u1', role: 'super_admin' });

  const resMissing = await request(app).get('/api/packages');
  assert.equal(resMissing.status, 400);

  const resCreateMissing = await request(app)
    .post('/api/packages')
    .send({ nameEn: 'New', price: '5' });
  assert.equal(resCreateMissing.status, 400);

  const resList = await request(app).get('/api/packages').query({ branchId: 'b1' });
  assert.equal(resList.status, 200);
  assert.equal(captured, 'b1');

  const resCreate = await request(app)
    .post('/api/packages')
    .send({ nameEn: 'New', price: '5', branchId: 'b1', packageItems: [] });
  assert.equal(resCreate.status, 200);
  assert.equal(resCreate.body.branchId, 'b1');
});

test("branch users cannot access others' packages", async () => {
  const storage = {
    getPackages: async (branchId: string) => [{ id: 'p1', branchId, packageItems: [] }],
    getPackage: async (id: string, branchId: string) =>
      branchId === 'b1' && id === 'p1' ? { id: 'p1', branchId, packageItems: [] } : undefined,
    createPackage: async (data: any) => data,
  };
  const app = createApp(storage, { id: 'u2', role: 'admin', branchId: 'b1' });

  const listRes = await request(app).get('/api/packages');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body[0].branchId, 'b1');

  const otherRes = await request(app).get('/api/packages/p2');
  assert.equal(otherRes.status, 404);
});
