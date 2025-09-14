import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

const { DatabaseStorage } = await import('./storage');
const { db } = await import('./db');

async function captureSQL(fn: () => Promise<any>) {
  const original = db.execute;
  let sqlString = '';
  (db as any).execute = async (query: any) => {
    sqlString = query.queryChunks.map((c: any) => Array.isArray(c.value) ? c.value.join('') : c.value).join('');
    return { rows: [] };
  };
  try {
    await fn();
  } finally {
    (db as any).execute = original;
  }
  return sqlString;
}

test('getOrderStats excludes delivery requests', async () => {
  const storage = new DatabaseStorage();
  const sql = await captureSQL(() => storage.getOrderStats('daily'));
  const matches = sql.match(/o\.is_delivery_request = false/g) || [];
  assert.strictEqual(matches.length, 2);
});

test('getTopServices excludes delivery requests', async () => {
  const storage = new DatabaseStorage();
  const sql = await captureSQL(() => storage.getTopServices('daily'));
  const matches = sql.match(/o\.is_delivery_request = false/g) || [];
  assert.strictEqual(matches.length, 2);
});

test('getTopProducts excludes delivery requests', async () => {
  const storage = new DatabaseStorage();
  const sql = await captureSQL(() => storage.getTopProducts('daily'));
  const matches = sql.match(/o\.is_delivery_request = false/g) || [];
  assert.strictEqual(matches.length, 2);
});

test('getClothingItemStats excludes delivery requests', async () => {
  const storage = new DatabaseStorage();
  const sql = await captureSQL(() => storage.getClothingItemStats('daily'));
  const matches = sql.match(/o\.is_delivery_request = false/g) || [];
  assert.strictEqual(matches.length, 2);
});
