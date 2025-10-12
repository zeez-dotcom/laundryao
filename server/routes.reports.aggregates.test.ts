import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireAdminOrSuperAdmin } = await import('./auth');

const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;

function parseFilters(req: express.Request, user: any) {
  const { start, end, branchId: queryBranchId } = req.query as Record<string, string | undefined>;
  const filter: any = {};

  if (start) {
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) {
      return { filter, error: 'Invalid start date' };
    }
    filter.start = startDate;
  }

  if (end) {
    const endDate = new Date(end);
    if (Number.isNaN(endDate.getTime())) {
      return { filter, error: 'Invalid end date' };
    }
    filter.end = endDate;
  }

  if (filter.start && filter.end && filter.start > filter.end) {
    return { filter, error: 'Start date must be before end date' };
  }

  const branchScope = user.role === 'super_admin' ? queryBranchId || undefined : user.branchId || undefined;
  if (branchScope) {
    if (!UUID_REGEX.test(branchScope)) {
      return { filter, error: 'Invalid branch' };
    }
    filter.branchId = branchScope;
  }

  return { filter };
}

function createApp(storage: any, user: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = user;
    next();
  });

  app.get('/api/reports/summary', requireAdminOrSuperAdmin, async (req, res) => {
    const { filter, error } = parseFilters(req, req.user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const summary = await storage.getRevenueSummaryByDateRange(filter);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch revenue summary' });
    }
  });

  app.get('/api/reports/service-breakdown', requireAdminOrSuperAdmin, async (req, res) => {
    const { filter, error } = parseFilters(req, req.user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const services = await storage.getServiceBreakdown(filter);
      res.json({ services });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch service breakdown' });
    }
  });

  app.get('/api/reports/payment-methods', requireAdminOrSuperAdmin, async (req, res) => {
    const { filter, error } = parseFilters(req, req.user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const methods = await storage.getPaymentMethodBreakdown(filter);
      res.json({ methods });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch payment methods' });
    }
  });

  app.get('/api/reports/clothing-breakdown', requireAdminOrSuperAdmin, async (req, res) => {
    const { filter, error } = parseFilters(req, req.user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const items = await storage.getClothingBreakdown(filter);
      res.json({ items });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch clothing breakdown' });
    }
  });

  return app;
}

test('summary route scopes branch for admins', async () => {
  let receivedFilter: any = null;
  const storage = {
    async getRevenueSummaryByDateRange(filter: any) {
      receivedFilter = filter;
      return { totalOrders: 1, totalRevenue: 10, averageOrderValue: 10, daily: [] };
    },
    getServiceBreakdown: async () => [],
    getPaymentMethodBreakdown: async () => [],
    getClothingBreakdown: async () => [],
  };

  const branchId = '00000000-0000-0000-0000-000000000001';
  const app = createApp(storage, { id: 'u1', role: 'admin', branchId });
  const res = await request(app).get('/api/reports/summary?start=2024-01-01T00:00:00.000Z&end=2024-01-10T23:59:59.999Z&branchId=other');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { totalOrders: 1, totalRevenue: 10, averageOrderValue: 10, daily: [] });
  assert.equal(receivedFilter.branchId, branchId);
  assert(receivedFilter.start instanceof Date);
  assert(receivedFilter.end instanceof Date);
});

test('service breakdown allows super admins to scope by branch', async () => {
  let receivedFilter: any = null;
  const storage = {
    getRevenueSummaryByDateRange: async () => ({}),
    async getServiceBreakdown(filter: any) {
      receivedFilter = filter;
      return [{ service: 'Wash', count: 2, revenue: 12 }];
    },
    getPaymentMethodBreakdown: async () => [],
    getClothingBreakdown: async () => [],
  };

  const app = createApp(storage, { id: 'u2', role: 'super_admin', branchId: null });
  const branchId = '00000000-0000-0000-0000-000000000123';
  const res = await request(app).get(`/api/reports/service-breakdown?branchId=${branchId}`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { services: [{ service: 'Wash', count: 2, revenue: 12 }] });
  assert.equal(receivedFilter.branchId, branchId);
});

test('payment methods route returns 400 for invalid dates', async () => {
  const storage = {
    getRevenueSummaryByDateRange: async () => ({}),
    getServiceBreakdown: async () => [],
    getPaymentMethodBreakdown: async () => [],
    getClothingBreakdown: async () => [],
  };

  const app = createApp(storage, { id: 'u3', role: 'admin', branchId: 'branch-admin' });
  const res = await request(app).get('/api/reports/payment-methods?start=not-a-date');

  assert.equal(res.status, 400);
});
