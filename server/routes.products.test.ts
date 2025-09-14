import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { insertProductSchema, type ItemType } from '@shared/schema';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireAuth, requireAdminOrSuperAdmin } = await import('./auth');

function createApp(
  storage: any,
  opts: { authenticated?: boolean; user?: any } = {},
) {
  const app = express();
  const {
    authenticated = true,
    user = { id: 'u1', branchId: 'b1', role: 'admin' },
  } = opts;
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => authenticated;
    if (authenticated) {
      req.user = user;
    }
    next();
  });

  app.get('/api/products', async (req, res, next) => {
    const branchCode = req.query.branchCode as string | undefined;
    if (!branchCode) return next();
    try {
      const branch = await storage.getBranchByCode(branchCode);
      if (!branch) return res.status(404).json({ message: 'Branch not found' });
      const categoryId = req.query.categoryId as string;
      const search = req.query.search as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const itemType = req.query.itemType as ItemType | undefined;
      const result = categoryId
        ? await storage.getProductsByCategory(categoryId, branch.id, search, limit, offset, itemType)
        : await storage.getProducts(branch.id, search, limit, offset, itemType);
      res.json(result);
    } catch {
      res.status(500).json({ message: 'Failed to fetch products' });
    }
  }, requireAuth, async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string;
      const search = req.query.search as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const itemType = req.query.itemType as ItemType | undefined;
      const user = req.user as any;
      const branchId =
        user.branchId ??
        (user.role === 'super_admin'
          ? (req.query.branchId as string | undefined)
          : undefined);
      if (!branchId) return res.status(400).json({ message: 'branchId is required' });
      const result = categoryId
        ? await storage.getProductsByCategory(categoryId, branchId, search, limit, offset, itemType)
        : await storage.getProducts(branchId, search, limit, offset, itemType);
      res.json(result);
    } catch {
      res.status(500).json({ message: 'Failed to fetch products' });
    }
  });

  app.post('/api/products', requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      const branchId =
        user.branchId ?? (user.role === 'super_admin' ? req.body.branchId : undefined);
      if (!branchId) {
        return res.status(400).json({ message: 'branchId is required' });
      }
      const validated = insertProductSchema.parse(req.body);
      const product = await storage.createProduct({ ...validated, branchId });
      res.json(product);
    } catch {
      res.status(500).json({ message: 'Failed to create product' });
    }
  });

  app.put('/api/products/:id', requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const branchId =
        user.branchId ?? (user.role === 'super_admin' ? req.body.branchId : undefined);
      if (!branchId) {
        return res.status(400).json({ message: 'branchId is required' });
      }
      const validated = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(id, validated, branchId);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      res.json(product);
    } catch {
      res.status(500).json({ message: 'Failed to update product' });
    }
  });

  return app;
}

test('GET /api/products filters by search and category', async () => {
  const products = [
    { id: 'p1', name: 'Soap', description: 'Hand soap', categoryId: 'c1' },
    { id: 'p2', name: 'Shampoo', description: 'Hair cleaner', categoryId: 'c2' },
  ];
  const storage = {
    getProducts: async (_branchId: string, search?: string) => {
      let items = products;
      if (search) {
        const term = search.toLowerCase();
        items = items.filter(
          p =>
            p.name.toLowerCase().includes(term) ||
            p.description?.toLowerCase().includes(term),
        );
      }
      return { items, total: items.length };
    },
    getProductsByCategory: async (categoryId: string, _branchId: string, search?: string) => {
      let items = products.filter(p => p.categoryId === categoryId);
      if (search) {
        const term = search.toLowerCase();
        items = items.filter(
          p =>
            p.name.toLowerCase().includes(term) ||
            p.description?.toLowerCase().includes(term),
        );
      }
      return { items, total: items.length };
    },
    createProduct: async (_data: any) => ({})
  };
  const app = createApp(storage);
  const res1 = await request(app).get('/api/products').query({ search: 'soap' });
  assert.equal(res1.status, 200);
  assert.deepEqual(res1.body, { items: [products[0]], total: 1 });

  const res2 = await request(app).get('/api/products').query({ categoryId: 'c2' });
  assert.equal(res2.status, 200);
  assert.deepEqual(res2.body, { items: [products[1]], total: 1 });
});

test('GET /api/products filters by itemType', async () => {
  const products = [
    { id: 'p1', name: 'Soap', itemType: 'everyday' },
    { id: 'p2', name: 'Premium Soap', itemType: 'premium' },
  ];
  const storage = {
    getProducts: async (
      _branchId: string,
      _s?: string,
      _l?: number,
      _o?: number,
      itemType?: ItemType,
    ) => {
      let items = products;
      if (itemType) items = items.filter((p) => p.itemType === itemType);
      return { items, total: items.length };
    },
    getProductsByCategory: async () => ({ items: [], total: 0 }),
    createProduct: async (_d: any) => ({}),
    getBranchByCode: async () => ({ id: 'b1' }),
  } as any;
  const app = createApp(storage);
  const res = await request(app).get('/api/products').query({ itemType: 'premium' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { items: [products[1]], total: 1 });
});

test('POST /api/products attaches user branchId', async () => {
  let created: any = null;
  const storage = {
    createProduct: async (data: any) => {
      created = data;
      return { id: 'p1', ...data };
    },
    getProducts: async (_branchId: string, _s?: string, _l?: number, _o?: number) => ({ items: [], total: 0 }),
    getProductsByCategory: async (
      _categoryId: string,
      _branchId: string,
      _s?: string,
      _l?: number,
      _o?: number,
    ) => ({ items: [], total: 0 }),
  };
  const app = createApp(storage);
  const res = await request(app)
    .post('/api/products')
    .send({ name: 'Soap', price: '1.00', stock: 2 });
  assert.equal(res.status, 200);
  assert.ok(created);
  assert.equal(created.branchId, 'b1');
});

test('GET /api/products allows anonymous access with branchCode', async () => {
  const products = [{ id: 'p1', name: 'Soap', description: 'Hand soap', categoryId: 'c1' }];
  const storage = {
    getBranchByCode: async (code: string) => (code === 'BR1' ? { id: 'b1', code: 'BR1' } : undefined),
    getProducts: async (branchId: string) => ({ items: branchId === 'b1' ? products : [], total: branchId === 'b1' ? products.length : 0 }),
    getProductsByCategory: async (_categoryId: string, _branchId: string) => ({ items: [], total: 0 }),
    createProduct: async (_data: any) => ({}),
  };
  const app = createApp(storage, { authenticated: false });
  const res = await request(app).get('/api/products').query({ branchCode: 'BR1' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { items: products, total: 1 });
});

test('GET /api/products requires branchId for super admin', async () => {
  const storage = {
    getBranchByCode: async () => undefined,
    getProducts: async () => ({ items: [], total: 0 }),
    getProductsByCategory: async () => ({ items: [], total: 0 }),
    createProduct: async (_data: any) => ({}),
  };
  const app = createApp(storage, {
    user: { id: 'sa1', role: 'super_admin', branchId: null },
  });
  const res = await request(app).get('/api/products');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: 'branchId is required' });
});

test('GET /api/products with branchId returns branch products for super admin', async () => {
  const products = [
    { id: 'p1', name: 'A', branchId: 'b1' },
    { id: 'p2', name: 'B', branchId: 'b2' },
  ];
  const storage = {
    getBranchByCode: async () => undefined,
    getProducts: async (branchId: string) => ({
      items: products.filter((p) => p.branchId === branchId),
      total: products.filter((p) => p.branchId === branchId).length,
    }),
    getProductsByCategory: async () => ({ items: [], total: 0 }),
    createProduct: async (_data: any) => ({}),
  };
  const app = createApp(storage, {
    user: { id: 'sa1', role: 'super_admin', branchId: null },
  });
  const res = await request(app)
    .get('/api/products')
    .query({ branchId: 'b2' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    items: [products[1]],
    total: 1,
  });
});

test('POST /api/products requires branchId for super admin', async () => {
  const storage = {
    createProduct: async (_d: any) => ({}),
  } as any;
  const app = createApp(storage, {
    user: { id: 'sa1', role: 'super_admin', branchId: null },
  });
  const res = await request(app)
    .post('/api/products')
    .send({ name: 'Soap', price: '1', stock: 2 });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: 'branchId is required' });
});

test('POST /api/products allows super admin with branchId', async () => {
  let created: any = null;
  const storage = {
    createProduct: async (d: any) => {
      created = d;
      return { id: 'p1', ...d };
    },
  } as any;
  const app = createApp(storage, {
    user: { id: 'sa1', role: 'super_admin', branchId: null },
  });
  const res = await request(app)
    .post('/api/products')
    .send({ name: 'Soap', price: '1', stock: 2, branchId: 'b2' });
  assert.equal(res.status, 200);
  assert.equal(created.branchId, 'b2');
});

test('PUT /api/products/:id requires branchId for super admin', async () => {
  const storage = {
    updateProduct: async () => ({}),
  } as any;
  const app = createApp(storage, {
    user: { id: 'sa1', role: 'super_admin', branchId: null },
  });
  const res = await request(app)
    .put('/api/products/1')
    .send({ name: 'Soap' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: 'branchId is required' });
});

test('PUT /api/products/:id allows super admin with branchId', async () => {
  let called: any = null;
  const storage = {
    updateProduct: async (id: string, data: any, branchId: string) => {
      called = { id, data, branchId };
      return { id, ...data };
    },
  } as any;
  const app = createApp(storage, {
    user: { id: 'sa1', role: 'super_admin', branchId: null },
  });
  const res = await request(app)
    .put('/api/products/1')
    .send({ name: 'New', branchId: 'b2' });
  assert.equal(res.status, 200);
  assert.equal(called.branchId, 'b2');
});

test('branch user cannot update product outside their branch', async () => {
  let passedBranch: string | null = null;
  const storage = {
    updateProduct: async (_id: string, _d: any, branchId: string) => {
      passedBranch = branchId;
      return null;
    },
  } as any;
  const app = createApp(storage);
  const res = await request(app)
    .put('/api/products/1')
    .send({ name: 'X', branchId: 'b2' });
  assert.equal(res.status, 404);
  assert.equal(passedBranch, 'b1');
});

