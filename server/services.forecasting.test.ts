import test from "node:test";
import assert from "node:assert/strict";

import {
  ForecastingService,
  type ForecastingRepository,
  type ForecastRecord,
  type ForecastMetric,
  type CohortFilter,
  type HistoricalMetricRow,
  type WeatherClient,
  type WeatherFactor,
} from "./services/forecasting";

class InMemoryForecastingRepository implements ForecastingRepository {
  private forecasts: ForecastRecord[] = [];
  private readonly historical: HistoricalMetricRow[] = [];

  constructor(rows: HistoricalMetricRow[] = []) {
    this.historical = rows;
  }

  ensureSchema(): Promise<void> {
    return Promise.resolve();
  }

  loadHistoricalMetrics(
    metric: ForecastMetric,
    options: { branchId?: string | null; cohort?: CohortFilter | null; startDate: Date; endDate: Date },
  ): Promise<HistoricalMetricRow[]> {
    const start = options.startDate.toISOString().slice(0, 10);
    const end = options.endDate.toISOString().slice(0, 10);
    return Promise.resolve(
      this.historical
        .filter((row) => row.date >= start && row.date <= end)
        .map((row) => ({ ...row })),
    );
  }

  replaceForecasts(records: ForecastRecord[]): Promise<void> {
    const key = `${records[0]?.metric ?? "revenue"}:${records[0]?.cohortKey ?? "__all__"}`;
    this.forecasts = this.forecasts.filter((record) => `${record.metric}:${record.cohortKey}` !== key);
    this.forecasts.push(...records);
    return Promise.resolve();
  }

  listForecasts(options: { metric: ForecastMetric; branchId?: string | null; cohort?: CohortFilter | null; startDate?: string; endDate?: string }): Promise<ForecastRecord[]> {
    const start = options.startDate ?? "0000-00-00";
    const end = options.endDate ?? "9999-12-31";
    const cohortKey = options.cohort ? `${options.cohort.id}:${options.cohort.label}` : "__all__";
    return Promise.resolve(
      this.forecasts
        .filter((record) => record.metric === options.metric)
        .filter((record) => record.cohortKey === (options.cohort ? record.cohortKey : record.cohortKey))
        .filter((record) => record.targetDate >= start && record.targetDate <= end)
        .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
        .map((record) => ({ ...record })),
    );
  }

  listActuals(metric: ForecastMetric, options: { branchId?: string | null; cohort?: CohortFilter | null; startDate: Date; endDate: Date }): Promise<HistoricalMetricRow[]> {
    return this.loadHistoricalMetrics(metric, options);
  }

  appendActual(rows: HistoricalMetricRow[]): void {
    this.historical.push(...rows);
  }
}

class StaticWeatherClient implements WeatherClient {
  constructor(private readonly index = 1) {}
  async getFactors(params: { startDate: Date; horizonDays: number; location?: string | null }): Promise<WeatherFactor[]> {
    const factors: WeatherFactor[] = [];
    for (let day = 0; day < params.horizonDays; day++) {
      const date = new Date(params.startDate);
      date.setDate(date.getDate() + day + 1);
      factors.push({
        date: date.toISOString().slice(0, 10),
        temperatureC: 25,
        precipitationProbability: 0.1,
        seasonalityIndex: 1 + this.index * 0.01,
      });
    }
    return factors;
  }
}

function buildHistoricalSeries(days: number, startDate: string, baseRevenue: number, growth: number): HistoricalMetricRow[] {
  const start = new Date(startDate);
  const rows: HistoricalMetricRow[] = [];
  for (let day = 0; day < days; day++) {
    const current = new Date(start);
    current.setDate(start.getDate() + day);
    rows.push({
      date: current.toISOString().slice(0, 10),
      orders: 80 + day,
      revenue: baseRevenue + growth * day,
    });
  }
  return rows;
}

test("forecasting service generates forward-looking projections", async () => {
  const baseRows = buildHistoricalSeries(45, "2024-01-01", 1000, 25);
  const repository = new InMemoryForecastingRepository(baseRows);
  const weather = new StaticWeatherClient();
  const clock = () => new Date("2024-02-15T00:00:00Z");
  const service = new ForecastingService({ repository, weatherClient: weather, clock });

  const forecasts = await service.runJob({ metric: "revenue", horizonDays: 7 });
  assert.equal(forecasts.length, 7);
  assert.ok(forecasts.every((record, index, list) => record.value >= 0 && (index === 0 || record.targetDate >= list[index - 1].targetDate)));

  const futureActuals = forecasts.map((forecast) => ({
    date: forecast.targetDate,
    orders: 100,
    revenue: forecast.value * 1.02,
  }));
  repository.appendActual(futureActuals);

  const accuracy = await service.evaluateAccuracy({ metric: "revenue", compareDays: 7 });
  assert.ok(accuracy.sampleSize > 0);
  assert.ok(accuracy.meanAbsolutePercentageError < 0.05);
});

test("historical series exposes revenue and order trends", async () => {
  const baseRows = buildHistoricalSeries(10, "2024-03-01", 500, 15);
  const repository = new InMemoryForecastingRepository(baseRows);
  const service = new ForecastingService({ repository, weatherClient: new StaticWeatherClient(), clock: () => new Date("2024-03-12T00:00:00Z") });

  const history = await service.getHistoricalSeries({
    metric: "orders",
    startDate: "2024-03-05",
    endDate: "2024-03-10",
  });
  assert.equal(history.length, 6);
  assert.ok(history.every((row) => row.orders >= 80));
});
