import type { Logger } from "pino";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  orders,
  type CustomerPackageWithUsage,
} from "@shared/schema";
import { db } from "../db";

export interface OrderSuggestion {
  id: string;
  label: string;
  reason: string;
  score: number;
  category: "repeat" | "seasonal" | "upsell";
  metadata?: Record<string, unknown>;
}

export interface SeasonalHighlight {
  id: string;
  label: string;
  relevance: number;
  season: string;
  description: string;
}

export interface PackageImpactSummary {
  id: string;
  packageId: string;
  name: string;
  remainingCredits: number;
  utilizationRate: number;
  estimatedSavings: number;
  expiresAt: string | null;
  recommendation: string;
}

interface OrderRecord {
  id: string;
  createdAt: string;
  total: number;
  items: unknown;
  customerId: string | null;
  branchId: string;
}

interface NormalizedOrderItem {
  serviceId?: string;
  serviceName: string;
  clothingItemId?: string;
  clothingItemName: string;
  quantity: number;
  total: number;
}

interface FetchOrdersParams {
  branchId: string;
  limit: number;
  customerId?: string;
}

interface OrderSuggestionsOptions {
  fetchCustomerOrders?: (params: FetchOrdersParams) => Promise<OrderRecord[]>;
  fetchBranchOrders?: (params: FetchOrdersParams) => Promise<OrderRecord[]>;
  logger?: Pick<Logger, "info" | "warn" | "error">;
}

export interface OrderSuggestionsInput {
  branchId: string;
  customerId?: string;
  limit?: number;
  packages?: CustomerPackageWithUsage[];
  now?: Date;
}

export interface OrderSuggestionsResult {
  suggestions: OrderSuggestion[];
  seasonalHighlights: SeasonalHighlight[];
  packageOpportunities: PackageImpactSummary[];
  metrics: {
    averageOrderValue: number;
    averageLineValue: number;
    orderCount: number;
  };
}

const DEFAULT_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeOrderItems(raw: unknown): NormalizedOrderItem[] {
  if (!Array.isArray(raw)) return [];
  const normalized: NormalizedOrderItem[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === "object") {
      const item = entry as Record<string, unknown>;
      const rawQuantity = item.quantity ?? item.qty ?? 1;
      const quantity = Math.max(0, toNumber(rawQuantity));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      const service = item.service as Record<string, unknown> | string | undefined;
      const clothing = item.clothingItem as Record<string, unknown> | string | undefined;

      const serviceName =
        typeof service === "string"
          ? service
          : typeof service?.name === "string"
          ? service.name
          : typeof item.serviceName === "string"
          ? item.serviceName
          : "Unknown service";

      const clothingName =
        typeof clothing === "string"
          ? clothing
          : typeof clothing?.name === "string"
          ? clothing.name
          : typeof item.clothingItemName === "string"
          ? item.clothingItemName
          : "Garment";

      normalized.push({
        serviceId:
          typeof service === "object" && service && typeof service.id === "string"
            ? service.id
            : typeof item.serviceId === "string"
            ? item.serviceId
            : undefined,
        serviceName,
        clothingItemId:
          typeof clothing === "object" && clothing && typeof clothing.id === "string"
            ? clothing.id
            : typeof item.clothingItemId === "string"
            ? item.clothingItemId
            : undefined,
        clothingItemName: clothingName,
        quantity,
        total: toNumber(item.total ?? item.price ?? 0),
      });
    }
  }
  return normalized;
}

async function fetchCustomerOrdersFromDb(params: FetchOrdersParams): Promise<OrderRecord[]> {
  if (!params.customerId) return [];
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
    .where(
      and(
        eq(orders.branchId, params.branchId),
        eq(orders.isDeliveryRequest, false),
        eq(orders.customerId, params.customerId),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(params.limit);

  return rows.map((row) => ({
    id: row.id,
    createdAt: new Date(row.createdAt).toISOString(),
    total: toNumber(row.total),
    items: row.items,
    customerId: row.customerId,
    branchId: row.branchId,
  }));
}

async function fetchBranchOrdersFromDb(params: FetchOrdersParams): Promise<OrderRecord[]> {
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
    .limit(params.limit);

  return rows.map((row) => ({
    id: row.id,
    createdAt: new Date(row.createdAt).toISOString(),
    total: toNumber(row.total),
    items: row.items,
    customerId: row.customerId,
    branchId: row.branchId,
  }));
}

export class OrderSuggestionsService {
  private readonly fetchCustomerOrders: (params: FetchOrdersParams) => Promise<OrderRecord[]>;
  private readonly fetchBranchOrders: (params: FetchOrdersParams) => Promise<OrderRecord[]>;
  private readonly logger: Pick<Logger, "info" | "warn" | "error"> | null;

  constructor(options: OrderSuggestionsOptions = {}) {
    this.fetchCustomerOrders = options.fetchCustomerOrders ?? fetchCustomerOrdersFromDb;
    this.fetchBranchOrders = options.fetchBranchOrders ?? fetchBranchOrdersFromDb;
    this.logger = options.logger ?? null;
  }

  async generate(input: OrderSuggestionsInput): Promise<OrderSuggestionsResult> {
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, 10));
    const now = input.now ?? new Date();
    const [customerOrders, branchOrders] = await Promise.all([
      this.fetchCustomerOrders({ branchId: input.branchId, customerId: input.customerId, limit: 50 }),
      this.fetchBranchOrders({ branchId: input.branchId, limit: 200 }),
    ]);

    const customerStats = this.buildCustomerStats(customerOrders, now);
    const seasonalHighlights = this.buildSeasonalHighlights(branchOrders, now, limit);
    const suggestions = this.buildSuggestions(customerStats, seasonalHighlights, limit);
    const metrics = this.buildMetrics(customerOrders);
    const packageOpportunities = this.buildPackageOpportunities(
      input.packages ?? [],
      customerOrders,
      metrics.averageLineValue,
      now,
    );

    return { suggestions, seasonalHighlights, packageOpportunities, metrics };
  }

  private buildCustomerStats(customerOrders: OrderRecord[], now: Date) {
    const combos = new Map<
      string,
      {
        serviceName: string;
        clothingItemName: string;
        serviceId?: string;
        clothingItemId?: string;
        quantity: number;
        total: number;
        lastPurchasedAt: Date;
      }
    >();

    for (const order of customerOrders) {
      const orderDate = new Date(order.createdAt);
      const normalized = normalizeOrderItems(order.items);
      for (const item of normalized) {
        const key = `${item.serviceId ?? item.serviceName}|${item.clothingItemId ?? item.clothingItemName}`;
        const existing = combos.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.total += item.total;
          if (existing.lastPurchasedAt < orderDate) {
            existing.lastPurchasedAt = orderDate;
          }
        } else {
          combos.set(key, {
            serviceName: item.serviceName,
            clothingItemName: item.clothingItemName,
            serviceId: item.serviceId,
            clothingItemId: item.clothingItemId,
            quantity: item.quantity,
            total: item.total,
            lastPurchasedAt: orderDate,
          });
        }
      }
    }

    const stats = Array.from(combos.values()).map((combo) => {
      const daysSince = Math.max(0, (now.getTime() - combo.lastPurchasedAt.getTime()) / DAY_MS);
      const recencyBoost = daysSince <= 45 ? 1 + (45 - daysSince) / 90 : 1;
      const score = combo.quantity * recencyBoost;
      return { ...combo, score };
    });

    stats.sort((a, b) => b.score - a.score);
    return stats;
  }

  private buildSeasonalHighlights(
    branchOrders: OrderRecord[],
    now: Date,
    limit: number,
  ): SeasonalHighlight[] {
    const currentMonth = now.getUTCMonth();
    const combos = new Map<
      string,
      {
        serviceName: string;
        clothingItemName: string;
        monthCounts: Map<number, number>;
        total: number;
      }
    >();

    for (const order of branchOrders) {
      const orderDate = new Date(order.createdAt);
      const normalized = normalizeOrderItems(order.items);
      const month = orderDate.getUTCMonth();
      for (const item of normalized) {
        const key = `${item.serviceName}|${item.clothingItemName}`;
        let entry = combos.get(key);
        if (!entry) {
          entry = {
            serviceName: item.serviceName,
            clothingItemName: item.clothingItemName,
            monthCounts: new Map(),
            total: 0,
          };
          combos.set(key, entry);
        }
        entry.monthCounts.set(month, (entry.monthCounts.get(month) ?? 0) + item.quantity);
        entry.total += item.quantity;
      }
    }

    const highlights: SeasonalHighlight[] = [];
    for (const entry of combos.values()) {
      const currentCount = entry.monthCounts.get(currentMonth) ?? 0;
      if (currentCount === 0) continue;
      const otherMonths = Array.from(entry.monthCounts.entries()).filter(([month]) => month !== currentMonth);
      const otherAverage = otherMonths.length
        ? otherMonths.reduce((sum, [, count]) => sum + count, 0) / otherMonths.length
        : entry.total / Math.max(1, entry.monthCounts.size);

      const lift = otherAverage > 0 ? currentCount / otherAverage : currentCount;
      if (lift < 1.15 || currentCount < 2) continue;

      highlights.push({
        id: randomUUID(),
        label: `${entry.serviceName} + ${entry.clothingItemName}`,
        relevance: Number(lift.toFixed(2)),
        season: new Date(Date.UTC(2000, currentMonth, 1)).toLocaleString(undefined, { month: "long" }),
        description: `Branch demand is ${lift.toFixed(1)}x typical for this combo this month`,
      });
    }

    return highlights.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  private buildSuggestions(
    stats: Array<ReturnType<OrderSuggestionsService["buildCustomerStats"]>[number]>,
    seasonalHighlights: SeasonalHighlight[],
    limit: number,
  ): OrderSuggestion[] {
    const suggestions: OrderSuggestion[] = stats.slice(0, limit).map((combo) => ({
      id: randomUUID(),
      label: `${combo.quantity}x ${combo.clothingItemName} (${combo.serviceName})`,
      reason: `Frequently ordered${combo.score > combo.quantity ? " recently" : ""}`,
      score: Number(combo.score.toFixed(2)),
      category: "repeat",
      metadata: {
        serviceId: combo.serviceId,
        clothingItemId: combo.clothingItemId,
        lastPurchasedAt: combo.lastPurchasedAt.toISOString(),
      },
    }));

    const existingLabels = new Set(suggestions.map((s) => s.label));
    for (const highlight of seasonalHighlights) {
      if (existingLabels.has(highlight.label)) continue;
      suggestions.push({
        id: highlight.id,
        label: highlight.label,
        reason: highlight.description,
        score: highlight.relevance,
        category: "seasonal",
      });
      if (suggestions.length >= limit) break;
    }

    return suggestions.slice(0, limit);
  }

  private buildMetrics(orders: OrderRecord[]) {
    if (!orders.length) {
      return { averageOrderValue: 0, averageLineValue: 0, orderCount: 0 };
    }
    let totalValue = 0;
    let totalLines = 0;
    for (const order of orders) {
      totalValue += order.total;
      const normalized = normalizeOrderItems(order.items);
      totalLines += normalized.reduce((sum, item) => sum + item.quantity, 0);
    }
    const averageOrderValue = totalValue / orders.length;
    const averageLineValue = totalLines > 0 ? totalValue / totalLines : averageOrderValue;
    return {
      averageOrderValue: Number(averageOrderValue.toFixed(2)),
      averageLineValue: Number(averageLineValue.toFixed(2)),
      orderCount: orders.length,
    };
  }

  private buildPackageOpportunities(
    packages: CustomerPackageWithUsage[],
    orders: OrderRecord[],
    averageLineValue: number,
    now: Date,
  ): PackageImpactSummary[] {
    if (!packages.length) return [];
    const results: PackageImpactSummary[] = [];
    for (const pkg of packages) {
      const remainingCredits = pkg.items?.length
        ? pkg.items.reduce((sum, item) => sum + item.balance, 0)
        : pkg.balance;
      const utilizationRate = pkg.totalCredits > 0 ? 1 - remainingCredits / pkg.totalCredits : 0;
      const estimatedSavings = Number((remainingCredits * averageLineValue).toFixed(2));
      const expiresAtIso = pkg.expiresAt ? new Date(pkg.expiresAt).toISOString() : null;
      const expiresSoon = pkg.expiresAt
        ? new Date(pkg.expiresAt).getTime() - now.getTime() <= 30 * DAY_MS
        : false;
      const recommendation = this.buildPackageRecommendation(utilizationRate, expiresSoon, orders.length);
      results.push({
        id: pkg.id,
        packageId: pkg.packageId,
        name: pkg.nameEn || pkg.nameAr || "Package",
        remainingCredits: Number(remainingCredits.toFixed(2)),
        utilizationRate: Number(utilizationRate.toFixed(2)),
        estimatedSavings,
        expiresAt: expiresAtIso,
        recommendation,
      });
    }
    return results;
  }

  private buildPackageRecommendation(utilizationRate: number, expiresSoon: boolean, orderCount: number): string {
    if (expiresSoon && utilizationRate < 0.7) {
      return "Encourage usage before credits expire";
    }
    if (utilizationRate < 0.35) {
      return orderCount > 0
        ? "Bundle package items with next order to boost engagement"
        : "Promote introductory bundle to drive first redemption";
    }
    if (utilizationRate > 0.85) {
      return "Customer is near full utilization—consider upselling a larger bundle";
    }
    return "Steady package usage—reinforce value during checkout";
  }
}

export function __testOnly__normalizeOrderItems(raw: unknown) {
  return normalizeOrderItems(raw);
}
