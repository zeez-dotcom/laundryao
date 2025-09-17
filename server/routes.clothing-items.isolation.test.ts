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
  // Best-effort cleanup for tables we touch in this test
  try {
    await db.delete(itemServicePrices);
    await db.delete(clothingItems);
    await db.delete(laundryServices);
    await db.delete(categories);
    await db.delete(users);
    await db.delete(branches);
  } catch {
    // ignore for environments without full privileges
  }
}

function randomBranchCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  // 3-letter code to minimize collisions across suite runs
  return `${pick()}${pick()}${pick()}`;
}

test('public GET /api/clothing-items shows only items priced for that branch', async () => {
  await resetData();
  // Create two branches
  const codeA = randomBranchCode();
  const codeB = randomBranchCode();
  const bA = await storage.createBranch({ name: 'Branch A', code: codeA } as any);
  const bB = await storage.createBranch({ name: 'Branch B', code: codeB } as any);

  // Create a user in branch A
  const userA = await storage.createUser({
    username: `userA_${codeA.toLowerCase()}`,
    email: `a_${codeA.toLowerCase()}@example.com`,
    passwordHash: 'password',
    role: 'admin',
    branchId: bA.id,
  } as any);

  // Create a user in branch B
  const userB = await storage.createUser({
    username: `userB_${codeB.toLowerCase()}`,
    email: `b_${codeB.toLowerCase()}@example.com`,
    passwordHash: 'password',
    role: 'admin',
    branchId: bB.id,
  } as any);

  // Create clothing category and service category for userA
  const catClothingA = await storage.createCategory({ name: 'Test Clothing', type: 'clothing', isActive: true } as any, userA.id);
  const catServiceA = await storage.createCategory({ name: 'Test Service', type: 'service', isActive: true } as any, userA.id);
  const itemOnlyA = await storage.createClothingItem({ name: 'OnlyA', categoryId: catClothingA.id, userId: userA.id } as any);
  const svcA = await storage.createLaundryService({ name: 'ServiceA', price: '5.00', categoryId: catServiceA.id, userId: userA.id } as any);
  await storage.createItemServicePrice({ clothingItemId: itemOnlyA.id, serviceId: (svcA as any).id, branchId: bA.id, price: '5.00' } as any);

  // Ensure no price exists for itemOnlyA in branch B
  const noneB = await db
    .select()
    .from(itemServicePrices)
    .where(
      and(
        eq(itemServicePrices.branchId, bB.id),
        eq(itemServicePrices.clothingItemId, itemOnlyA.id),
      ),
    );
  assert.equal(noneB.length, 0);

  const app = await createServerApp();

  // Public request with branchCode codeA should include OnlyA
  const resA = await request(app).get('/api/clothing-items').query({ branchCode: codeA });
  assert.equal(resA.status, 200);
  const namesA = (resA.body as any[]).map((i) => i.name);
  assert.ok(namesA.includes('OnlyA'));

  // Public request with branchCode codeB should NOT include OnlyA
  const resB = await request(app).get('/api/clothing-items').query({ branchCode: codeB });
  assert.equal(resB.status, 200);
  const namesB = (resB.body as any[]).map((i) => i.name);
  assert.ok(!namesB.includes('OnlyA'));
});
