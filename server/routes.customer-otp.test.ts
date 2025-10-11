import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import { NotificationService } from './services/notification';
import { generateCustomerPasswordOtp } from './storage';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost/db';

function createApp(storage: any, notificationService: NotificationService) {
  const app = express();
  app.use(express.json());

  app.post('/customer/request-password-reset', async (req, res) => {
    try {
      const { phoneNumber } = z.object({ phoneNumber: z.string() }).parse(req.body);
      const customer = await storage.getCustomerByPhone(phoneNumber);
      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' });
      }
      const otp = generateCustomerPasswordOtp(phoneNumber);
      await notificationService.sendSMS(
        phoneNumber,
        `Your password reset code is: ${otp}. Valid for 10 minutes.`,
      );
      res.json({ message: 'OTP sent successfully to your mobile number' });
    } catch {
      res.status(400).json({ message: 'Invalid data' });
    }
  });

  return app;
}

test('customer password reset sends SMS when notifications enabled', async () => {
  const smsCalls: Array<{ to: string | undefined; body: string }> = [];
  const notificationService = new NotificationService({
    smsClient: {
      async send(to, body) {
        smsCalls.push({ to, body });
      },
    },
  });
  const storage = {
    async getCustomerByPhone(phone: string) {
      if (phone === '+15551234567') {
        return { id: 'cust1', phoneNumber: phone };
      }
      return null;
    },
  };
  const previous = process.env.ENABLE_SMS_NOTIFICATIONS;
  process.env.ENABLE_SMS_NOTIFICATIONS = 'true';

  try {
    const app = createApp(storage, notificationService);
    const res = await request(app)
      .post('/customer/request-password-reset')
      .send({ phoneNumber: '+15551234567' });
    assert.equal(res.status, 200);
    assert.equal(smsCalls.length, 1);
    assert.equal(smsCalls[0]?.to, '+15551234567');
    assert.match(smsCalls[0]?.body ?? '', /Your password reset code is:/);
  } finally {
    process.env.ENABLE_SMS_NOTIFICATIONS = previous;
  }
});

test('customer password reset skips SMS when notifications disabled', async () => {
  const smsCalls: Array<{ to: string | undefined; body: string }> = [];
  const notificationService = new NotificationService({
    smsClient: {
      async send(to, body) {
        smsCalls.push({ to, body });
      },
    },
  });
  const storage = {
    async getCustomerByPhone(phone: string) {
      if (phone === '+15559876543') {
        return { id: 'cust2', phoneNumber: phone };
      }
      return null;
    },
  };
  const previous = process.env.ENABLE_SMS_NOTIFICATIONS;
  process.env.ENABLE_SMS_NOTIFICATIONS = 'false';

  try {
    const app = createApp(storage, notificationService);
    const res = await request(app)
      .post('/customer/request-password-reset')
      .send({ phoneNumber: '+15559876543' });
    assert.equal(res.status, 200);
    assert.equal(smsCalls.length, 0);
  } finally {
    process.env.ENABLE_SMS_NOTIFICATIONS = previous;
  }
});
