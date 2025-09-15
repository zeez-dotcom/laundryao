import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';

const { DatabaseStorage } = await import('./storage');
const { db } = await import('./db');
import { users, categories, clothingItems, laundryServices, itemServicePrices } from '@shared/schema';
const { PRICE_MATRIX } = await import('./seed-prices');

// test will stub db methods to capture seed inserts

test('new users are seeded with default data', async () => {
  const insertedCategories: any[] = [];
  const insertedClothing: any[] = [];
  const insertedLaundry: any[] = [];
  const insertedPrices: any[] = [];
  const insertedUsers: any[] = [];

  const originalInsert = db.insert;
  const originalTransaction = db.transaction;
  const originalSelect = db.select;

  try {
    (db as any).insert = (table: any) => ({
      values: (val: any) => {
        if (table === users) {
          const row = { ...val, id: 'u1' };
          insertedUsers.push(row);
          return { returning: () => [row] };
        }
        throw new Error('unexpected table');
      },
    });

    (db as any).select = () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => [{ user: insertedUsers[0], branch: null }],
        }),
      }),
    });

    (db as any).transaction = async (cb: any) => {
      const tx = {
        insert: (table: any) => ({
          values: (vals: any) => {
            if (table === categories) {
              const withIds = vals.map((v: any, i: number) => ({ ...v, id: `c${insertedCategories.length + i}` }));
              insertedCategories.push(...withIds);
            } else if (table === clothingItems) {
              const withIds = vals.map((v: any, i: number) => ({ ...v, id: `ci${insertedClothing.length + i}` }));
              insertedClothing.push(...withIds);
            } else if (table === laundryServices) {
              const withIds = vals.map((v: any, i: number) => ({ ...v, id: `ls${insertedLaundry.length + i}` }));
              insertedLaundry.push(...withIds);
            } else if (table === itemServicePrices) {
              insertedPrices.push(...vals);
            }
            return { onConflictDoNothing: async () => {} };
          },
        }),
        select: () => ({
          from: (table: any) => ({
            where: () => {
              if (table === categories) return insertedCategories;
              if (table === clothingItems) return insertedClothing;
              if (table === laundryServices) return insertedLaundry;
              // Provide a branchId so that price rows are generated during seeding
              if (table === users) return [{ branchId: 'b1' }];
              return [];
            },
          }),
        }),
      };
      await cb(tx);
    };

    const storage = new DatabaseStorage();
    await storage.createUser({ username: 'newuser', passwordHash: 'pw' });

    assert.ok(
      insertedCategories.some(
        (c) => c.name === 'Normal Iron'
      )
    );
    assert.ok(insertedClothing.some((i) => i.name === 'Thobe'));
    assert.ok(insertedLaundry.some((s) => s.name === 'Normal Iron'));

    const expectedCount = PRICE_MATRIX.reduce(
      (sum: number, item: any) => sum + Object.keys(item.prices).length,
      0,
    );
    assert.strictEqual(insertedPrices.length, expectedCount);
    const thobeNormalIron = insertedPrices.find(
      (p: any) =>
        p.clothingItemId === insertedClothing[0].id &&
        p.serviceId === insertedLaundry[0].id,
    );
    assert.ok(thobeNormalIron);
    assert.strictEqual(thobeNormalIron.price, '4.00');
  } finally {
    (db as any).insert = originalInsert;
    (db as any).transaction = originalTransaction;
    (db as any).select = originalSelect;
  }
});
