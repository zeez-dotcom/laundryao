import test from "node:test";
import assert from "node:assert/strict";

import {
  AlertingEngine,
  type AlertingRepository,
  type AlertRule,
  type AlertDeliveryRecord,
  type UserAlertPreferences,
  type AlertSchedule,
  type CohortFilter,
  type MetricProvider,
} from "./services/alerts";
import { computeCohortKey } from "./services/alerts";
import {
  ForecastingService,
  type ForecastingRepository,
  type ForecastRecord,
  type ForecastMetric,
  type HistoricalMetricRow,
  type CohortFilter as ForecastCohort,
} from "./services/forecasting";
import { NotificationService } from "./services/notification";

class InMemoryAlertingRepository implements AlertingRepository {
  rules: AlertRule[] = [];
  deliveries: AlertDeliveryRecord[] = [];
  preferences = new Map<string, UserAlertPreferences>();

  async ensureSchema(): Promise<void> {
    return undefined;
  }

  async createRule(rule: Omit<AlertRule, "id" | "createdAt" | "updatedAt" | "lastTriggeredAt" | "nextRunAt">): Promise<AlertRule> {
    const now = new Date();
    const nextRunAt = new Date(0).toISOString();
    const record: AlertRule = {
      ...rule,
      id: `rule-${this.rules.length + 1}`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastTriggeredAt: null,
      nextRunAt,
    };
    this.rules.push(record);
    return record;
  }

  async updateRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule | null> {
    const index = this.rules.findIndex((rule) => rule.id === id);
    if (index === -1) return null;
    const current = this.rules[index];
    const merged: AlertRule = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
      cohort: (updates.cohort as CohortFilter | null | undefined) ?? current.cohort,
      nextRunAt: updates.nextRunAt ?? current.nextRunAt,
      lastTriggeredAt: updates.lastTriggeredAt ?? current.lastTriggeredAt,
    };
    this.rules[index] = merged;
    return merged;
  }

  async listRules(): Promise<AlertRule[]> {
    return this.rules.slice();
  }

  async listDueRules(now: Date): Promise<AlertRule[]> {
    return this.rules.filter((rule) => rule.isActive && (!rule.nextRunAt || new Date(rule.nextRunAt) <= now));
  }

  async recordDelivery(delivery: AlertDeliveryRecord): Promise<void> {
    this.deliveries.push(delivery);
  }

  async getPreferences(userId: string): Promise<UserAlertPreferences | null> {
    return this.preferences.get(userId) ?? null;
  }

  async savePreferences(preferences: UserAlertPreferences): Promise<UserAlertPreferences> {
    this.preferences.set(preferences.userId, preferences);
    return preferences;
  }
}

class StubNotificationService extends NotificationService {
  public emails: Array<{ to: string; subject: string; html: string }> = [];
  public sms: Array<{ to: string; message: string }> = [];

  constructor() {
    super({ smsClient: { async send() {} } });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    this.emails.push({ to, subject, html });
    return true;
  }

  async sendSMS(to: string, message: string): Promise<boolean> {
    this.sms.push({ to, message });
    return true;
  }
}

class StubSlackClient {
  public messages: Array<{ url: string; message: string }> = [];
  async sendMessage(webhookUrl: string, message: string): Promise<void> {
    this.messages.push({ url: webhookUrl, message });
  }
}

class HistoricalOnlyForecastingRepository implements ForecastingRepository {
  constructor(private readonly rows: HistoricalMetricRow[]) {}

  ensureSchema(): Promise<void> {
    return Promise.resolve();
  }

  async loadHistoricalMetrics(
    _metric: ForecastMetric,
    options: { branchId?: string | null; cohort?: ForecastCohort | null; startDate: Date; endDate: Date },
  ): Promise<HistoricalMetricRow[]> {
    const start = options.startDate.toISOString().slice(0, 10);
    const end = options.endDate.toISOString().slice(0, 10);
    return this.rows.filter((row) => row.date >= start && row.date <= end).map((row) => ({ ...row }));
  }

  replaceForecasts(_records: ForecastRecord[]): Promise<void> {
    return Promise.resolve();
  }

  listForecasts(): Promise<ForecastRecord[]> {
    return Promise.resolve([]);
  }

  async listActuals(
    metric: ForecastMetric,
    options: { branchId?: string | null; cohort?: ForecastCohort | null; startDate: Date; endDate: Date },
  ): Promise<HistoricalMetricRow[]> {
    return this.loadHistoricalMetrics(metric, options);
  }
}

test("alerting engine dispatches multi-channel notifications", async () => {
  process.env.ENABLE_EMAIL_NOTIFICATIONS = "true";
  process.env.ENABLE_SMS_NOTIFICATIONS = "true";
  const repository = new InMemoryAlertingRepository();
  const notification = new StubNotificationService();
  const slack = new StubSlackClient();
  const metricProvider: MetricProvider = {
    async getMetricValue() {
      return 150;
    },
  };

  const engine = new AlertingEngine({
    repository,
    notificationService: notification,
    slackClient: slack,
    metricProvider,
    clock: () => new Date("2024-05-01T10:00:00Z"),
  });

  await repository.savePreferences({
    userId: "user-1",
    emailEnabled: true,
    smsEnabled: true,
    slackEnabled: true,
    emailAddress: "ops@example.com",
    phoneNumber: "+20123456789",
    slackWebhook: "https://hooks.slack.com/services/user",
    quietHours: null,
  });

  await engine.configureRule({
    name: "Revenue surge",
    metric: "revenue",
    comparison: "above",
    threshold: 120,
    branchId: null,
    cohort: null,
    cohortKey: computeCohortKey(null),
    schedule: { frequency: "hourly", minute: 0 } satisfies AlertSchedule,
    channels: [{ type: "slack", targets: ["https://hooks.slack.com/services/team"] }],
    subscribers: [{ userId: "user-1" }],
    isActive: true,
    createdBy: "admin",
  });

  await engine.runDueRules();

  assert.equal(notification.emails.length, 1);
  assert.equal(notification.sms.length, 1);
  assert.equal(slack.messages.length, 2); // direct channel + user preference
  assert.ok(repository.deliveries.filter((delivery) => delivery.status === "sent").length >= 2);
});

test("quiet hours skip subscriber notifications", async () => {
  const repository = new InMemoryAlertingRepository();
  const notification = new StubNotificationService();
  const slack = new StubSlackClient();
  const metricProvider: MetricProvider = {
    async getMetricValue() {
      return 200;
    },
  };

  const engine = new AlertingEngine({
    repository,
    notificationService: notification,
    slackClient: slack,
    metricProvider,
    clock: () => new Date("2024-05-01T02:30:00Z"),
  });

  await repository.savePreferences({
    userId: "user-quiet",
    emailEnabled: true,
    smsEnabled: false,
    slackEnabled: false,
    emailAddress: "quiet@example.com",
    phoneNumber: null,
    slackWebhook: null,
    quietHours: { start: "22:00", end: "06:00" },
  });

  await engine.configureRule({
    name: "Off-hours anomaly",
    metric: "orders",
    comparison: "above",
    threshold: 50,
    branchId: null,
    cohort: null,
    cohortKey: computeCohortKey(null),
    schedule: { frequency: "hourly", minute: 0 } satisfies AlertSchedule,
    channels: [],
    subscribers: [{ userId: "user-quiet" }],
    isActive: true,
    createdBy: "admin",
  });

  await engine.runDueRules();

  const skipped = repository.deliveries.filter((delivery) => delivery.status === "skipped");
  assert.equal(skipped.length, 1);
  assert.equal(notification.emails.length, 0);
});

test("alerting engine uses actual metrics for non-forecast rules", async () => {
  process.env.ENABLE_EMAIL_NOTIFICATIONS = "true";
  const repository = new InMemoryAlertingRepository();
  const notification = new StubNotificationService();
  const slack = new StubSlackClient();

  const historical: HistoricalMetricRow[] = [
    { date: "2024-04-28", orders: 150, revenue: 4800 },
    { date: "2024-04-29", orders: 160, revenue: 5200 },
  ];

  const forecastingService = new ForecastingService({
    repository: new HistoricalOnlyForecastingRepository(historical),
    clock: () => new Date("2024-04-30T12:00:00Z"),
  });

  const engine = new AlertingEngine({
    repository,
    notificationService: notification,
    slackClient: slack,
    forecastingService,
    clock: () => new Date("2024-04-30T12:00:00Z"),
  });

  await engine.configureRule({
    name: "Revenue threshold",
    metric: "revenue",
    comparison: "above",
    threshold: 5000,
    branchId: null,
    cohort: null,
    cohortKey: computeCohortKey(null),
    schedule: { frequency: "daily", hour: 12, minute: 0 } satisfies AlertSchedule,
    channels: [{ type: "email", targets: ["alerts@example.com"] }],
    subscribers: [],
    isActive: true,
    createdBy: "system",
  });

  await engine.runDueRules();

  assert.equal(notification.emails.length, 1);
  assert.ok(repository.deliveries.some((delivery) => delivery.status === "sent"));
});
