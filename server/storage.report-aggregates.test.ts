import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { DatabaseStorage } = await import('./storage');
const { db } = await import('./db');

function extractSql(query: any): string {
  if (typeof query === 'string') return query;
  if (query?.sql) return query.sql;
  if (Array.isArray(query?.queryChunks)) {
    return query.queryChunks
      .map((chunk: any) => {
        const value = chunk?.value;
        if (Array.isArray(value)) {
          return value.join('');
        }
        return value ?? '';
      })
      .join('');
  }
  if (typeof query?.toString === 'function') {
    return query.toString();
  }
  return '';
}

test('getServiceBreakdown uses jsonb_to_recordset and pay later CTE', async () => {
  const storage = new DatabaseStorage();
  const originalExecute = db.execute;
  let receivedSql = '';
  (db as any).execute = async (query: any) => {
    receivedSql = extractSql(query);
    return {
      rows: [
        { service: 'Wash', count: '2', revenue: '15.5' },
        { service: 'Dry', count: 1, revenue: 7 },
      ],
    };
  };

  const result = await storage.getServiceBreakdown({ branchId: '00000000-0000-0000-0000-000000000000' });

  (db as any).execute = originalExecute;

  assert.deepEqual(result, [
    { service: 'Wash', count: 2, revenue: 15.5 },
    { service: 'Dry', count: 1, revenue: 7 },
  ]);
  assert.match(receivedSql, /jsonb_to_recordset/i);
  assert.match(receivedSql, /WITH\s+pay_later\s+AS/i);
  assert.match(receivedSql, /branch_id\s*=\s*'/i);
});

test('getRevenueSummaryByDateRange normalises totals and applies date filters', async () => {
  const storage = new DatabaseStorage();
  const originalExecute = db.execute;
  let receivedSql = '';
  (db as any).execute = async (query: any) => {
    receivedSql = extractSql(query);
    return {
      rows: [
        { order_date: '2024-01-01', orders: '2', revenue: '30.5' },
        { order_date: '2024-01-02', orders: 1, revenue: 10 },
      ],
    };
  };

  const summary = await storage.getRevenueSummaryByDateRange({
    start: new Date('2024-01-01T00:00:00.000Z'),
    end: new Date('2024-01-31T23:59:59.999Z'),
  });

  (db as any).execute = originalExecute;

  assert.deepEqual(summary, {
    totalOrders: 3,
    totalRevenue: 40.5,
    averageOrderValue: 13.5,
    daily: [
      { date: '2024-01-01', orders: 2, revenue: 30.5 },
      { date: '2024-01-02', orders: 1, revenue: 10 },
    ],
  });
  assert.match(receivedSql, /created_at >= '\d{4}-\d{2}-\d{2}T/i);
  assert.match(receivedSql, /created_at <= '\d{4}-\d{2}-\d{2}T/i);
});

test('getPaymentMethodBreakdown converts numeric values', async () => {
  const storage = new DatabaseStorage();
  const originalExecute = db.execute;
  let receivedSql = '';
  (db as any).execute = async (query: any) => {
    receivedSql = extractSql(query);
    return {
      rows: [
        { method: 'card', count: '3', revenue: '90.25' },
        { method: 'cash', count: 1, revenue: 10 },
      ],
    };
  };

  const methods = await storage.getPaymentMethodBreakdown({});

  (db as any).execute = originalExecute;

  assert.deepEqual(methods, [
    { method: 'card', count: 3, revenue: 90.25 },
    { method: 'cash', count: 1, revenue: 10 },
  ]);
  assert.match(receivedSql, /payment_method/i);
});
