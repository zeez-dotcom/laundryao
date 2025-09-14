import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

function createApp(storage: any) {
  const app = express();
  app.use(express.json());

  const tokens = new Map<string, { userId: string; expires: Date }>();
  const attempts = new Map<string, { count: number; windowStart: number }>();
  const isRateLimited = (key: string) => {
    const now = Date.now();
    const rec = attempts.get(key);
    if (!rec || now - rec.windowStart > 60 * 60 * 1000) {
      attempts.set(key, { count: 1, windowStart: now });
      return false;
    }
    if (rec.count >= 5) return true;
    rec.count++;
    return false;
  };

  app.post('/auth/password/forgot', async (req, res) => {
    try {
      const { username } = z.object({ username: z.string() }).parse(req.body);
      const ip = req.ip;
      if (isRateLimited(`u:${username}`) || isRateLimited(`i:${ip}`)) {
        return res.status(429).json({ message: 'tooManyRequests' });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(404).json({ message: 'userNotFound' });
      const token = 'tok-' + Math.random();
      tokens.set(token, { userId: user.id, expires: new Date(Date.now() + 30 * 60 * 1000) });
      res.json({ token });
    } catch {
      res.status(400).json({ message: 'invalidData' });
    }
  });

  app.post('/auth/password/reset', async (req, res) => {
    try {
      const { token, newPassword } = z
        .object({ token: z.string(), newPassword: z.string() })
        .parse(req.body);
      const info = tokens.get(token);
      if (!info || info.expires < new Date()) {
        return res.status(400).json({ message: 'invalidOrExpiredToken' });
      }
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
        return res.status(400).json({ message: 'passwordRequirements' });
      }
      await storage.updateUserPassword(info.userId, newPassword);
      res.json({ message: 'passwordReset' });
    } catch {
      res.status(400).json({ message: 'invalidData' });
    }
  });

  return { app, tokens };
}

test('forgot password generates token with rate limiting', async () => {
  const storage = {
    async getUserByUsername(u: string) {
      if (u === 'alice') return { id: '1', username: 'alice' };
      return null;
    },
    async updateUserPassword() {},
  };
  const { app } = createApp(storage);
  for (let i = 0; i < 5; i++) {
    const res = await request(app).post('/auth/password/forgot').send({ username: 'alice' });
    assert.equal(res.status, 200);
  }
  const res = await request(app).post('/auth/password/forgot').send({ username: 'alice' });
  assert.equal(res.status, 429);
});

test('reset password validates token and password', async () => {
  let updated: any = null;
  const storage = {
    async getUserByUsername() { return { id: '1', username: 'alice' }; },
    async updateUserPassword(id: string, pw: string) { updated = { id, pw }; },
  };
  const { app, tokens } = createApp(storage);
  const resForgot = await request(app).post('/auth/password/forgot').send({ username: 'alice' });
  const token = resForgot.body.token;
  // invalid password
  let res = await request(app).post('/auth/password/reset').send({ token, newPassword: 'short' });
  assert.equal(res.status, 400);
  // expired token
  tokens.set(token, { userId: '1', expires: new Date(Date.now() - 1000) });
  res = await request(app).post('/auth/password/reset').send({ token, newPassword: 'ValidPass1' });
  assert.equal(res.status, 400);
  // new token valid
  const resForgot2 = await request(app).post('/auth/password/forgot').send({ username: 'alice' });
  const token2 = resForgot2.body.token;
  res = await request(app).post('/auth/password/reset').send({ token: token2, newPassword: 'ValidPass1' });
  assert.equal(res.status, 200);
  assert.deepEqual(updated, { id: '1', pw: 'ValidPass1' });
});
