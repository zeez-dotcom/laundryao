import test from 'node:test';
import assert from 'node:assert/strict';
import { MemStorage } from './storage';
import { computePackageUsage, computeTotalsWithCredits } from './routes';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

test('charges only non-credited quantities', async () => {
  const storage = new MemStorage();
  const clothingItem = (await storage.getClothingItems())[0];
  const service = (await storage.getLaundryServices())[0];

  const pkg = await storage.createPackage({
    nameEn: 'TestPkg',
    price: '0',
    branchId: 'b1',
    packageItems: [
      { clothingItemId: clothingItem.id, serviceId: service.id, credits: 2 }
    ]
  });

  await storage.assignPackageToCustomer(pkg.id, 'cust1', 2, new Date(), null);

  const cartItems = [
    {
      id: 'ci',
      clothingItemId: clothingItem.id,
      serviceId: service.id,
      clothingItem: clothingItem.name,
      service: service.name,
      quantity: 3,
    }
  ];

  const usage = await computePackageUsage('cust1', cartItems, storage);
  assert(usage);

  const totals = await computeTotalsWithCredits(
    cartItems,
    usage!.usedCredits,
    storage,
    'mem-user',
    'default'
  );

  assert.equal(totals.subtotal.toFixed(2), '3.00');
  assert.equal(totals.tax.toFixed(2), '0.26');
  assert.equal(totals.total.toFixed(2), '3.26');
  assert.equal(cartItems[0].total, 3);
});
