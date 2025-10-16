import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test-db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

import { registerRoutes } from './routes';
import { NotificationService } from './services/notification';
import { storage } from './storage';
import { db } from './db';
import { EventBus } from './services/event-bus';
import type {
  Branch,
  Category,
  ClothingItem,
  InsertBranch,
  InsertCategory,
  InsertClothingItem,
  InsertItemServicePrice,
  InsertLaundryService,
  InsertUser,
  ItemServicePrice,
  LaundryService,
  User,
} from '@shared/schema';

async function createServerApp() {
  const app = express();
  app.use(express.json());
  const eventBus = new EventBus({ driver: 'memory' });
  await registerRoutes(app, new NotificationService(), { eventBus });
  return app;
}

type WithId<T> = T & { id: string };

const branchRows: WithId<InsertBranch>[] = [];
const categoryRows: WithId<InsertCategory>[] = [];
const clothingItemRows: WithId<InsertClothingItem>[] = [];
const laundryServiceRows: WithId<InsertLaundryService>[] = [];
const userRows: WithId<InsertUser>[] = [];
const itemServicePriceRows: WithId<InsertItemServicePrice>[] = [];

let currentBranchId: string | null = null;

const originalStorage = {
  createBranch: storage.createBranch,
  createUser: storage.createUser,
  createCategory: storage.createCategory,
  createClothingItem: storage.createClothingItem,
  createLaundryService: storage.createLaundryService,
  createItemServicePrice: storage.createItemServicePrice,
  getBranchByCode: storage.getBranchByCode,
};

const originalDbSelect = db.select;

function resetData() {
  branchRows.length = 0;
  categoryRows.length = 0;
  clothingItemRows.length = 0;
  laundryServiceRows.length = 0;
  userRows.length = 0;
  itemServicePriceRows.length = 0;
  currentBranchId = null;
}

function installStubs() {
  storage.createBranch = async (data: InsertBranch) => {
    const record: WithId<InsertBranch> = { ...data, id: randomUUID(), publicId: data.publicId ?? Math.floor(Math.random() * 100000) } as any;
    branchRows.push(record);
    return record as Branch;
  };
  storage.createUser = async (data: InsertUser) => {
    const record: WithId<InsertUser> = { ...data, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() } as any;
    userRows.push(record);
    return record as User;
  };
  storage.createCategory = async (data: InsertCategory, _userId: string) => {
    const record: WithId<InsertCategory> = { ...data, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() } as any;
    categoryRows.push(record);
    return record as Category;
  };
  storage.createClothingItem = async (data: InsertClothingItem) => {
    const record: WithId<InsertClothingItem> = {
      ...data,
      id: randomUUID(),
      publicId: data.publicId ?? Math.floor(Math.random() * 100000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
    clothingItemRows.push(record);
    return record as ClothingItem;
  };
  storage.createLaundryService = async (data: InsertLaundryService) => {
    const record: WithId<InsertLaundryService> = {
      ...data,
      id: randomUUID(),
      publicId: data.publicId ?? Math.floor(Math.random() * 100000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
    laundryServiceRows.push(record);
    return record as LaundryService;
  };
  storage.createItemServicePrice = async (data: InsertItemServicePrice) => {
    const record: WithId<InsertItemServicePrice> = { ...data, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() } as any;
    itemServicePriceRows.push(record);
    return record as ItemServicePrice;
  };
  storage.getBranchByCode = async (code: string) => {
    const branch = branchRows.find((row) => row.code === code);
    currentBranchId = branch?.id ?? null;
    return branch ? (branch as Branch) : undefined;
  };

  (db as any).select = (selection: any) => {
    if (selection && 'item' in selection) {
      return {
        from: () => ({
          innerJoin: () => ({
            $dynamic: () => ({
              where: () => ({
                groupBy: () =>
                  Promise.resolve(
                    clothingItemRows
                      .filter((item) =>
                        currentBranchId
                          ? itemServicePriceRows.some(
                              (price) => price.clothingItemId === item.id && price.branchId === currentBranchId,
                            )
                          : false,
                      )
                      .map((item) => ({ item })),
                  ),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error('Unexpected db.select invocation in isolation test');
  };
}

function restoreStubs() {
  storage.createBranch = originalStorage.createBranch;
  storage.createUser = originalStorage.createUser;
  storage.createCategory = originalStorage.createCategory;
  storage.createClothingItem = originalStorage.createClothingItem;
  storage.createLaundryService = originalStorage.createLaundryService;
  storage.createItemServicePrice = originalStorage.createItemServicePrice;
  storage.getBranchByCode = originalStorage.getBranchByCode;
  (db as any).select = originalDbSelect;
  currentBranchId = null;
}

function randomBranchCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  // 3-letter code to minimize collisions across suite runs
  return `${pick()}${pick()}${pick()}`;
}

test('public GET /api/clothing-items shows only items priced for that branch', async () => {
  installStubs();
  resetData();
  try {
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
    const noneB = itemServicePriceRows.filter((price) => price.branchId === bB.id);
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
  } finally {
    restoreStubs();
  }
});
