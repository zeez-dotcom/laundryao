import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  customers,
  dataQualityExceptions,
  dataQualityRuns,
  orders,
  payments,
} from "@shared/schema";
import { db } from "../db";
import { sql, and, eq, isNull, isNotNull } from "drizzle-orm";
import logger from "../logger";

export type DataQualityCheckName =
  | "referential_integrity"
  | "order_anomaly_detection";

export interface DataQualityServiceOptions {
  intervalMinutes?: number;
  logger?: Pick<Logger, "info" | "warn" | "error">;
}

interface ReferentialException {
  entityType: string;
  entityId: string;
  referenceField: string;
  missingId: string;
}

interface OrderAnomalyException {
  orderId: string;
  branchId: string;
  observedTotal: number;
  expectedAverage: number;
  stddev: number;
}

const DEFAULT_CHECKS: DataQualityCheckName[] = [
  "referential_integrity",
  "order_anomaly_detection",
];

export class DataQualityService {
  private readonly intervalMs: number;
  private readonly logger: Pick<Logger, "info" | "warn" | "error">;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: DataQualityServiceOptions = {}) {
    const intervalMinutes = options.intervalMinutes ?? Number(process.env.DATA_QUALITY_INTERVAL_MINUTES ?? 360);
    this.intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000;
    this.logger = options.logger ?? logger;
  }

  start(): void {
    if (this.timer) return;
    this.logger.info({ intervalMs: this.intervalMs }, "Starting data quality service");
    this.runAllChecks().catch((error) => {
      this.logger.error({ err: error }, "Initial data quality run failed");
    });
    this.timer = setInterval(() => {
      this.runAllChecks().catch((error) => {
        this.logger.error({ err: error }, "Scheduled data quality run failed");
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info("Stopped data quality service");
    }
  }

  async runAllChecks(): Promise<void> {
    const [run] = await db
      .insert(dataQualityRuns)
      .values({
        status: "running",
        checkTypes: JSON.stringify(DEFAULT_CHECKS),
      })
      .returning({ id: dataQualityRuns.id });

    const runId = run?.id ?? randomUUID();

    try {
      await this.runReferentialIntegrityCheck(runId);
      await this.runOrderAnomalyCheck(runId);
      await db
        .update(dataQualityRuns)
        .set({
          status: "succeeded",
          completedAt: new Date(),
        })
        .where(eq(dataQualityRuns.id, runId));
      this.logger.info({ runId }, "Completed data quality checks");
    } catch (error) {
      await db
        .update(dataQualityRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
        })
        .where(eq(dataQualityRuns.id, runId));
      this.logger.error({ err: error, runId }, "Data quality checks failed");
      throw error;
    }
  }

  private async runReferentialIntegrityCheck(runId: string): Promise<void> {
    const orphanOrders = await db
      .select({ orderId: orders.id, customerId: orders.customerId })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(isNotNull(orders.customerId), isNull(customers.id)))
      .limit(200);

    const orphanPayments = await db
      .select({ paymentId: payments.id, orderId: payments.orderId })
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .where(and(isNotNull(payments.orderId), isNull(orders.id)))
      .limit(200);

    const exceptions: ReferentialException[] = [];

    for (const orphan of orphanOrders) {
      if (!orphan.orderId || !orphan.customerId) continue;
      exceptions.push({
        entityType: "order",
        entityId: orphan.orderId,
        referenceField: "customer_id",
        missingId: orphan.customerId,
      });
    }

    for (const orphan of orphanPayments) {
      if (!orphan.paymentId || !orphan.orderId) continue;
      exceptions.push({
        entityType: "payment",
        entityId: orphan.paymentId,
        referenceField: "order_id",
        missingId: orphan.orderId,
      });
    }

    for (const exception of exceptions) {
      await db.insert(dataQualityExceptions).values({
        runId,
        checkName: "referential_integrity",
        severity: "critical",
        entityType: exception.entityType,
        entityId: exception.entityId,
        details: {
          referenceField: exception.referenceField,
          missingId: exception.missingId,
        },
      });
    }

    if (exceptions.length) {
      this.logger.warn({ runId, count: exceptions.length }, "Referential integrity issues detected");
    }
  }

  private async runOrderAnomalyCheck(runId: string): Promise<void> {
    const result = await db.execute(sql`
      WITH recent AS (
        SELECT
          id,
          branch_id,
          total::numeric AS total,
          created_at
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND is_delivery_request = false
      ), stats AS (
        SELECT
          branch_id,
          AVG(total) AS avg_total,
          STDDEV_POP(total) AS std_total
        FROM recent
        GROUP BY branch_id
      )
      SELECT
        r.id AS order_id,
        r.branch_id,
        r.total,
        s.avg_total,
        s.std_total
      FROM recent r
      JOIN stats s ON s.branch_id = r.branch_id
      WHERE s.std_total IS NOT NULL
        AND s.std_total > 0
        AND (
          r.total > s.avg_total + s.std_total * 3
          OR r.total < GREATEST(s.avg_total - s.std_total * 3, 0)
        )
      ORDER BY r.created_at DESC
      LIMIT 200
    `);

    const rows = result.rows ?? [];
    if (!rows.length) {
      return;
    }

    for (const row of rows) {
      const details: OrderAnomalyException = {
        orderId: String(row.order_id),
        branchId: String(row.branch_id ?? ""),
        observedTotal: Number(row.total ?? 0),
        expectedAverage: Number(row.avg_total ?? 0),
        stddev: Number(row.std_total ?? 0),
      };

      await db.insert(dataQualityExceptions).values({
        runId,
        checkName: "order_anomaly_detection",
        severity: "medium",
        entityType: "order",
        entityId: details.orderId,
        details,
      });
    }

    this.logger.warn({ runId, count: rows.length }, "Order anomalies detected");
  }
}
