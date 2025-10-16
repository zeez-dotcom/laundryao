import { randomUUID, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { NotificationService } from "./notification";
import type { ForecastingService, ForecastRecord, CohortFilter } from "./forecasting";

export type AlertComparisonOperator = "above" | "below" | "equal" | "outside_bounds";

export type AlertChannel = "email" | "sms" | "slack";

export interface AlertSchedule {
  frequency: "hourly" | "daily" | "weekly";
  minute?: number;
  hour?: number;
  dayOfWeek?: number;
  timezone?: string;
}

export interface AlertSubscriber {
  userId: string;
}

export interface AlertChannelConfig {
  type: AlertChannel;
  targets?: string[];
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  comparison: AlertComparisonOperator;
  threshold: number;
  branchId: string | null;
  cohort: CohortFilter | null;
  cohortKey: string;
  schedule: AlertSchedule;
  channels: AlertChannelConfig[];
  subscribers: AlertSubscriber[];
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt: string | null;
  nextRunAt: string | null;
}

export interface AlertDeliveryRecord {
  id: string;
  ruleId: string;
  channel: AlertChannel;
  recipient: string;
  payload: Record<string, unknown>;
  deliveredAt: string;
  status: "sent" | "skipped" | "failed";
  error?: string | null;
}

export interface UserAlertPreferences {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  slackEnabled: boolean;
  emailAddress?: string | null;
  phoneNumber?: string | null;
  slackWebhook?: string | null;
  quietHours?: { start: string; end: string } | null;
}

export interface AlertingRepository {
  ensureSchema(): Promise<void>;
  createRule(rule: Omit<AlertRule, "id" | "createdAt" | "updatedAt" | "lastTriggeredAt" | "nextRunAt">): Promise<AlertRule>;
  updateRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule | null>;
  listRules(options?: { includeInactive?: boolean }): Promise<AlertRule[]>;
  listDueRules(now: Date): Promise<AlertRule[]>;
  recordDelivery(delivery: AlertDeliveryRecord): Promise<void>;
  getPreferences(userId: string): Promise<UserAlertPreferences | null>;
  savePreferences(preferences: UserAlertPreferences): Promise<UserAlertPreferences>;
}

export interface MetricProviderOptions {
  metric: string;
  branchId?: string | null;
  cohort?: CohortFilter | null;
}

export interface MetricProvider {
  getMetricValue(options: MetricProviderOptions): Promise<number | null>;
  getForecastBand?(options: MetricProviderOptions): Promise<Pick<ForecastRecord, "lowerBound" | "upperBound"> | null>;
}

export interface SlackClient {
  sendMessage(webhookUrl: string, message: string): Promise<void>;
}

class WebhookSlackClient implements SlackClient {
  async sendMessage(webhookUrl: string, message: string): Promise<void> {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }
  }
}

function computeCohortKey(cohort: CohortFilter | null | undefined): string {
  if (!cohort) return "__all__";
  return createHash("sha256").update(JSON.stringify({ id: cohort.id, label: cohort.label })).digest("hex");
}

function computeNextRun(now: Date, schedule: AlertSchedule): Date {
  const next = new Date(now);
  next.setSeconds(0, 0);
  switch (schedule.frequency) {
    case "hourly":
      next.setMinutes(schedule.minute ?? 0);
      next.setHours(now.getHours());
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
      break;
    case "daily":
      next.setMinutes(schedule.minute ?? 0);
      next.setHours(schedule.hour ?? 9);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      break;
    case "weekly":
      next.setMinutes(schedule.minute ?? 0);
      next.setHours(schedule.hour ?? 9);
      const desiredDay = schedule.dayOfWeek ?? 1;
      const currentDay = next.getUTCDay();
      const delta = (desiredDay - currentDay + 7) % 7;
      next.setDate(next.getDate() + (delta === 0 && next <= now ? 7 : delta));
      break;
    default:
      throw new Error(`Unsupported frequency ${schedule.frequency}`);
  }
  return next;
}

class PostgresAlertingRepository implements AlertingRepository {
  private ensured = false;

  async ensureSchema(): Promise<void> {
    if (this.ensured) return;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS analytics_alert_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        metric TEXT NOT NULL,
        comparison TEXT NOT NULL,
        threshold NUMERIC(14,2) NOT NULL,
        branch_id UUID,
        cohort JSONB,
        cohort_key TEXT NOT NULL,
        schedule JSONB NOT NULL,
        channels JSONB NOT NULL,
        subscribers JSONB NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_triggered_at TIMESTAMPTZ,
        next_run_at TIMESTAMPTZ,
        UNIQUE(metric, cohort_key, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'), name)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS analytics_alert_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id UUID REFERENCES analytics_alert_rules(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        recipient TEXT NOT NULL,
        payload JSONB NOT NULL,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL,
        error TEXT
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_alert_preferences (
        user_id UUID PRIMARY KEY,
        email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        slack_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        email_address TEXT,
        phone_number TEXT,
        slack_webhook TEXT,
        quiet_hours JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.ensured = true;
  }

  async createRule(rule: Omit<AlertRule, "id" | "createdAt" | "updatedAt" | "lastTriggeredAt" | "nextRunAt">): Promise<AlertRule> {
    await this.ensureSchema();
    const now = new Date();
    const nextRun = computeNextRun(now, rule.schedule);
    const rows = await db.execute(sql`
      INSERT INTO analytics_alert_rules (
        id, name, metric, comparison, threshold, branch_id, cohort, cohort_key,
        schedule, channels, subscribers, is_active, created_by, created_at, updated_at, last_triggered_at, next_run_at
      ) VALUES (
        ${randomUUID()},
        ${rule.name},
        ${rule.metric},
        ${rule.comparison},
        ${rule.threshold},
        ${rule.branchId},
        ${rule.cohort ? JSON.stringify(rule.cohort) : null},
        ${rule.cohortKey},
        ${JSON.stringify(rule.schedule)},
        ${JSON.stringify(rule.channels)},
        ${JSON.stringify(rule.subscribers)},
        ${rule.isActive},
        ${rule.createdBy},
        NOW(),
        NOW(),
        NULL,
        ${nextRun}
      )
      RETURNING *
    `);
    return this.mapRow(rows.rows?.[0]);
  }

  async updateRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule | null> {
    await this.ensureSchema();
    const schedule = updates.schedule ? JSON.stringify(updates.schedule) : undefined;
    const channels = updates.channels ? JSON.stringify(updates.channels) : undefined;
    const subscribers = updates.subscribers ? JSON.stringify(updates.subscribers) : undefined;
    const cohort = updates.cohort ? JSON.stringify(updates.cohort) : undefined;
    const nextRun = updates.schedule ? computeNextRun(new Date(), updates.schedule) : undefined;

    const rows = await db.execute(sql`
      UPDATE analytics_alert_rules
      SET
        name = COALESCE(${updates.name}, name),
        metric = COALESCE(${updates.metric}, metric),
        comparison = COALESCE(${updates.comparison}, comparison),
        threshold = COALESCE(${updates.threshold}, threshold),
        branch_id = COALESCE(${updates.branchId}, branch_id),
        cohort = COALESCE(${cohort}, cohort),
        cohort_key = COALESCE(${updates.cohortKey}, cohort_key),
        schedule = COALESCE(${schedule}, schedule),
        channels = COALESCE(${channels}, channels),
        subscribers = COALESCE(${subscribers}, subscribers),
        is_active = COALESCE(${updates.isActive}, is_active),
        updated_at = NOW(),
        next_run_at = COALESCE(${nextRun}, next_run_at)
      WHERE id = ${id}
      RETURNING *
    `);
    const row = rows.rows?.[0];
    return row ? this.mapRow(row) : null;
  }

  async listRules(options?: { includeInactive?: boolean }): Promise<AlertRule[]> {
    await this.ensureSchema();
    const clause = options?.includeInactive ? sql`` : sql`WHERE is_active = TRUE`;
    const rows = await db.execute(sql`SELECT * FROM analytics_alert_rules ${clause} ORDER BY created_at DESC`);
    return rows.rows?.map((row) => this.mapRow(row)) ?? [];
  }

  async listDueRules(now: Date): Promise<AlertRule[]> {
    await this.ensureSchema();
    const rows = await db.execute(sql`
      SELECT *
      FROM analytics_alert_rules
      WHERE is_active = TRUE
        AND COALESCE(next_run_at, NOW()) <= ${now}
    `);
    return rows.rows?.map((row) => this.mapRow(row)) ?? [];
  }

  async recordDelivery(delivery: AlertDeliveryRecord): Promise<void> {
    await this.ensureSchema();
    await db.execute(sql`
      INSERT INTO analytics_alert_deliveries (
        id, rule_id, channel, recipient, payload, delivered_at, status, error
      ) VALUES (
        ${delivery.id},
        ${delivery.ruleId},
        ${delivery.channel},
        ${delivery.recipient},
        ${JSON.stringify(delivery.payload)},
        ${delivery.deliveredAt},
        ${delivery.status},
        ${delivery.error ?? null}
      )
    `);
  }

  async getPreferences(userId: string): Promise<UserAlertPreferences | null> {
    await this.ensureSchema();
    const rows = await db.execute(sql`SELECT * FROM user_alert_preferences WHERE user_id = ${userId}`);
    const row = rows.rows?.[0];
    return row
      ? {
          userId,
          emailEnabled: Boolean(row.email_enabled),
          smsEnabled: Boolean(row.sms_enabled),
          slackEnabled: Boolean(row.slack_enabled),
          emailAddress: row.email_address ?? null,
          phoneNumber: row.phone_number ?? null,
          slackWebhook: row.slack_webhook ?? null,
          quietHours: row.quiet_hours ?? null,
        }
      : null;
  }

  async savePreferences(preferences: UserAlertPreferences): Promise<UserAlertPreferences> {
    await this.ensureSchema();
    await db.execute(sql`
      INSERT INTO user_alert_preferences (
        user_id, email_enabled, sms_enabled, slack_enabled, email_address, phone_number, slack_webhook, quiet_hours, updated_at
      ) VALUES (
        ${preferences.userId},
        ${preferences.emailEnabled},
        ${preferences.smsEnabled},
        ${preferences.slackEnabled},
        ${preferences.emailAddress ?? null},
        ${preferences.phoneNumber ?? null},
        ${preferences.slackWebhook ?? null},
        ${preferences.quietHours ? JSON.stringify(preferences.quietHours) : null},
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        email_enabled = EXCLUDED.email_enabled,
        sms_enabled = EXCLUDED.sms_enabled,
        slack_enabled = EXCLUDED.slack_enabled,
        email_address = EXCLUDED.email_address,
        phone_number = EXCLUDED.phone_number,
        slack_webhook = EXCLUDED.slack_webhook,
        quiet_hours = EXCLUDED.quiet_hours,
        updated_at = NOW()
    `);
    return preferences;
  }

  private mapRow(row: any): AlertRule {
    return {
      id: String(row.id ?? randomUUID()),
      name: String(row.name),
      metric: String(row.metric),
      comparison: row.comparison as AlertComparisonOperator,
      threshold: Number(row.threshold ?? 0),
      branchId: row.branch_id ?? null,
      cohort: row.cohort ?? null,
      cohortKey: row.cohort_key ?? "__all__",
      schedule: row.schedule ?? { frequency: "daily", hour: 9, minute: 0 },
      channels: row.channels ?? [],
      subscribers: row.subscribers ?? [],
      isActive: Boolean(row.is_active ?? true),
      createdBy: row.created_by ?? null,
      createdAt: new Date(row.created_at ?? new Date()).toISOString(),
      updatedAt: new Date(row.updated_at ?? new Date()).toISOString(),
      lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at).toISOString() : null,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at).toISOString() : null,
    };
  }
}

export interface AlertingEngineOptions {
  repository?: AlertingRepository;
  notificationService?: NotificationService;
  slackClient?: SlackClient;
  forecastingService?: ForecastingService;
  metricProvider?: MetricProvider;
  clock?: () => Date;
}

function withinQuietHours(now: Date, quietHours?: { start: string; end: string } | null): boolean {
  if (!quietHours) return false;
  const [startH, startM] = quietHours.start.split(":").map((part) => Number.parseInt(part, 10));
  const [endH, endM] = quietHours.end.split(":").map((part) => Number.parseInt(part, 10));
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = (startH % 24) * 60 + (startM % 60);
  const endMinutes = (endH % 24) * 60 + (endM % 60);
  if (startMinutes <= endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }
  return minutes >= startMinutes || minutes < endMinutes;
}

class ForecastBackedMetricProvider implements MetricProvider {
  constructor(private readonly forecastingService: ForecastingService) {}

  async getMetricValue(options: MetricProviderOptions): Promise<number | null> {
    const [metric, qualifier] = options.metric.includes(":") ? options.metric.split(":", 2) : [options.metric, "actual"];
    if (qualifier === "forecast") {
      const forecasts = await this.forecastingService.getForecasts({
        metric: metric as any,
        branchId: options.branchId ?? null,
        cohort: options.cohort ?? null,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
      });
      const latest = forecasts[forecasts.length - 1];
      return latest ? latest.value : null;
    }
    const accuracy = await this.forecastingService.evaluateAccuracy({
      metric: metric as any,
      branchId: options.branchId ?? null,
      cohort: options.cohort ?? null,
      compareDays: 1,
    });
    return accuracy.sampleSize > 0 ? accuracy.meanAbsoluteError : null;
  }

  async getForecastBand(options: MetricProviderOptions): Promise<Pick<ForecastRecord, "lowerBound" | "upperBound"> | null> {
    const forecasts = await this.forecastingService.getForecasts({
      metric: options.metric.split(":")[0] as any,
      branchId: options.branchId ?? null,
      cohort: options.cohort ?? null,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    });
    const latest = forecasts[forecasts.length - 1];
    return latest ? { lowerBound: latest.lowerBound, upperBound: latest.upperBound } : null;
  }
}

export class AlertingEngine {
  private readonly repository: AlertingRepository;
  private readonly notificationService: NotificationService;
  private readonly slackClient: SlackClient;
  private readonly metricProvider: MetricProvider;
  private readonly clock: () => Date;

  constructor(options: AlertingEngineOptions = {}) {
    this.repository = options.repository ?? new PostgresAlertingRepository();
    this.notificationService = options.notificationService ?? new NotificationService();
    this.slackClient = options.slackClient ?? new WebhookSlackClient();
    if (options.metricProvider) {
      this.metricProvider = options.metricProvider;
    } else if (options.forecastingService) {
      this.metricProvider = new ForecastBackedMetricProvider(options.forecastingService);
    } else {
      throw new Error("AlertingEngine requires either a metricProvider or forecastingService");
    }
    this.clock = options.clock ?? (() => new Date());
  }

  async configureRule(
    rule: Omit<AlertRule, "id" | "createdAt" | "updatedAt" | "lastTriggeredAt" | "nextRunAt">,
  ): Promise<AlertRule> {
    const cohortKey = rule.cohortKey || computeCohortKey(rule.cohort);
    const created = await this.repository.createRule({ ...rule, cohortKey });
    const now = this.clock();
    const createdNextRun = created.nextRunAt ? new Date(created.nextRunAt) : null;
    if (!createdNextRun || createdNextRun > now) {
      const immediate = new Date(now.getTime() - 1).toISOString();
      const updated = await this.repository.updateRule(created.id, { nextRunAt: immediate });
      if (updated) {
        return updated;
      }
      created.nextRunAt = immediate;
    }
    return created;
  }

  async updateRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule | null> {
    if (updates.cohort && !updates.cohortKey) {
      updates.cohortKey = computeCohortKey(updates.cohort);
    }
    return this.repository.updateRule(id, updates);
  }

  async listRules(): Promise<AlertRule[]> {
    return this.repository.listRules();
  }

  async runDueRules(): Promise<void> {
    const now = this.clock();
    const dueRules = await this.repository.listDueRules(now);
    if (!dueRules.length) return;

    await Promise.all(
      dueRules.map(async (rule) => {
        try {
          await this.evaluateRule(rule, now);
        } catch (error) {
          await this.repository.updateRule(rule.id, { nextRunAt: computeNextRun(now, rule.schedule) });
          console.error("Failed to evaluate alert rule", { ruleId: rule.id, error });
        }
      }),
    );
  }

  async evaluateRule(rule: AlertRule, now = this.clock()): Promise<void> {
    const value = await this.metricProvider.getMetricValue({
      metric: rule.metric,
      branchId: rule.branchId ?? null,
      cohort: rule.cohort ?? null,
    });

    if (value == null) {
      await this.repository.updateRule(rule.id, { nextRunAt: computeNextRun(now, rule.schedule) });
      return;
    }

    let triggered = false;
    let comparisonContext: Record<string, unknown> = { value, threshold: rule.threshold };

    if (rule.comparison === "outside_bounds" && this.metricProvider.getForecastBand) {
      const band = await this.metricProvider.getForecastBand({
        metric: rule.metric,
        branchId: rule.branchId ?? null,
        cohort: rule.cohort ?? null,
      });
      if (band) {
        triggered = value < band.lowerBound || value > band.upperBound;
        comparisonContext = { ...comparisonContext, lowerBound: band.lowerBound, upperBound: band.upperBound };
      }
    } else {
      switch (rule.comparison) {
        case "above":
          triggered = value > rule.threshold;
          break;
        case "below":
          triggered = value < rule.threshold;
          break;
        case "equal":
          triggered = Math.abs(value - rule.threshold) <= 0.01;
          break;
        default:
          triggered = false;
      }
    }

    const nextRunAt = computeNextRun(now, rule.schedule).toISOString();

    if (!triggered) {
      await this.repository.updateRule(rule.id, { nextRunAt });
      return;
    }

    await this.dispatch(rule, value, comparisonContext, now);
    await this.repository.updateRule(rule.id, { lastTriggeredAt: now.toISOString(), nextRunAt });
  }

  async dispatch(
    rule: AlertRule,
    value: number,
    context: Record<string, unknown>,
    now = this.clock(),
  ): Promise<void> {
    const deliveries: Array<Promise<void>> = [];

    for (const subscriber of rule.subscribers) {
      deliveries.push(
        this.repository.getPreferences(subscriber.userId).then(async (preferences) => {
          if (!preferences) return;
          if (withinQuietHours(now, preferences.quietHours)) {
            await this.repository.recordDelivery({
              id: randomUUID(),
              ruleId: rule.id,
              channel: "email",
              recipient: subscriber.userId,
              payload: { rule, value, context, skipped: "quiet_hours" },
              deliveredAt: now.toISOString(),
              status: "skipped",
            });
            return;
          }
          await Promise.all(
            [
              preferences.emailEnabled && preferences.emailAddress
                ? this.sendEmail(rule, preferences.emailAddress, value, context)
                : Promise.resolve(false),
              preferences.smsEnabled && preferences.phoneNumber
                ? this.sendSMS(rule, preferences.phoneNumber, value, context)
                : Promise.resolve(false),
              preferences.slackEnabled && preferences.slackWebhook
                ? this.sendSlack(rule, preferences.slackWebhook, value, context)
                : Promise.resolve(false),
            ].map(async (resultPromise, index) => {
              try {
                const sent = await resultPromise;
                if (!sent) return;
                const channel: AlertChannel = index === 0 ? "email" : index === 1 ? "sms" : "slack";
                await this.repository.recordDelivery({
                  id: randomUUID(),
                  ruleId: rule.id,
                  channel,
                  recipient:
                    channel === "email"
                      ? preferences.emailAddress ?? ""
                      : channel === "sms"
                        ? preferences.phoneNumber ?? ""
                        : preferences.slackWebhook ?? "",
                  payload: { rule, value, context },
                  deliveredAt: now.toISOString(),
                  status: "sent",
                });
              } catch (error) {
                const channel: AlertChannel = index === 0 ? "email" : index === 1 ? "sms" : "slack";
                await this.repository.recordDelivery({
                  id: randomUUID(),
                  ruleId: rule.id,
                  channel,
                  recipient:
                    channel === "email"
                      ? preferences.emailAddress ?? ""
                      : channel === "sms"
                        ? preferences.phoneNumber ?? ""
                        : preferences.slackWebhook ?? "",
                  payload: { rule, value, context },
                  deliveredAt: now.toISOString(),
                  status: "failed",
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }),
          );
        }),
      );
    }

    for (const channelConfig of rule.channels) {
      if (!channelConfig.targets?.length) continue;
      deliveries.push(
        Promise.all(
          channelConfig.targets.map(async (target) => {
            try {
              const sent = await this.sendChannel(channelConfig.type, target, rule, value, context);
              if (sent) {
                await this.repository.recordDelivery({
                  id: randomUUID(),
                  ruleId: rule.id,
                  channel: channelConfig.type,
                  recipient: target,
                  payload: { rule, value, context },
                  deliveredAt: now.toISOString(),
                  status: "sent",
                });
              }
            } catch (error) {
              await this.repository.recordDelivery({
                id: randomUUID(),
                ruleId: rule.id,
                channel: channelConfig.type,
                recipient: target,
                payload: { rule, value, context },
                deliveredAt: now.toISOString(),
                status: "failed",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }),
        ).then(() => undefined),
      );
    }

    await Promise.all(deliveries);
  }

  async getPreferences(userId: string): Promise<UserAlertPreferences | null> {
    return this.repository.getPreferences(userId);
  }

  async updatePreferences(preferences: UserAlertPreferences): Promise<UserAlertPreferences> {
    return this.repository.savePreferences(preferences);
  }

  private async sendChannel(channel: AlertChannel, target: string, rule: AlertRule, value: number, context: Record<string, unknown>): Promise<boolean> {
    switch (channel) {
      case "email":
        return this.sendEmail(rule, target, value, context);
      case "sms":
        return this.sendSMS(rule, target, value, context);
      case "slack":
        return this.sendSlack(rule, target, value, context);
      default:
        return false;
    }
  }

  private async sendEmail(rule: AlertRule, recipient: string, value: number, context: Record<string, unknown>): Promise<boolean> {
    const subject = `Alert: ${rule.name}`;
    const html = `
      <h2>${rule.name}</h2>
      <p><strong>Metric:</strong> ${rule.metric}</p>
      <p><strong>Observed:</strong> ${value.toFixed(2)}</p>
      <p><strong>Threshold:</strong> ${rule.threshold}</p>
      <p><strong>Context:</strong> ${JSON.stringify(context)}</p>
    `;
    try {
      await this.notificationService.sendEmail(recipient, subject, html);
      return true;
    } catch (error) {
      console.error("email delivery failed", { error, recipient });
      return false;
    }
  }

  private async sendSMS(rule: AlertRule, recipient: string, value: number, context: Record<string, unknown>): Promise<boolean> {
    const message = `${rule.name}: ${rule.metric} at ${value.toFixed(2)} (threshold ${rule.threshold}).`;
    try {
      await this.notificationService.sendSMS(recipient, message);
      return true;
    } catch (error) {
      console.error("sms delivery failed", { error, recipient });
      return false;
    }
  }

  private async sendSlack(rule: AlertRule, webhook: string, value: number, context: Record<string, unknown>): Promise<boolean> {
    const body = `${rule.name} triggered for ${rule.metric}. Observed ${value.toFixed(2)} with threshold ${rule.threshold}. Context: ${JSON.stringify(context)}`;
    try {
      await this.slackClient.sendMessage(webhook, body);
      return true;
    } catch (error) {
      console.error("slack delivery failed", { error });
      return false;
    }
  }
}

export { PostgresAlertingRepository, WebhookSlackClient, computeCohortKey, computeNextRun, withinQuietHours };
