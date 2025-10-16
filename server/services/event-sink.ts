import type { Logger } from "pino";
import { Pool } from "pg";
import { analyticsEventSchema, type AnalyticsEvent } from "@shared/events";
import type { EventBus } from "./event-bus";

export interface WarehouseWriter {
  writeBatch(table: string, rows: Array<Record<string, unknown>>): Promise<void>;
  shutdown?(): Promise<void>;
}

const defaultLogger: Pick<Logger, "info" | "warn" | "error"> = {
  info: (...args: unknown[]) => console.info("[event-sink]", ...args),
  warn: (...args: unknown[]) => console.warn("[event-sink]", ...args),
  error: (...args: unknown[]) => console.error("[event-sink]", ...args),
};

const tableNameByCategory = {
  "order.lifecycle": "analytics_order_lifecycle_events",
  "driver.telemetry": "analytics_driver_telemetry_events",
  "campaign.interaction": "analytics_campaign_interaction_events",
} as const;

type SupportedCategory = keyof typeof tableNameByCategory;

interface EventSinkOptions {
  eventBus: EventBus;
  writer: WarehouseWriter;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  logger?: Pick<Logger, "info" | "warn" | "error">;
}

export class EventSink {
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly logger: Pick<Logger, "info" | "warn" | "error">;
  private readonly buffers = new Map<string, Array<Record<string, unknown>>>();
  private timer?: NodeJS.Timeout;
  private unsubscribe?: () => void;
  private flushing?: Promise<void>;

  constructor(private readonly options: EventSinkOptions) {
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.maxBatchSize = Math.max(1, options.maxBatchSize ?? 100);
    this.logger = options.logger ?? defaultLogger;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.options.eventBus.on((event) => {
      const validated = analyticsEventSchema.parse(event);
      this.enqueue(validated);
    });
    if (this.flushIntervalMs > 0) {
      this.timer = setInterval(() => {
        void this.flush();
      }, this.flushIntervalMs);
      this.timer.unref?.();
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    await this.flush();
    if (typeof this.options.writer.shutdown === "function") {
      await this.options.writer.shutdown();
    }
  }

  async flush(): Promise<void> {
    while (true) {
      const activeFlush = this.flushing;
      if (!activeFlush) {
        if (!this.buffers.size) {
          return;
        }
        break;
      }

      await activeFlush;

      if (this.flushing && this.flushing !== activeFlush) {
        continue;
      }

      if (!this.buffers.size) {
        return;
      }

      break;
    }

    const flushPromise = this.flushInternal();
    this.flushing = flushPromise;
    try {
      await flushPromise;
    } finally {
      if (this.flushing === flushPromise) {
        this.flushing = undefined;
      }
    }
  }

  private async flushInternal(): Promise<void> {
    const entries = Array.from(this.buffers.entries());
    this.buffers.clear();
    for (const [table, rows] of entries) {
      if (!rows.length) continue;
      try {
        await this.options.writer.writeBatch(table, rows);
      } catch (error) {
        this.logger.error({ err: error, table, count: rows.length }, "Failed to flush analytics events");
        const existing = this.buffers.get(table) ?? [];
        this.buffers.set(table, rows.concat(existing));
      }
    }
  }

  private enqueue(event: AnalyticsEvent): void {
    const mapped = mapEventToRow(event);
    if (!mapped) return;
    const buffer = this.buffers.get(mapped.table) ?? [];
    buffer.push(mapped.row);
    this.buffers.set(mapped.table, buffer);
    if (buffer.length >= this.maxBatchSize) {
      void this.flush();
    }
  }
}

export class PostgresWarehouseWriter implements WarehouseWriter {
  private readonly pool: Pool;
  private readonly logger: Pick<Logger, "info" | "warn" | "error">;
  private readonly allowedTables = new Set<string>(Object.values(tableNameByCategory));

  constructor(connectionString: string, logger?: Pick<Logger, "info" | "warn" | "error">) {
    this.pool = new Pool({ connectionString });
    this.logger = logger ?? defaultLogger;
  }

  async writeBatch(table: string, rows: Array<Record<string, unknown>>): Promise<void> {
    if (!rows.length) return;
    if (!this.allowedTables.has(table)) {
      throw new Error(`Table ${table} is not permitted for analytics ingestion`);
    }
    const columns = Object.keys(rows[0]);
    const values: unknown[] = [];
    const tuples = rows.map((row, rowIndex) => {
      return `(${columns
        .map((column, columnIndex) => {
          values.push(row[column] ?? null);
          return `$${rowIndex * columns.length + columnIndex + 1}`;
        })
        .join(", ")})`;
    });
    const sql = `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${tuples.join(", ")}
      ON CONFLICT (event_id) DO NOTHING`;
    await this.pool.query({ text: sql, values });
    this.logger.info({ table, count: rows.length }, "Flushed analytics events");
  }

  async shutdown(): Promise<void> {
    await this.pool.end();
  }
}

export function createPostgresWarehouseWriterFromEnv(logger?: Pick<Logger, "info" | "warn" | "error">): PostgresWarehouseWriter | null {
  const connection = process.env.WAREHOUSE_DATABASE_URL;
  if (!connection) return null;
  return new PostgresWarehouseWriter(connection, logger);
}

function mapEventToRow(event: AnalyticsEvent): { table: string; row: Record<string, unknown> } | null {
  const table = tableNameByCategory[event.category as SupportedCategory];
  if (!table) {
    return null;
  }

  const baseRow = {
    event_id: event.eventId,
    occurred_at: event.occurredAt,
    source: event.source,
    schema_version: event.schemaVersion,
    actor_id: event.actor?.actorId ?? null,
    actor_type: event.actor?.actorType ?? null,
    actor_name: event.actor?.actorName ?? null,
    context: event.context ? JSON.stringify(event.context) : null,
    payload: JSON.stringify(event.payload),
  } as Record<string, unknown>;

  if (event.category === "order.lifecycle") {
    const payload = event.payload as AnalyticsEvent["payload"] & {
      orderId: string;
      branchId?: string | null;
      customerId?: string | null;
      deliveryId?: string | null;
      previousStatus?: string | null;
      promisedReadyDate?: string | null;
      deliveryStatus?: string | null;
      total?: number | null;
    };
    return {
      table,
      row: {
        ...baseRow,
        order_id: payload.orderId,
        branch_id: payload.branchId ?? null,
        customer_id: payload.customerId ?? null,
        delivery_id: payload.deliveryId ?? null,
        status: payload.status,
        previous_status: payload.previousStatus ?? null,
        promised_ready_date: payload.promisedReadyDate ?? null,
        delivery_status: payload.deliveryStatus ?? null,
        total: payload.total ?? null,
      },
    };
  }

  if (event.category === "driver.telemetry") {
    const payload = event.payload as AnalyticsEvent["payload"] & {
      driverId: string;
      lat: number;
      lng: number;
      heading?: number | null;
      speedKph?: number | null;
      accuracyMeters?: number | null;
      orderId?: string | null;
      deliveryId?: string | null;
    };
    return {
      table,
      row: {
        ...baseRow,
        driver_id: payload.driverId,
        lat: payload.lat,
        lng: payload.lng,
        heading: payload.heading ?? null,
        speed_kph: payload.speedKph ?? null,
        accuracy_meters: payload.accuracyMeters ?? null,
        order_id: payload.orderId ?? null,
        delivery_id: payload.deliveryId ?? null,
      },
    };
  }

  if (event.category === "campaign.interaction") {
    const payload = event.payload as AnalyticsEvent["payload"] & {
      customerId: string;
      campaignId?: string | null;
      branchId?: string | null;
      channel?: string | null;
      templateKey?: string | null;
      status?: string | null;
      reason?: string | null;
    };
    return {
      table,
      row: {
        ...baseRow,
        customer_id: payload.customerId,
        campaign_id: payload.campaignId ?? null,
        branch_id: payload.branchId ?? null,
        channel: payload.channel ?? null,
        template_key: payload.templateKey ?? null,
        status: payload.status ?? null,
        reason: payload.reason ?? null,
      },
    };
  }

  return null;
}

export function getAnalyticsTableName(category: SupportedCategory): string {
  return tableNameByCategory[category];
}
