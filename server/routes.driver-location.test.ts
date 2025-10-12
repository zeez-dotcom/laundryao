import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import WebSocket from 'ws';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.SESSION_STORE = 'memory';

import { registerRoutes } from './routes';
import { NotificationService } from './services/notification';
import { storage } from './storage';

async function startServer() {
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app, new NotificationService());
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  return server;
}

test('authenticated driver updates broadcast using session user id', async () => {
  const server = await startServer();
  const originalGetUserByUsername = storage.getUserByUsername;
  const originalGetUser = storage.getUser;
  const originalUpdateDriverLocation = storage.updateDriverLocation;
  const originalGetLatestDriverLocations = storage.getLatestDriverLocations;

  let ws: WebSocket | undefined;
  const password = 'driver-secret';
  const driverUser = {
    publicId: 1,
    id: 'driver-1',
    username: 'driver_user',
    email: 'driver@example.com',
    passwordHash: await bcrypt.hash(password, 4),
    firstName: 'Driver',
    lastName: 'One',
    role: 'driver',
    isActive: true,
    branchId: 'branch-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  storage.getUserByUsername = async (username: string) =>
    username === driverUser.username ? driverUser : undefined;
  storage.getUser = async (id: string) => (id === driverUser.id ? driverUser : undefined);
  const updateCalls: Array<[string, number, number]> = [];
  const stubTimestamp = new Date("2024-01-01T00:00:00.000Z");
  storage.updateDriverLocation = async (driverId: string, lat: number, lng: number) => {
    updateCalls.push([driverId, lat, lng]);
    return { driverId, lat, lng, timestamp: stubTimestamp };
  };
  storage.getLatestDriverLocations = async () => [];

  const { port } = server.address() as AddressInfo;
  const agent = request.agent(`http://127.0.0.1:${port}`);
  const loginRes = await agent.post('/api/login').send({
    username: driverUser.username,
    password,
  });

  assert.equal(loginRes.status, 200);
  const cookieHeader = loginRes.headers['set-cookie'];
  assert.ok(Array.isArray(cookieHeader) && cookieHeader.length > 0);
  const cookies = cookieHeader.map((c: string) => c.split(';')[0]).join('; ');

  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws/driver-location`, {
      headers: { Cookie: cookies },
    });

    const lat = 24.5;
    const lng = 54.1;

    const message = await new Promise<Record<string, unknown>>((resolve, reject) => {
      ws!.once('error', reject);
      ws!.once('open', () => {
        ws!.send(JSON.stringify({ driverId: 'spoofed', lat, lng }));
      });
      ws!.on('message', (data) => {
        const payload = JSON.parse(data.toString());
        if (payload.lat === lat && payload.lng === lng) {
          resolve(payload);
        }
      });
    });

    assert.deepEqual(message, {
      driverId: driverUser.id,
      lat,
      lng,
      timestamp: stubTimestamp.toISOString(),
    });
    assert.deepEqual(updateCalls, [[driverUser.id, lat, lng]]);
  } finally {
    storage.getUserByUsername = originalGetUserByUsername;
    storage.getUser = originalGetUser;
    storage.updateDriverLocation = originalUpdateDriverLocation;
    storage.getLatestDriverLocations = originalGetLatestDriverLocations;

    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        await once(ws, 'close');
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

test('unauthenticated websocket upgrade is rejected', async () => {
  const server = await startServer();
  const { port } = server.address() as AddressInfo;

  try {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/driver-location`);
      let finished = false;
      const done = (err?: Error) => {
        if (!finished) {
          finished = true;
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      };
      ws.once('open', () => done(new Error('WebSocket should not open for unauthenticated client')));
      ws.once('error', () => done());
      ws.once('close', () => done());
    });
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});
