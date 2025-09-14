import nodemailer from 'nodemailer';
import logger from '../logger';

export class NotificationService {
  async sendSMS(to: string, message: string): Promise<boolean> {
    if (process.env.ENABLE_SMS_NOTIFICATIONS !== 'true') {
      logger.debug(`SMS notifications disabled; skipping send to ${to}`);
      return false;
    }

    // TODO: integrate actual SMS provider
    logger.info(`SMS sent to ${to}: ${message}`);
    return true;
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
