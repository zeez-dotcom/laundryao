import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { DatabaseStorage } = await import('./storage');
const { db } = await import('./db');

test('getClothingItemStats aggregates items with services', async () => {
  const orders = [
    {
      id: 'o1',
      branchId: '00000000-0000-0000-0000-000000000001',
      paymentMethod: 'card',
      items: [
        { clothingItem: 'Shirt', service: 'Wash', quantity: 2, total: 20 },
        { clothingItem: 'Pants', service: 'Dry', quantity: 1, total: 15 },
      ],
    },
    {
      id: 'o2',
      branchId: '00000000-0000-0000-0000-000000000001',
      paymentMethod: 'pay_later',
      items: [
        { clothingItem: 'Shirt', service: 'Iron', quantity: 1, total: 10 },
      ],
    },
    {
      id: 'o3',
      branchId: '00000000-0000-0000-0000-000000000002',
      paymentMethod: 'card',
      items: [
        { clothingItem: 'Coat', service: 'Dry Clean', quantity: 1, total: 40 },
      ],
    },
  ];

  const payments = [{ orderId: 'o2', amount: 10 }];

  function compute(branchId: string, limit?: number) {
    const paidLater = new Set(payments.map((p) => p.orderId));
    const map = new Map<string, { count: number; revenue: number }>();
    for (const o of orders) {
      if (branchId && o.branchId !== branchId) continue;
      if (o.paymentMethod === 'pay_later' && !paidLater.has(o.id)) continue;
      for (const it of o.items) {
        const key = it.service ? `${it.clothingItem} - ${it.service}` : it.clothingItem;
        const entry = map.get(key) || { count: 0, revenue: 0 };
        entry.count += it.quantity;
        entry.revenue += it.total;
        map.set(key, entry);
      }
    }
    const arr = Array.from(map.entries()).map(([item, { count, revenue }]) => ({
      item,
      count,
      revenue,
    }));
    arr.sort((a, b) => b.revenue - a.revenue);
    return typeof limit === 'number' ? arr.slice(0, limit) : arr;
  }

  const branchId = '00000000-0000-0000-0000-000000000001';
  const limit = 5;
  const originalExecute = db.execute;
  let receivedSql = '';
  (db as any).execute = async (query: any) => {
    if (typeof query === 'string') {
      receivedSql = query;
    } else if (query) {
      if (Array.isArray(query.queryChunks)) {
        receivedSql = query.queryChunks
          .map((chunk: any) => {
            const value = chunk?.value;
            if (Array.isArray(value)) {
              return value.join('');
            }
            return value ?? '';
          })
          .join('');
      }
      if (!receivedSql) {
        receivedSql = query.sql ?? query.text ?? query.query ?? '';
      }
      if (!receivedSql && typeof query.toString === 'function') {
        receivedSql = query.toString();
      }
    }
    return { rows: compute(branchId, limit) };
  };

  const storage = new DatabaseStorage();
  const result = await storage.getClothingItemStats('daily', branchId, limit);

  (db as any).execute = originalExecute;

  assert.deepEqual(result, compute(branchId, limit));
  assert.match(receivedSql, /jsonb_to_recordset/i);
  assert.ok(!/JSON_TABLE/i.test(receivedSql));
});
