import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

import { registerDeliveryRoutes } from './routes/delivery';
import type { AssignmentRecommendation, DeliveryOptimizationService } from './services/delivery-optimization';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const noopAuth = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as any;
const broadcastDeliveryEvent = async () => {
  /* no-op */
};
const eventBus = { publish: async () => undefined } as any;

function createApp(options: { optimizationService?: Partial<DeliveryOptimizationService> }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req.session as any) = { customerId: 'cust-1' };
    (req as any).user = { id: 'admin-1', role: 'admin', branchId: 'branch-1' };
    next();
  });

  const storage = {
    getBranchByCode: async (code: string) => (code === 'BR1' ? { id: 'branch-1' } : undefined),
    getItemServicePrice: async () => 10,
    createOrder: async (input: any) => ({
      id: 'order-1',
      orderNumber: '1001',
      total: input.total,
      promisedReadyDate: new Date().toISOString(),
      status: 'received',
    }),
    createDeliveryOrder: async () => ({
      id: 'delivery-1',
      orderId: 'order-1',
      deliveryStatus: 'pending',
    }),
    assignDeliveryOrder: async () => ({ orderId: 'order-1', deliveryStatus: 'pending' }),
    getDeliveryOrders: async () => [],
  } as any;

  registerDeliveryRoutes({
    app,
    storage,
    logger,
    requireAuth: noopAuth,
    requireAdminOrSuperAdmin: noopAuth,
    broadcastDeliveryEvent,
    eventBus,
    optimizationService: options.optimizationService as DeliveryOptimizationService | undefined,
  });

  return app;
}

test('auto assignment response includes optimization result', async () => {
  const calls: string[] = [];
  const optimizationService = {
    autoAssignDelivery: async (deliveryId: string): Promise<AssignmentRecommendation> => {
      calls.push(deliveryId);
      return {
        deliveryId,
        driverId: 'driver-9',
        etaMinutes: 14,
        distanceKm: 5.2,
        confidence: 0.9,
        reasons: ['test'],
      };
    },
  } as Partial<DeliveryOptimizationService>;

  const app = createApp({ optimizationService });
  const res = await request(app).post('/api/delivery-orders').send({
    customerId: 'cust-1',
    branchCode: 'BR1',
    deliveryAddressId: 'addr-1',
    items: [{ clothingItemId: 'item-1', serviceId: 'svc-1', quantity: 1 }],
  });
  assert.equal(res.status, 201);
  assert.equal(calls[0], 'delivery-1');
  assert.deepEqual(res.body.autoAssignment.driverId, 'driver-9');
});

test('control tower preview uses optimization service', async () => {
  const plan = {
    generatedAt: new Date().toISOString(),
    assignments: [{ deliveryId: 'delivery-1', driverId: 'driver-9', etaMinutes: 12, distanceKm: 4.1, confidence: 0.8, reasons: [] }],
    unassignedDeliveries: [],
  };

  const optimizationService = {
    recommendAssignments: async () => plan,
  } as Partial<DeliveryOptimizationService>;

  const app = createApp({ optimizationService });
  const res = await request(app)
    .post('/api/control-tower/assignments/preview')
    .send({ deliveryIds: ['delivery-1'] });

  assert.equal(res.status, 200);
  assert.equal(res.body.assignments[0].deliveryId, 'delivery-1');
  assert.equal(res.body.assignments[0].driverId, 'driver-9');
});
