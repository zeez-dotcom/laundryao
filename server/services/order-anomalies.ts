import type { Logger } from "pino";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { orders } from "@shared/schema";
import { db } from "../db";
import { __testOnly__normalizeOrderItems } from "./order-suggestions";

interface FetchOrdersParams {
  branchId: string;
  customerId?: string;
  limit?: number;
}

interface OrderRecord {
  id: string;
  createdAt: string;
  total: number;
  items: unknown;
  customerId: string | null;
}

export type OrderAnomalyType = "price_spike" | "possible_duplicate";
export type OrderAnomalySeverity = "low" | "medium" | "high";

export interface OrderAnomalyAlert {
  id: string;
  type: OrderAnomalyType;
  severity: OrderAnomalySeverity;
  message: string;
  orderId?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface OrderAnomalyAuditEvent {
  orderId: string;
  branchId: string;
  customerId?: string;
  severity: OrderAnomalySeverity;
  type: OrderAnomalyType;
  message: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface OrderAnomalyDetectionResult {
  anomalies: OrderAnomalyAlert[];
  auditTrail: OrderAnomalyAuditEvent[];
}

interface OrderAnomaliesOptions {
  fetchRecentOrders?: (params: FetchOrdersParams) => Promise<OrderRecord[]>;
  logger?: Pick<Logger, "info" | "warn" | "error">;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function fetchOrdersFromDb(params: FetchOrdersParams): Promise<OrderRecord[]> {
  const rows = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      total: orders.total,
      items: orders.items,
      customerId: orders.customerId,
      branchId: orders.branchId,
    })
    .from(orders)
    .where(and(eq(orders.branchId, params.branchId), eq(orders.isDeliveryRequest, false)))
    .orderBy(desc(orders.createdAt))
    .limit(params.limit ?? 25);

  return rows
    .filter((row) => (params.customerId ? row.customerId === params.customerId : true))
    .map((row) => ({
      id: row.id,
      createdAt: new Date(row.createdAt).toISOString(),
      total: toNumber(row.total),
      items: row.items,
      customerId: row.customerId,
    }));
}

export class OrderAnomaliesService {
  private readonly fetchRecentOrders: (params: FetchOrdersParams) => Promise<OrderRecord[]>;
  private readonly logger: Pick<Logger, "info" | "warn" | "error"> | null;

  constructor(options: OrderAnomaliesOptions = {}) {
    this.fetchRecentOrders = options.fetchRecentOrders ?? fetchOrdersFromDb;
    this.logger = options.logger ?? null;
  }

  async detect(params: FetchOrdersParams): Promise<OrderAnomalyDetectionResult> {
    const orders = await this.fetchRecentOrders({
      branchId: params.branchId,
      customerId: params.customerId,
      limit: 50,
    });

    if (!orders.length) {
      return { anomalies: [], auditTrail: [] };
    }

    const sorted = [...orders].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const anomalies: OrderAnomalyAlert[] = [];
    const auditTrail: OrderAnomalyAuditEvent[] = [];

    const priceSpike = this.detectPriceSpike(sorted);
    if (priceSpike) {
      anomalies.push(priceSpike.alert);
      auditTrail.push({
        ...priceSpike.audit,
        branchId: params.branchId,
        customerId: params.customerId,
      });
    }

    const duplicate = this.detectDuplicate(sorted);
    if (duplicate) {
      anomalies.push(duplicate.alert);
      auditTrail.push({
        ...duplicate.audit,
        branchId: params.branchId,
        customerId: params.customerId,
      });
    }

    return { anomalies, auditTrail };
  }

  private detectPriceSpike(orders: OrderRecord[]) {
    if (orders.length < 3) return null;
    const latest = orders[orders.length - 1];
    const prior = orders.slice(0, -1);
    const average = prior.reduce((sum, order) => sum + order.total, 0) / prior.length;
    const baseline = Math.max(average, 1);
    const ratio = latest.total / baseline;

    if (ratio < 1.4 || latest.total - baseline < 75) {
      return null;
    }

    const severity: OrderAnomalySeverity = ratio >= 2 ? "high" : ratio >= 1.7 ? "medium" : "low";
    const message = `Recent order total E£${latest.total.toFixed(2)} is ${ratio.toFixed(1)}x customer baseline (E£${baseline.toFixed(
      2,
    )})`;

    return {
      alert: {
        id: randomUUID(),
        type: "price_spike",
        severity,
        message,
        orderId: latest.id,
        occurredAt: latest.createdAt,
        metadata: {
          baseline,
          observedTotal: latest.total,
          ratio: Number(ratio.toFixed(2)),
        },
      },
      audit: {
        orderId: latest.id ?? `draft:${orders[0]?.customerId ?? "unknown"}`,
        severity,
        type: "price_spike" as const,
        message,
        occurredAt: latest.createdAt,
        metadata: {
          baseline,
          observedTotal: latest.total,
          ratio: Number(ratio.toFixed(2)),
        },
      },
    };
  }

  private detectDuplicate(orders: OrderRecord[]) {
    if (orders.length < 2) return null;
    const signatures = new Map<
      string,
      { order: OrderRecord; signature: string; items: ReturnType<typeof __testOnly__normalizeOrderItems> }
    >();

    for (const order of orders) {
      const items = __testOnly__normalizeOrderItems(order.items).sort((a, b) =>
        a.serviceName.localeCompare(b.serviceName) || a.clothingItemName.localeCompare(b.clothingItemName),
      );
      const signature = JSON.stringify(
        items.map((item) => ({
          service: item.serviceName,
          clothing: item.clothingItemName,
          quantity: item.quantity,
        })),
      );
      signatures.set(order.id, { order, signature, items });
    }

    const sorted = Array.from(signatures.values()).sort(
      (a, b) => new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime(),
    );

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      for (let j = i - 1; j >= 0; j--) {
        const previous = sorted[j];
        const deltaHours =
          Math.abs(new Date(current.order.createdAt).getTime() - new Date(previous.order.createdAt).getTime()) /
          (60 * 60 * 1000);
        if (deltaHours > 8) break;
        if (current.signature === previous.signature && Math.abs(current.order.total - previous.order.total) < 1) {
          const severity: OrderAnomalySeverity = deltaHours < 1 ? "high" : deltaHours < 3 ? "medium" : "low";
          const message = `Orders ${previous.order.id} and ${current.order.id} share identical items within ${deltaHours.toFixed(
            1,
          )}h`;
          const occurredAt = current.order.createdAt;
          return {
            alert: {
              id: randomUUID(),
              type: "possible_duplicate" as const,
              severity,
              message,
              orderId: current.order.id,
              occurredAt,
              metadata: {
                duplicateOf: previous.order.id,
                hoursApart: Number(deltaHours.toFixed(2)),
                total: current.order.total,
              },
            },
            audit: {
              orderId: current.order.id ?? `draft:${previous.order.customerId ?? "unknown"}`,
              severity,
              type: "possible_duplicate" as const,
              message,
              occurredAt,
              metadata: {
                duplicateOf: previous.order.id,
                hoursApart: Number(deltaHours.toFixed(2)),
                total: current.order.total,
              },
            },
          };
        }
      }
    }

    return null;
  }
}
