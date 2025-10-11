import nodemailer from 'nodemailer';
import twilio from 'twilio';
import logger from '../logger';

export type SMSClient = {
  send: (to: string, body: string) => Promise<void>;
};

type NotificationServiceOptions = {
  smsClient?: SMSClient | null;
};

function createTwilioClient(): SMSClient {
  const accountSid = process.env.SMS_ACCOUNT_SID;
  const authToken = process.env.SMS_AUTH_TOKEN;
  const fromNumber = process.env.SMS_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio SMS provider is not fully configured');
  }

  const client = twilio(accountSid, authToken);

  return {
    async send(to: string, body: string) {
      await client.messages.create({
        to,
        from: fromNumber,
        body,
      });
    },
  };
}

function resolveSMSClient(): SMSClient | null {
  const provider = process.env.SMS_PROVIDER?.toLowerCase();
  if (!provider) {
    return null;
  }

  if (provider !== 'twilio') {
    throw new Error(`Unsupported SMS provider: ${provider}`);
  }

  return createTwilioClient();
}

export class NotificationService {
  private smsClient: SMSClient | null | undefined;

  constructor(options: NotificationServiceOptions = {}) {
    if (typeof options.smsClient !== 'undefined') {
      this.smsClient = options.smsClient;
    }
  }

  private getSMSClient(): SMSClient | null {
    if (this.smsClient !== undefined) {
      return this.smsClient;
    }

    try {
      this.smsClient = resolveSMSClient();
    } catch (error) {
      this.smsClient = null;
      throw error;
    }

    return this.smsClient;
  }

  async sendSMS(to: string, message: string): Promise<boolean> {
    if (process.env.ENABLE_SMS_NOTIFICATIONS !== 'true') {
      logger.debug(`SMS notifications disabled; skipping send to ${to}`);
      return false;
    }

    let client: SMSClient | null;
    try {
      client = this.getSMSClient();
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize SMS provider');
      throw error;
    }

    if (!client) {
      const error = new Error('SMS provider is not configured');
      logger.error(error);
      throw error;
    }

    try {
      await client.send(to, message);
      logger.info({ to }, 'SMS sent successfully');
      return true;
    } catch (error) {
      logger.error({ err: error, to }, 'Failed to send SMS');
      throw error instanceof Error ? error : new Error('Failed to send SMS');
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'true') {
      logger.debug(`Email notifications disabled; skipping send to ${to}`);
      return false;
    }

    if (!process.env.SMTP_HOST) {
      logger.error('Email service not configured');
      throw new Error('Email service not configured');
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });

    logger.info(`Email sent to ${to} subject ${subject}`);
    return true;
  }
}
