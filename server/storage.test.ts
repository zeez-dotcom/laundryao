import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';

const { DatabaseStorage, MemStorage } = await import('./storage');
const { db } = await import('./db');
const { users, clothingItems, laundryServices, itemServicePrices, orders, deliveryOrders } = await import('@shared/schema');

const baseUser = {
  id: '1',
  username: 'test',
  firstName: 'Old',
  lastName: 'User',
  email: 'test@example.com',
  role: 'user',
  branchId: null,
  deliveryAccountId: null,
  passwordHash: 'existing-hash',
  createdAt: new Date(),
  updatedAt: new Date(),
};

test('upsertUser updates existing row when username exists', async () => {
  const storage = new DatabaseStorage();
  const originalInsert = db.insert;
  const originalSelect = db.select;
  let existing: any = null;
  let conflictTarget: any = null;

  (db as any).insert = () => ({
    values: (data: any) => ({
      onConflictDoUpdate: (conflict: any) => {
        conflictTarget = conflict.target;
        if (existing && existing.username === data.username) {
          const hasUsername = Array.isArray(conflict.target)
            ? conflict.target.includes(users.username)
            : conflict.target === users.username;
          if (!hasUsername) {
            throw new Error('unique constraint');
          }
          existing = { ...existing, ...conflict.set };
        } else {
          existing = { ...data };
        }
        return { returning: () => [existing] };
      },
    }),
  });

  (db as any).select = () => ({
    from: () => ({
      leftJoin: () => ({
        where: () => [{ user: existing, branch: null }],
      }),
    }),
  });

  const first = { id: '1', username: 'user', passwordHash: 'hash', role: 'user' };
  await storage.upsertUser(first);

  const second = { id: '2', username: 'user', passwordHash: 'hash2', role: 'user', firstName: 'New' };
  const updated = await storage.upsertUser(second);

  assert.strictEqual(updated.firstName, 'New');
  const hasUsername = Array.isArray(conflictTarget)
    ? conflictTarget.includes(users.username)
    : conflictTarget === users.username;
  assert.strictEqual(hasUsername, true);

  (db as any).insert = originalInsert;
  (db as any).select = originalSelect;
});

test('updateUser without password leaves existing hash untouched', async () => {
  const user = { ...baseUser };
  const originalUpdate = db.update;
  const originalSelect = db.select;
  let setData: any = null;

  (db as any).update = () => ({
    set: (data: any) => {
      setData = data;
      Object.assign(user, data);
      return {
        where: () => ({
          returning: () => [{ id: user.id }],
        }),
      };
    },
  });

  (db as any).select = () => ({
    from: () => ({
      leftJoin: () => ({
        where: () => [{ user, branch: null }],
      }),
    }),
  });

  const storage = new DatabaseStorage();
  const updated = await storage.updateUser(user.id, { firstName: 'New' });

  (db as any).update = originalUpdate;
  (db as any).select = originalSelect;

  assert.strictEqual(setData.passwordHash, undefined);
  assert.strictEqual(updated?.passwordHash, baseUser.passwordHash);
});

test('updateUser with empty password string leaves existing hash untouched', async () => {
  const user = { ...baseUser };
  const originalUpdate = db.update;
  const originalSelect = db.select;
  let setData: any = null;

  (db as any).update = () => ({
    set: (data: any) => {
      setData = data;
      Object.assign(user, data);
      return {
        where: () => ({
          returning: () => [{ id: user.id }],
        }),
      };
    },
  });

  (db as any).select = () => ({
    from: () => ({
      leftJoin: () => ({
        where: () => [{ user, branch: null }],
      }),
    }),
  });

  const storage = new DatabaseStorage();
  const updated = await storage.updateUser(user.id, { firstName: 'New', passwordHash: '' });

  (db as any).update = originalUpdate;
  (db as any).select = originalSelect;

  assert.strictEqual(setData.passwordHash, undefined);
  assert.strictEqual(updated?.passwordHash, baseUser.passwordHash);
});

test('updateUserBranch updates branch only', async () => {
  const user = { ...baseUser };
  const originalUpdate = db.update;
  const originalSelect = db.select;
  let setData: any = null;

  (db as any).update = () => ({
    set: (data: any) => {
      setData = data;
      Object.assign(user, data);
      return {
        where: () => ({
          returning: () => [{ id: user.id }],
        }),
      };
    },
  });

  (db as any).select = () => ({
    from: () => ({
      leftJoin: () => ({
        where: () => [{ user, branch: null }],
      }),
    }),
  });

  const storage = new DatabaseStorage();
  const updated = await storage.updateUserBranch(user.id, 'b1');

  (db as any).update = originalUpdate;
  (db as any).select = originalSelect;

  assert.strictEqual(setData.branchId, 'b1');
  assert.strictEqual(updated?.branchId, 'b1');
});

test('deleteClothingItem returns boolean based on deletion result', async () => {
  const storage = new DatabaseStorage();
  const originalDelete = db.delete;
  (db as any).delete = () => ({ where: () => ({ rowCount: 1 }) });
  assert.strictEqual(await storage.deleteClothingItem('1'), true);
  (db as any).delete = () => ({ where: () => ({ rowCount: 0 }) });
  assert.strictEqual(await storage.deleteClothingItem('1'), false);
  (db as any).delete = originalDelete;
});

test('deleteLaundryService returns boolean based on deletion result', async () => {
  const storage = new DatabaseStorage();
  const originalDelete = db.delete;
  (db as any).delete = () => ({ where: () => ({ rowCount: 1 }) });
  assert.strictEqual(await storage.deleteLaundryService('1'), true);
  (db as any).delete = () => ({ where: () => ({ rowCount: 0 }) });
  assert.strictEqual(await storage.deleteLaundryService('1'), false);
  (db as any).delete = originalDelete;
});

test('MemStorage user CRUD operations mirror constraints', async () => {
  const storage = new MemStorage();
  const created = await storage.createUser({
    username: 'alice',
    passwordHash: 'password123',
    role: 'user',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Example',
    isActive: true,
  } as any);

  assert.strictEqual(created.username, 'alice');
  assert.ok(await bcrypt.compare('password123', created.passwordHash));
  assert.strictEqual((await storage.getUserByUsername('alice'))?.id, created.id);

  await assert.rejects(
    storage.createUser({
      username: 'alice',
      passwordHash: 'other',
      role: 'user',
    } as any),
    /username already exists/,
  );

  const profile = await storage.updateUserProfile(created.id, { firstName: 'Alicia' });
  assert.strictEqual(profile?.firstName, 'Alicia');

  const updatedPassword = await storage.updateUserPassword(created.id, 'newpass');
  assert.ok(updatedPassword?.passwordHash);
  assert.ok(await bcrypt.compare('newpass', updatedPassword!.passwordHash));

  const users = await storage.getUsers();
  assert.strictEqual(users.length > 0, true);
});

test('MemStorage category CRUD enforces unique names per user', async () => {
  const storage = new MemStorage();
  const user = await storage.createUser({
    username: 'owner',
    passwordHash: 'secret',
    role: 'user',
  } as any);

  const category = await storage.createCategory({
    name: 'Dresses',
    type: 'clothing',
    isActive: true,
  }, user.id);

  assert.strictEqual(category.name, 'Dresses');
  assert.strictEqual((await storage.getCategory(category.id, user.id))?.id, category.id);
  assert.strictEqual((await storage.getCategories(user.id)).length, 1);

  await assert.rejects(
    storage.createCategory({
      name: 'Dresses',
      type: 'clothing',
    }, user.id),
    /category name already exists/,
  );

  const updated = await storage.updateCategory(category.id, { name: 'Formal Wear' }, user.id);
  assert.strictEqual(updated?.name, 'Formal Wear');

  const second = await storage.createCategory({ name: 'Casual', type: 'clothing' }, user.id);
  await assert.rejects(
    storage.updateCategory(second.id, { name: 'Formal Wear' }, user.id),
    /category name already exists/,
  );

  assert.strictEqual(await storage.deleteCategory(second.id, user.id), true);
  assert.strictEqual(await storage.deleteCategory(second.id, user.id), false);
});

test('MemStorage branch CRUD enforces unique branch codes', async () => {
  const storage = new MemStorage();
  const branch = await storage.createBranch({
    name: 'Main Branch',
    code: 'MB',
  } as any, ['city-1']);

  const fetched = await storage.getBranch(branch.id);
  assert.strictEqual(fetched?.serviceCityIds?.includes('city-1'), true);
  assert.strictEqual((await storage.getBranchByCode('MB'))?.id, branch.id);

  await assert.rejects(
    storage.createBranch({
      name: 'Duplicate Code',
      code: 'MB',
    } as any),
    /branch code already exists/,
  );

  const other = await storage.createBranch({ name: 'Secondary', code: 'SC' } as any);
  await assert.rejects(
    storage.updateBranch(branch.id, { code: 'SC' }),
    /branch code already exists/,
  );

  const updated = await storage.updateBranch(branch.id, { name: 'HQ' }, ['city-2']);
  assert.strictEqual(updated?.name, 'HQ');
  assert.deepEqual(updated?.serviceCityIds, ['city-2']);

  await storage.setBranchServiceCities(branch.id, ['city-3']);
  assert.deepEqual((await storage.getBranch(branch.id))?.serviceCityIds, ['city-3']);

  assert.strictEqual(await storage.deleteBranch(branch.id), true);
  assert.strictEqual(await storage.getBranch(branch.id), undefined);
  assert.strictEqual(await storage.deleteBranch(branch.id), false);
});

test('createClothingItem seeds default prices for existing services', async () => {
  const storage = new DatabaseStorage();
  const originalTransaction = db.transaction;
  const inserted: any[] = [];

  (db as any).transaction = async (fn: any) => {
    await fn({
      insert: (table: any) => ({
        values: (data: any) => {
          if (table === clothingItems) {
            return { returning: () => [{ id: 'item1', ...data }] };
          }
          if (table === itemServicePrices) {
            inserted.push(data);
            return { onConflictDoNothing: () => ({}) };
          }
          return { returning: () => [] };
        },
      }),
      select: () => ({
        from: (table: any) => ({
          where: () => {
            if (table === laundryServices) {
              return [
                { id: 's1', price: '5.00', userId: 'u1', name: 'Wash', description: null, categoryId: 'c1' },
                { id: 's2', price: '3.00', userId: 'u1', name: 'Iron', description: null, categoryId: 'c2' },
              ];
            }
            return [];
          },
        }),
      }),
    });
  };

  await storage.createClothingItem({ name: 'Shirt', categoryId: 'cItem', userId: 'u1', description: undefined, imageUrl: undefined });

  (db as any).transaction = originalTransaction;

  assert.deepEqual(inserted[0], [
    {
      clothingItemId: 'item1',
      serviceId: 's1',
      branchId: 'default',
      price: '0.00',
    },
    {
      clothingItemId: 'item1',
      serviceId: 's2',
      branchId: 'default',
      price: '0.00',
    },
  ]);
});

test('getCustomerPackagesWithUsage returns package info', async () => {
  const storage = new MemStorage() as any;
  storage.packages.set('pkg1', {
    id: 'pkg1',
    nameEn: 'Wash Pack',
    nameAr: 'حزمة الغسيل',
    branchId: 'b1',
  });
  storage.packageItems.set('pkg1', [
    {
      id: 'pi1',
      packageId: 'pkg1',
      credits: 10,
      serviceId: 'svc1',
      clothingItemId: 'item1',
    },
  ]);
  storage.customerPackages.set('cp1', {
    id: 'cp1',
    packageId: 'pkg1',
    customerId: 'cust1',
    balance: 8,
    startsAt: new Date('2025-01-01T00:00:00Z'),
    expiresAt: new Date('2025-02-01T00:00:00Z'),
  });
  storage.customerPackageItems.set('cp1', [
    { serviceId: 'svc1', clothingItemId: 'item1', balance: 5, totalCredits: 10 },
  ]);

  const result = await storage.getCustomerPackagesWithUsage('cust1');
  assert.equal(result.length, 1);
  assert.equal(result[0].nameEn, 'Wash Pack');
  assert.equal(result[0].nameAr, 'حزمة الغسيل');
  assert.equal(result[0].totalCredits, 10);
  assert.equal(result[0].balance, 5);
  assert.ok(result[0].startsAt);
  assert.ok(result[0].expiresAt);
});

test('getCustomerPackagesWithUsage includes service names', async () => {
  const storage = new DatabaseStorage();
  const originalExecute = db.execute;

  (db as any).execute = async () => ({
    rows: [
      {
        id: 'cp1',
        package_id: 'pkg1',
        balance: '5',
        starts_at: new Date('2025-01-01T00:00:00Z'),
        expires_at: new Date('2025-02-01T00:00:00Z'),
        name_en: 'Wash Pack',
        name_ar: null,
        service_id: 'svc1',
        product_id: null,
        item_balance: '5',
        total_credits: '5',
        service_name: 'Washing',
        product_name: null,
      },
    ],
  });

  const result = await storage.getCustomerPackagesWithUsage('cust1');
  assert.equal(result[0].items?.[0].serviceName, 'Washing');

  (db as any).execute = originalExecute;
});

test('bulkUpsertUserCatalog throws when user lacks branch', async () => {
  const storage = new DatabaseStorage();
  const originalTransaction = db.transaction;

  (db as any).transaction = async (fn: any) => {
    await fn({
      select: () => ({
        from: () => ({
          where: () => [{ branchId: null }],
        }),
      }),
    });
  };

  await assert.rejects(
    () => storage.bulkUpsertUserCatalog('user1', []),
    /No branchId for user user1/,
  );

  (db as any).transaction = originalTransaction;
});

test('acceptDeliveryOrderRequest updates order and delivery status', async () => {
  const storage = new DatabaseStorage();
  const originalTransaction = db.transaction;
  const orderId = 'order1';
  let orderUpdate: any = null;
  let deliveryUpdate: any = null;

  (db as any).transaction = async (fn: any) => {
    return await fn({
      execute: async () => {},
      select: () => ({
        from: () => ({
          where: () => [{ status: 'pending' }],
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () => [{}],
        }),
      }),
      update: (table: any) => ({
        set: (data: any) => ({
          where: () => ({
            returning: () => {
              if (table === orders) {
                orderUpdate = data;
                return [{ id: orderId }];
              }
              if (table === deliveryOrders) {
                deliveryUpdate = data;
                return [{}];
              }
              return [];
            },
          }),
        }),
      }),
    });
  };

  const result = await storage.acceptDeliveryOrderRequest(orderId);

  (db as any).transaction = originalTransaction;

  assert.strictEqual(result?.id, orderId);
  assert.strictEqual(orderUpdate.isDeliveryRequest, false);
  assert.strictEqual(deliveryUpdate.deliveryStatus, 'accepted');
});
