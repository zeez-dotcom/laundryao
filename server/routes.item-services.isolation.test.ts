import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/flutterpos';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

import { registerRoutes } from './routes';
import { NotificationService } from './services/notification';
import { storage } from './storage';
import { db } from './db';
import { branches, categories, clothingItems, itemServicePrices, laundryServices, users } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

async function createServerApp() {
  const app = express();
  app.use(express.json());
  await registerRoutes(app, new NotificationService());
  return app;
}

async function resetData() {
  try {
    await db.delete(itemServicePrices);
    await db.delete(clothingItems);
    await db.delete(laundryServices);
    await db.delete(categories);
    await db.delete(users);
    await db.delete(branches);
  } catch {
    // ignore
  }
}

function randomBranchCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  return `${pick()}${pick()}${pick()}`;
}

test('public GET /api/clothing-items/:id/services shows only services priced for that branch', async () => {
  await resetData();

  const codeA = randomBranchCode();
  const codeB = randomBranchCode();
  const bA = await storage.createBranch({ name: 'Branch A', code: codeA } as any);
  const bB = await storage.createBranch({ name: 'Branch B', code: codeB } as any);

  const userA = await storage.createUser({
    username: `userA_${codeA.toLowerCase()}`,
    email: `a_${codeA.toLowerCase()}@example.com`,
    passwordHash: 'password',
    role: 'admin',
    branchId: bA.id,
  } as any);

  const catClothingA = await storage.createCategory({ name: 'Clothing A', type: 'clothing', isActive: true } as any, userA.id);
  const catServiceA = await storage.createCategory({ name: 'Service A', type: 'service', isActive: true } as any, userA.id);
  const item = await storage.createClothingItem({ name: 'ItemA', categoryId: catClothingA.id, userId: userA.id } as any);
  const svcInA = await storage.createLaundryService({ name: 'Wash', price: '5.00', categoryId: catServiceA.id, userId: userA.id } as any);
  const svcOnlyB = await storage.createLaundryService({ name: 'Dry', price: '6.00', categoryId: catServiceA.id, userId: userA.id } as any);

  // Price mapping only for Branch A for svcInA
  await storage.createItemServicePrice({ clothingItemId: item.id, serviceId: (svcInA as any).id, branchId: bA.id, price: '5.00' } as any);

  // No mapping for svcOnlyB in branch A, and no mappings at all for branch B
  const noneB = await db
    .select()
    .from(itemServicePrices)
    .where(
      and(
        eq(itemServicePrices.branchId, bB.id),
        eq(itemServicePrices.clothingItemId, item.id),
      ),
    );
  assert.equal(noneB.length, 0);

  const app = await createServerApp();

  // For branch A: only svcInA should be returned
  const resA = await request(app)
    .get(`/api/clothing-items/${item.id}/services`)
    .query({ branchCode: codeA });
  assert.equal(resA.status, 200);
  const namesA = (resA.body as any[]).map((s) => s.name);
  assert.deepEqual(namesA.sort(), ['Wash']);

  // For branch B: none should be returned
  const resB = await request(app)
    .get(`/api/clothing-items/${item.id}/services`)
    .query({ branchCode: codeB });
  assert.equal(resB.status, 200);
  const namesB = (resB.body as any[]).map((s) => s.name);
  assert.equal(namesB.length, 0);
});

