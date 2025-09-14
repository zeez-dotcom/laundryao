import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { MemStorage } = await import('./storage');

test('create and retrieve package with clothing item', async () => {
  const storage = new MemStorage();
  const clothingItemId = (await storage.getClothingItems())[0].id;
  const serviceId = (await storage.getLaundryServices())[0].id;

  const created = await storage.createPackage({
    nameEn: 'Clothing Package',
    price: '20',
    branchId: 'b1',
    packageItems: [
      { clothingItemId, serviceId, credits: 5 }
    ]
  });

  assert.equal(created.packageItems[0].clothingItemId, clothingItemId);

  const fetched = await storage.getPackage(created.id, 'b1');
  assert.ok(fetched);
  assert.equal(fetched!.packageItems[0].clothingItemId, clothingItemId);
});

test('update package item clothing reference', async () => {
  const storage = new MemStorage();
  const clothingItems = await storage.getClothingItems();
  const serviceId = (await storage.getLaundryServices())[0].id;

  const pkg = await storage.createPackage({
    nameEn: 'Clothing Package',
    price: '20',
    branchId: 'b1',
    packageItems: [
      { clothingItemId: clothingItems[0].id, serviceId, credits: 5 }
    ]
  });

  const updated = await storage.updatePackage(
    pkg.id,
    {
      packageItems: [
        { clothingItemId: clothingItems[1].id, serviceId, credits: 10 }
      ]
    },
    'b1'
  );

  assert.ok(updated);
  assert.equal(updated!.packageItems.length, 1);
  assert.equal(updated!.packageItems[0].clothingItemId, clothingItems[1].id);
  assert.equal(updated!.packageItems[0].credits, 10);
});

test('assign package with clothing item to customer', async () => {
  const storage = new MemStorage();
  const clothingItemId = (await storage.getClothingItems())[0].id;
  const serviceId = (await storage.getLaundryServices())[0].id;

  const pkg = await storage.createPackage({
    nameEn: 'Clothing Package',
    price: '20',
    branchId: 'b1',
    packageItems: [
      { clothingItemId, serviceId, credits: 5 }
    ]
  });

  const cp = await storage.assignPackageToCustomer(pkg.id, 'cust1', 5, new Date(), null);

  assert.equal(cp.packageId, pkg.id);
  assert.equal(cp.customerId, 'cust1');
  assert.equal(cp.balance, 5);

  const list = await storage.getCustomerPackagesWithUsage('cust1');
  assert.equal(list.length, 1);
  assert.equal(list[0].packageId, pkg.id);
  assert.equal(list[0].balance, 5);
});
