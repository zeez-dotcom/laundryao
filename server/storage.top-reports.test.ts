import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { DatabaseStorage } = await import('./storage');
const { db } = await import('./db');

test('getTopServices uses Postgres json unpacking and pay later CTE', async () => {
  const storage = new DatabaseStorage();
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
    return {
      rows: [
        { service: 'Wash', count: '2', revenue: '30.5' },
        { service: 'Dry', count: 1, revenue: 15 },
      ],
    };
  };

  const result = await storage.getTopServices('daily');

  (db as any).execute = originalExecute;

  assert.deepEqual(result, [
    { service: 'Wash', count: 2, revenue: 30.5 },
    { service: 'Dry', count: 1, revenue: 15 },
  ]);
  assert.match(receivedSql, /jsonb_to_recordset/i);
  assert.match(receivedSql, /WITH\s+pay_later\s+AS/i);
  assert.ok(!/JSON_TABLE/i.test(receivedSql));
});

test('getTopProducts converts values to numbers and uses Postgres json tools', async () => {
  const storage = new DatabaseStorage();
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
    return {
      rows: [
        { product: 'Shirt', count: '5', revenue: '42.75' },
      ],
    };
  };

  const result = await storage.getTopProducts('weekly');

  (db as any).execute = originalExecute;

  assert.deepEqual(result, [{ product: 'Shirt', count: 5, revenue: 42.75 }]);
  assert.match(receivedSql, /jsonb_to_recordset/i);
  assert.match(receivedSql, /WITH\s+pay_later\s+AS/i);
  assert.ok(!/JSON_TABLE/i.test(receivedSql));
});
