import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { requireSuperAdmin } = await import('./auth');
const { storage } = await import('./storage');
import { insertUserSchema, categories, laundryServices, users } from '@shared/schema';
const { db } = await import('./db');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { role: 'super_admin' };
    next();
  });
  app.post('/api/users', requireSuperAdmin, async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const newUser = await storage.createUser(validated);
      const { passwordHash, ...safeUser } = newUser;
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ message: 'Failed to create user' });
    }
  });
  return app;
}

test('user creation seeds categories and services independently', async () => {
  const insertedUsers: any[] = [];
  const insertedCategories: Record<string, any[]> = {};
  const insertedLaundry: Record<string, any[]> = {};

  const originalInsert = db.insert;
  const originalTransaction = db.transaction;
  const originalSelect = db.select;

  try {
    (db as any).insert = (table: any) => ({
      values: (val: any) => {
        if (table === users) {
          const row = { ...val, id: `u${insertedUsers.length + 1}` };
          insertedUsers.push(row);
          return { returning: () => [row] };
        }
        throw new Error('unexpected table');
      },
    });

    (db as any).select = () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => [{ user: insertedUsers[insertedUsers.length - 1], branch: null }],
        }),
      }),
    });

    (db as any).transaction = async (cb: any) => {
      const currentUserId = insertedUsers[insertedUsers.length - 1].id;
      const cats = (insertedCategories[currentUserId] ||= []);
      const laundries = (insertedLaundry[currentUserId] ||= []);
      const tx = {
        insert: (table: any) => ({
          values: (vals: any[]) => {
            if (table === categories) {
              const withIds = vals.map((v, i) => ({ ...v, id: `c${currentUserId}-${cats.length + i}` }));
              cats.push(...withIds);
            } else if (table === laundryServices) {
              const withIds = vals.map((v, i) => ({ ...v, id: `ls${currentUserId}-${laundries.length + i}` }));
              laundries.push(...withIds);
            }
            return { onConflictDoNothing: async () => {} };
          },
        }),
        select: () => ({
          from: () => ({
            where: () => cats,
          }),
        }),
      };
      await cb(tx);
    };

    const app = createApp();

    const r1 = await request(app)
      .post('/api/users')
      .send({ username: 'u1', passwordHash: 'pw1' });
    assert.equal(r1.status, 200);
    const user1Id = insertedUsers[0].id;
    const cats1 = insertedCategories[user1Id];
    assert.ok(cats1.some((c) => c.name === 'Normal Iron'));
    const ironId1 = cats1.find((c) => c.name === 'Normal Iron')!.id;
    const services1 = insertedLaundry[user1Id];
    assert.ok(services1.some((s) => s.name === 'Normal Iron' && s.categoryId === ironId1));

    const r2 = await request(app)
      .post('/api/users')
      .send({ username: 'u2', passwordHash: 'pw2' });
    assert.equal(r2.status, 200);
    const user2Id = insertedUsers[1].id;
    const cats2 = insertedCategories[user2Id];
    assert.ok(cats2.some((c) => c.name === 'Normal Iron'));
    const ironId2 = cats2.find((c) => c.name === 'Normal Iron')!.id;
    const services2 = insertedLaundry[user2Id];
    assert.ok(services2.some((s) => s.name === 'Normal Iron' && s.categoryId === ironId2));

    const catIds1 = new Set(cats1.map((c) => c.id));
    const catIds2 = new Set(cats2.map((c) => c.id));
    for (const id of catIds1) {
      assert.ok(!catIds2.has(id));
    }
    const servIds1 = new Set(services1.map((s) => s.id));
    const servIds2 = new Set(services2.map((s) => s.id));
    for (const id of servIds1) {
      assert.ok(!servIds2.has(id));
    }
  } finally {
    (db as any).insert = originalInsert;
    (db as any).transaction = originalTransaction;
    (db as any).select = originalSelect;
  }
});

