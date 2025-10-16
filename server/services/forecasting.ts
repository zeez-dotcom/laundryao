import { randomUUID, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

export type ForecastMetric = "orders" | "revenue" | "average_order_value";

export interface CohortFilter {
  id: string;
  label: string;
  description?: string;
}

export interface ForecastRecord {
  id: string;
  metric: ForecastMetric;
  targetDate: string;
  branchId: string | null;
  cohort: CohortFilter | null;
  cohortKey: string;
  horizonDays: number;
  value: number;
  lowerBound: number;
  upperBound: number;
  weatherInfluence: WeatherFactor | null;
  metadata: Record<string, unknown>;
  generatedAt: string;
}

export interface HistoricalMetricRow {
  date: string;
  orders: number;
  revenue: number;
}

export interface ForecastingJobOptions {
  metric: ForecastMetric;
  branchId?: string | null;
  cohort?: CohortFilter | null;
  historyDays?: number;
  horizonDays?: number;
  location?: string;
}

export interface ForecastQueryOptions {
  metric: ForecastMetric;
  branchId?: string | null;
  cohort?: CohortFilter | null;
  startDate?: string;
  endDate?: string;
}

export interface AccuracyRequest {
  metric: ForecastMetric;
  branchId?: string | null;
  cohort?: CohortFilter | null;
  compareDays?: number;
}

export interface ForecastAccuracy {
  meanAbsolutePercentageError: number;
  meanAbsoluteError: number;
  sampleSize: number;
}

export interface WeatherFactor {
  date: string;
  temperatureC: number;
  precipitationProbability: number;
  seasonalityIndex: number;
}

export interface WeatherClient {
  getFactors(params: { startDate: Date; horizonDays: number; location?: string | null }): Promise<WeatherFactor[]>;
}

export interface ForecastingRepository {
  ensureSchema(): Promise<void>;
  loadHistoricalMetrics(
    metric: ForecastMetric,
    options: { branchId?: string | null; cohort?: CohortFilter | null; startDate: Date; endDate: Date },
  ): Promise<HistoricalMetricRow[]>;
  replaceForecasts(records: ForecastRecord[]): Promise<void>;
  listForecasts(options: ForecastQueryOptions): Promise<ForecastRecord[]>;
  listActuals(metric: ForecastMetric, options: { branchId?: string | null; cohort?: CohortFilter | null; startDate: Date; endDate: Date }): Promise<HistoricalMetricRow[]>;
}

const DEFAULT_HISTORY_DAYS = 120;
const DEFAULT_HORIZON_DAYS = 21;

function computeCohortKey(cohort: CohortFilter | null | undefined): string {
  if (!cohort) return "__all__";
  return createHash("sha256").update(JSON.stringify({ id: cohort.id, label: cohort.label })).digest("hex");
}

function buildCohortClause(cohort: CohortFilter | null | undefined) {
  if (!cohort) return sql``;
  switch (cohort.id) {
    case "highValue":
      return sql`AND o.total::numeric >= 500`;
    case "recurring":
      return sql`AND (o.package_usages IS NOT NULL)`;
    case "newCustomers":
      return sql`AND o.created_at >= NOW() - INTERVAL '30 days'`;
    default:
      return sql``;
  }
}

class PostgresForecastingRepository implements ForecastingRepository {
  private ensured = false;

  async ensureSchema(): Promise<void> {
    if (this.ensured) return;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS analytics_forecasts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        metric TEXT NOT NULL,
        target_date DATE NOT NULL,
        branch_id UUID,
        cohort JSONB,
        cohort_key TEXT NOT NULL,
        horizon_days INTEGER NOT NULL,
        value NUMERIC(14,2) NOT NULL,
        lower_bound NUMERIC(14,2) NOT NULL,
        upper_bound NUMERIC(14,2) NOT NULL,
        weather JSONB,
        metadata JSONB,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(metric, target_date, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'), cohort_key)
      )
    `);
    this.ensured = true;
  }

  async loadHistoricalMetrics(
    metric: ForecastMetric,
    options: { branchId?: string | null; cohort?: CohortFilter | null; startDate: Date; endDate: Date },
  ): Promise<HistoricalMetricRow[]> {
    await this.ensureSchema();
    const cohortClause = buildCohortClause(options.cohort);
    const branchClause = options.branchId ? sql`AND o.branch_id = ${options.branchId}` : sql``;
    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', o.created_at) AS day,
        COUNT(*) AS orders,
        COALESCE(SUM(o.total::numeric), 0) AS revenue
      FROM orders o
      WHERE o.created_at >= ${options.startDate}
        AND o.created_at < ${options.endDate}
        ${branchClause}
        ${cohortClause}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    return rows.rows?.map((row: any) => ({
      date: new Date(row.day).toISOString().slice(0, 10),
      orders: Number(row.orders ?? 0),
      revenue: Number(row.revenue ?? 0),
    })) ?? [];
  }

  async replaceForecasts(records: ForecastRecord[]): Promise<void> {
    await this.ensureSchema();
    if (!records.length) return;
    const cohortKey = records[0]?.cohortKey ?? "__all__";
    const branchId = records[0]?.branchId ?? null;
    const metric = records[0]?.metric ?? "orders";
    await db.execute(sql`
      DELETE FROM analytics_forecasts
      WHERE metric = ${metric}
        AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000') = COALESCE(${branchId}, '00000000-0000-0000-0000-000000000000')
        AND cohort_key = ${cohortKey}
    `);

    for (const record of records) {
      await db.execute(sql`
        INSERT INTO analytics_forecasts (
          id, metric, target_date, branch_id, cohort, cohort_key, horizon_days,
          value, lower_bound, upper_bound, weather, metadata, generated_at
        ) VALUES (
          ${record.id},
          ${record.metric},
          ${record.targetDate},
          ${record.branchId},
          ${record.cohort ? JSON.stringify(record.cohort) : null},
          ${record.cohortKey},
          ${record.horizonDays},
          ${record.value},
          ${record.lowerBound},
          ${record.upperBound},
          ${record.weatherInfluence ? JSON.stringify(record.weatherInfluence) : null},
          ${JSON.stringify(record.metadata)},
          ${record.generatedAt}
        )
      `);
    }
  }

  async listForecasts(options: ForecastQueryOptions): Promise<ForecastRecord[]> {
    await this.ensureSchema();
    const cohortKey = computeCohortKey(options.cohort);
    const branchClause = options.branchId ? sql`AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000') = COALESCE(${options.branchId}, '00000000-0000-0000-0000-000000000000')` : sql``;
    const startClause = options.startDate ? sql`AND target_date >= ${options.startDate}` : sql``;
    const endClause = options.endDate ? sql`AND target_date <= ${options.endDate}` : sql``;
    const rows = await db.execute(sql`
      SELECT *
      FROM analytics_forecasts
      WHERE metric = ${options.metric}
        AND cohort_key = ${cohortKey}
        ${branchClause}
        ${startClause}
        ${endClause}
      ORDER BY target_date ASC
    `);

    return rows.rows?.map((row: any) => ({
      id: String(row.id ?? randomUUID()),
      metric: row.metric as ForecastMetric,
      targetDate: new Date(row.target_date).toISOString().slice(0, 10),
      branchId: row.branch_id ?? null,
      cohort: row.cohort ?? null,
      cohortKey: row.cohort_key,
      horizonDays: Number(row.horizon_days ?? 0),
      value: Number(row.value ?? 0),
      lowerBound: Number(row.lower_bound ?? 0),
      upperBound: Number(row.upper_bound ?? 0),
      weatherInfluence: row.weather ?? null,
      metadata: row.metadata ?? {},
      generatedAt: new Date(row.generated_at ?? new Date()).toISOString(),
    })) ?? [];
  }

  async listActuals(
    metric: ForecastMetric,
    options: { branchId?: string | null; cohort?: CohortFilter | null; startDate: Date; endDate: Date },
  ): Promise<HistoricalMetricRow[]> {
    return this.loadHistoricalMetrics(metric, options);
  }
}

class SeasonalWeatherClient implements WeatherClient {
  async getFactors(params: { startDate: Date; horizonDays: number; location?: string | null }): Promise<WeatherFactor[]> {
    const results: WeatherFactor[] = [];
    for (let offset = 0; offset < params.horizonDays; offset++) {
      const date = new Date(params.startDate);
      date.setDate(date.getDate() + offset);
      const month = date.getUTCMonth();
      const baseTemp = [19, 21, 24, 28, 33, 37, 39, 38, 34, 30, 25, 21][month] ?? 25;
      const precipitation = [0.1, 0.15, 0.2, 0.1, 0.05, 0.02, 0.01, 0.01, 0.05, 0.08, 0.12, 0.18][month] ?? 0.1;
      const seasonalBias = 1 + Math.sin(((month + 1) / 12) * Math.PI * 2) * 0.08;
      results.push({
        date: date.toISOString().slice(0, 10),
        temperatureC: Number((baseTemp + Math.sin(offset / 7) * 2).toFixed(2)),
        precipitationProbability: Number(Math.min(1, Math.max(0, precipitation + Math.cos(offset / 5) * 0.05)).toFixed(2)),
        seasonalityIndex: Number(seasonalBias.toFixed(3)),
      });
    }
    return results;
  }
}

function computeTrendSlope(rows: HistoricalMetricRow[], metric: ForecastMetric): number {
  if (rows.length < 2) return 0;
  const series = rows.map((row) => (metric === "orders" ? row.orders : row.revenue));
  const first = series[0];
  const last = series[series.length - 1];
  return (last - first) / (rows.length - 1);
}

function computeBaseline(rows: HistoricalMetricRow[], metric: ForecastMetric): number {
  if (!rows.length) return 0;
  const series = rows.map((row) => (metric === "orders" ? row.orders : metric === "revenue" ? row.revenue : row.revenue / Math.max(1, row.orders)));
  const total = series.reduce((acc, value) => acc + value, 0);
  return total / series.length;
}

function toAverageOrderValue(orders: number, revenue: number): number {
  if (orders <= 0) return 0;
  return revenue / orders;
}

export interface ForecastingServiceOptions {
  repository?: ForecastingRepository;
  weatherClient?: WeatherClient;
  clock?: () => Date;
}

export class ForecastingService {
  private readonly repository: ForecastingRepository;
  private readonly weatherClient: WeatherClient;
  private readonly clock: () => Date;

  constructor(options: ForecastingServiceOptions = {}) {
    this.repository = options.repository ?? new PostgresForecastingRepository();
    this.weatherClient = options.weatherClient ?? new SeasonalWeatherClient();
    this.clock = options.clock ?? (() => new Date());
  }

  async runJob(options: ForecastingJobOptions): Promise<ForecastRecord[]> {
    const historyDays = options.historyDays ?? DEFAULT_HISTORY_DAYS;
    const horizonDays = options.horizonDays ?? DEFAULT_HORIZON_DAYS;
    const endDate = this.clock();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - historyDays);

    const historical = await this.repository.loadHistoricalMetrics(options.metric, {
      branchId: options.branchId ?? null,
      cohort: options.cohort ?? null,
      startDate,
      endDate,
    });

    const baseline = computeBaseline(historical, options.metric);
    const slope = computeTrendSlope(historical, options.metric);
    const weatherFactors = await this.weatherClient.getFactors({
      startDate: endDate,
      horizonDays,
      location: options.location ?? null,
    });

    const cohortKey = computeCohortKey(options.cohort);
    const records: ForecastRecord[] = [];

    for (let index = 0; index < horizonDays; index++) {
      const factor = weatherFactors[index] ?? null;
      const date = new Date(endDate);
      date.setDate(endDate.getDate() + index + 1);

      const trendValue = baseline + slope * (index + 1);
      const adjusted = trendValue * (factor?.seasonalityIndex ?? 1);
      const weatherPenalty = factor ? 1 - factor.precipitationProbability * 0.1 : 1;
      const finalValue = adjusted * weatherPenalty;

      const metricValue = options.metric === "average_order_value"
        ? finalValue
        : Math.max(0, finalValue);

      const confidence = Math.max(0.05, 0.25 - index * 0.01);
      const lowerBound = Math.max(0, metricValue * (1 - confidence));
      const upperBound = metricValue * (1 + confidence);

      records.push({
        id: randomUUID(),
        metric: options.metric,
        targetDate: date.toISOString().slice(0, 10),
        branchId: options.branchId ?? null,
        cohort: options.cohort ?? null,
        cohortKey,
        horizonDays: index + 1,
        value: Number(metricValue.toFixed(2)),
        lowerBound: Number(lowerBound.toFixed(2)),
        upperBound: Number(upperBound.toFixed(2)),
        weatherInfluence: factor,
        metadata: {
          baseline: Number(baseline.toFixed(2)),
          slope: Number(slope.toFixed(4)),
          weatherPenalty: Number(weatherPenalty.toFixed(3)),
        },
        generatedAt: new Date().toISOString(),
      });
    }

    if (options.metric === "average_order_value") {
      for (const record of records) {
        const historicalOrders = historical.map((row) => row.orders);
        const historicalRevenue = historical.map((row) => row.revenue);
        const avgOrders = historicalOrders.reduce((acc, value) => acc + value, 0) / Math.max(1, historicalOrders.length);
        const avgRevenue = historicalRevenue.reduce((acc, value) => acc + value, 0) / Math.max(1, historicalRevenue.length);
        const derivedAov = toAverageOrderValue(avgOrders, avgRevenue);
        record.metadata = { ...record.metadata, derivedFromHistorical: Number(derivedAov.toFixed(2)) };
      }
    }

    await this.repository.replaceForecasts(records);
    return records;
  }

  async getForecasts(options: ForecastQueryOptions): Promise<ForecastRecord[]> {
    return this.repository.listForecasts(options);
  }

  async evaluateAccuracy(options: AccuracyRequest): Promise<ForecastAccuracy> {
    const compareDays = options.compareDays ?? 14;
    const endDate = this.clock();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - compareDays);
    const cohort = options.cohort ?? null;

    const actuals = await this.repository.listActuals(options.metric, {
      branchId: options.branchId ?? null,
      cohort,
      startDate,
      endDate,
    });

    const forecasts = await this.repository.listForecasts({
      metric: options.metric,
      branchId: options.branchId ?? null,
      cohort,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    });

    const actualLookup = new Map(actuals.map((row) => [row.date, options.metric === "orders" ? row.orders : options.metric === "revenue" ? row.revenue : toAverageOrderValue(row.orders, row.revenue)]));
    let absolutePercentageErrorSum = 0;
    let absoluteErrorSum = 0;
    let count = 0;

    for (const forecast of forecasts) {
      const actual = actualLookup.get(forecast.targetDate);
      if (typeof actual === "number" && !Number.isNaN(actual)) {
        const error = Math.abs(actual - forecast.value);
        const ape = actual === 0 ? 0 : Math.abs(error / actual);
        absoluteErrorSum += error;
        absolutePercentageErrorSum += ape;
        count += 1;
      }
    }

    if (count === 0) {
      return { meanAbsoluteError: 0, meanAbsolutePercentageError: 0, sampleSize: 0 };
    }

    return {
      meanAbsoluteError: Number((absoluteErrorSum / count).toFixed(2)),
      meanAbsolutePercentageError: Number((absolutePercentageErrorSum / count).toFixed(4)),
      sampleSize: count,
    };
  }

  async getHistoricalSeries(options: {
    metric: ForecastMetric;
    branchId?: string | null;
    cohort?: CohortFilter | null;
    startDate: string;
    endDate: string;
  }): Promise<HistoricalMetricRow[]> {
    const start = new Date(options.startDate);
    const end = new Date(options.endDate);
    return this.repository.listActuals(options.metric, {
      branchId: options.branchId ?? null,
      cohort: options.cohort ?? null,
      startDate: start,
      endDate: end,
    });
  }
}

export { PostgresForecastingRepository, SeasonalWeatherClient };
