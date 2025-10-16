import DataLoader from "dataloader";
import { GraphQLScalarType, Kind } from "graphql";
import type {
  Customer,
  CustomerAddress,
  CustomerEngagementPlan,
  DeliveryOrder,
  Order,
  UserWithBranch,
} from "@shared/schema";
import type { IStorage } from "../../storage";
import type { CustomerInsightSummaryRecord, CustomerInsightsService } from "../../services/customer-insights";
import type {
  AssignmentPlan,
  DeliveryOptimizationService,
} from "../../services/delivery-optimization";
import type { WorkflowEngine } from "../../services/workflows/engine";

interface DeliveryOptimizationSummary {
  driverId: string;
  etaMinutes: number;
  distanceKm: number;
  confidence: number;
  reasons: string[];
}

export interface GraphqlServices {
  customerInsightsService: CustomerInsightsService;
  optimizationService: DeliveryOptimizationService;
}

export interface GraphqlContext {
  user: UserWithBranch | undefined;
  tenantId: string | null;
  storage: IStorage;
  services: GraphqlServices;
  loaders: GraphqlLoaders;
}

export interface CreateResolversOptions {
  storage: IStorage;
  workflowEngine: WorkflowEngine;
  services: GraphqlServices;
}

export interface CreateLoadersOptions {
  storage: IStorage;
  services: GraphqlServices;
  branchId?: string | null;
}

export interface GraphqlLoaders {
  customerById: DataLoader<string, Customer | undefined>;
  orderById: DataLoader<string, Order | undefined>;
  ordersByCustomer: DataLoader<string, (Order & { paid?: string; remaining?: string; balanceDue?: string | null })[]>;
  deliveryOptimization: DataLoader<string, DeliveryOptimizationSummary | null> | null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toISOString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function normalizeOrder(order: Order & { paid?: string; remaining?: string; balanceDue?: string | null }) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    paymentMethod: order.paymentMethod,
    isDeliveryRequest: Boolean(order.isDeliveryRequest),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: Array.isArray(order.items) ? (order.items as unknown[]) : [],
    financials: {
      subtotal: toNumber(order.subtotal),
      tax: toNumber(order.tax),
      total: toNumber(order.total),
      paid: "paid" in order ? toNumber((order as any).paid) : undefined,
      balanceDue:
        "balanceDue" in order && order.balanceDue != null ? toNumber(order.balanceDue) : undefined,
      remaining: "remaining" in order ? toNumber((order as any).remaining) : undefined,
    },
  };
}

function buildTimelineSummary(orders: Order[]): string[] {
  return orders
    .slice(0, 10)
    .map((order) => `Order ${order.orderNumber} moved to ${order.status}`);
}

function resolveTopServices(orders: Order[]): string[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (!Array.isArray(order.items)) continue;
    for (const item of order.items as Array<Record<string, unknown>>) {
      const service = item?.service as Record<string, unknown> | string | undefined;
      const name =
        typeof service === "string"
          ? service
          : typeof service?.name === "string"
          ? service.name
          : typeof item?.serviceName === "string"
          ? (item.serviceName as string)
          : "Laundry";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
}

function createOptimizationLoader(
  service: DeliveryOptimizationService,
): DataLoader<string, DeliveryOptimizationSummary | null> {
  return new DataLoader(async (keys) => {
    const grouped = new Map<string, string[]>();
    for (const key of keys) {
      const [branchId, deliveryId] = key.split(":", 2);
      const bucket = grouped.get(branchId) ?? [];
      bucket.push(deliveryId);
      grouped.set(branchId, bucket);
    }

    const results = new Map<string, DeliveryOptimizationSummary | null>();

    await Promise.all(
      Array.from(grouped.entries()).map(async ([branchId, deliveryIds]) => {
        if (!branchId) {
          for (const id of deliveryIds) {
            results.set(`:${id}`, null);
          }
          return;
        }
        const plan: AssignmentPlan = await service.recommendAssignments({
          branchId,
          deliveryIds,
        });
        for (const assignment of plan.assignments) {
          results.set(`${branchId}:${assignment.deliveryId}`, {
            driverId: assignment.driverId,
            etaMinutes: assignment.etaMinutes,
            distanceKm: assignment.distanceKm,
            confidence: assignment.confidence,
            reasons: assignment.reasons,
          });
        }
        for (const id of deliveryIds) {
          const key = `${branchId}:${id}`;
          if (!results.has(key)) {
            results.set(key, null);
          }
        }
      }),
    );

    return keys.map((key) => results.get(key) ?? null);
  });
}

export function createLoaders(options: CreateLoadersOptions): GraphqlLoaders {
  const { storage, services, branchId } = options;

  const customerById = new DataLoader<string, Customer | undefined>(async (ids) => {
    const rows = await storage.getCustomersByIds(Array.from(new Set(ids)), branchId ?? undefined);
    const map = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => map.get(id));
  });

  const orderById = new DataLoader<string, Order | undefined>(async (ids) => {
    const unique = Array.from(new Set(ids));
    const fetched = await Promise.all(unique.map((id) => storage.getOrder(id, branchId ?? undefined)));
    const map = new Map<string, Order | undefined>();
    unique.forEach((id, index) => {
      map.set(id, fetched[index] ?? undefined);
    });
    return ids.map((id) => map.get(id));
  });

  const ordersByCustomer = new DataLoader<
    string,
    (Order & { paid?: string; remaining?: string; balanceDue?: string | null })[]
  >(async (customerIds) => {
    return Promise.all(
      customerIds.map((customerId) => storage.getOrdersByCustomer(customerId, branchId ?? undefined)),
    );
  });

  const optimization = createOptimizationLoader(services.optimizationService);

  return {
    customerById,
    orderById,
    ordersByCustomer,
    deliveryOptimization: optimization,
  };
}

const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO-8601 compliant date time scalar",
  serialize(value) {
    const iso = toISOString(value);
    if (!iso) {
      throw new TypeError("DateTime serialization failed");
    }
    return iso;
  },
  parseValue(value) {
    if (typeof value !== "string") {
      throw new TypeError("DateTime must be provided as a string");
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError("Invalid DateTime value");
    }
    return parsed;
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) {
      throw new TypeError("DateTime literal must be a string");
    }
    const parsed = new Date(ast.value);
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError("Invalid DateTime literal");
    }
    return parsed;
  },
});

const JSONObjectScalar = new GraphQLScalarType({
  name: "JSONObject",
  description: "Generic JSON object",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral(ast) {
    switch (ast.kind) {
      case Kind.STRING:
        return ast.value;
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
      case Kind.FLOAT:
        return Number(ast.value);
      case Kind.NULL:
        return null;
      case Kind.OBJECT: {
        const value: Record<string, unknown> = {};
        for (const field of ast.fields) {
          value[field.name.value] = JSONObjectScalar.parseLiteral(field.value, {} as any);
        }
        return value;
      }
      case Kind.LIST:
        return ast.values.map((v) => JSONObjectScalar.parseLiteral(v, {} as any));
      default:
        return null;
    }
  },
});

export function createResolvers(options: CreateResolversOptions) {
  const { storage, workflowEngine, services } = options;

  return {
    DateTime: DateTimeScalar,
    JSONObject: JSONObjectScalar,
    Query: {
      me: (_root: unknown, _args: unknown, ctx: GraphqlContext) => {
        return ctx.user ?? null;
      },
      customer: async (_root: unknown, args: { id: string }, ctx: GraphqlContext) => {
        return await storage.getCustomer(args.id, ctx.tenantId ?? undefined);
      },
      customers: async (
        _root: unknown,
        args: { search?: string | null; includeInactive?: boolean | null; limit?: number | null; offset?: number | null },
        ctx: GraphqlContext,
      ) => {
        const result = await storage.getCustomers(
          args.search ?? undefined,
          Boolean(args.includeInactive),
          ctx.tenantId ?? undefined,
          args.limit ?? undefined,
          args.offset ?? undefined,
        );
        return {
          items: result.items,
          total: result.total,
        };
      },
      order: async (_root: unknown, args: { id: string }, ctx: GraphqlContext) => {
        const order = await ctx.loaders.orderById.load(args.id);
        return order ? normalizeOrder(order) : null;
      },
      orders: async (
        _root: unknown,
        args: { customerId?: string | null; status?: string | null; limit?: number | null },
        ctx: GraphqlContext,
      ) => {
        if (args.customerId) {
          const orders = await ctx.loaders.ordersByCustomer.load(args.customerId);
          const normalized = orders.map((order) => normalizeOrder(order));
          return typeof args.limit === "number" ? normalized.slice(0, args.limit) : normalized;
        }
        const list = await storage.getOrders(ctx.tenantId ?? undefined, undefined, undefined);
        const filtered = args.status
          ? list.filter((order) => order.status === args.status)
          : list;
        const normalized = filtered.map((order) => normalizeOrder(order));
        return typeof args.limit === "number" ? normalized.slice(0, args.limit) : normalized;
      },
      delivery: async (_root: unknown, args: { id: string }) => {
        const record = await storage.getDeliveryOrderById(args.id);
        if (!record) return null;
        return record;
      },
      deliveries: async (
        _root: unknown,
        args: { status?: string | null; branchId?: string | null },
        ctx: GraphqlContext,
      ) => {
        const branch = args.branchId ?? ctx.tenantId ?? undefined;
        const deliveries = await storage.getDeliveryOrders(branch, args.status ?? undefined);
        return deliveries;
      },
      analyticsSummary: async (
        _root: unknown,
        args: { range?: { range?: string | null; start?: Date | string | null; end?: Date | string | null } | null; branchId?: string | null },
        ctx: GraphqlContext,
      ) => {
        const branch = args.branchId ?? ctx.tenantId ?? undefined;
        const filter = {
          branchId: branch,
          start: args.range?.start ? new Date(args.range.start) : undefined,
          end: args.range?.end ? new Date(args.range.end) : undefined,
        };
        const window = args.range?.range ?? "30d";
        const [summary, servicesMetrics, productMetrics, packageMetrics, paymentMetrics] = await Promise.all([
          storage.getRevenueSummaryByDateRange(filter),
          storage.getTopServices(window, branch),
          storage.getTopProducts(window, branch),
          storage.getTopPackages(window, branch),
          storage.getPaymentMethodBreakdown(filter),
        ]);
        return {
          totalOrders: summary.totalOrders,
          totalRevenue: summary.totalRevenue,
          averageOrderValue: summary.averageOrderValue,
          daily: summary.daily.map((entry) => ({
            date: entry.date,
            orders: entry.orders,
            revenue: entry.revenue,
          })),
          topServices: servicesMetrics.map((metric) => ({
            name: (metric as any).service ?? "Unknown",
            count: toNumber((metric as any).count ?? 0),
            revenue: toNumber((metric as any).revenue ?? 0),
          })),
          topProducts: productMetrics.map((metric) => ({
            name: (metric as any).product ?? "Unknown",
            count: toNumber((metric as any).count ?? 0),
            revenue: toNumber((metric as any).revenue ?? 0),
          })),
          topPackages: packageMetrics.map((metric) => ({
            name: (metric as any).pkg ?? "Unknown",
            count: toNumber((metric as any).count ?? 0),
            revenue: toNumber((metric as any).revenue ?? 0),
          })),
          paymentMethods: paymentMetrics.map((metric) => ({
            name: (metric as any).method ?? "Unknown",
            count: toNumber((metric as any).count ?? 0),
            revenue: toNumber((metric as any).revenue ?? 0),
          })),
        };
      },
      workflows: async (_root: unknown, args: { status?: string | null }) => {
        const workflows = await workflowEngine.listWorkflows();
        return args.status ? workflows.filter((wf) => wf.status === args.status) : workflows;
      },
      workflow: async (_root: unknown, args: { id: string }) => {
        return await workflowEngine.getWorkflow(args.id);
      },
      workflowCatalog: () => {
        const triggers = workflowEngine.listTriggers().map((trigger) => ({
          type: trigger.type,
          label: trigger.label,
          description: trigger.description ?? null,
        }));
        const actions = workflowEngine.listActions().map((action) => ({
          type: action.type,
          label: action.label,
          description: action.description ?? null,
        }));
        return { triggers, actions };
      },
    },
    Customer: {
      balanceDue: (customer: Customer) => toNumber(customer.balanceDue),
      totalSpent: (customer: Customer) => toNumber((customer as any).totalSpent ?? (customer as any).totalSpend),
      orders: async (
        customer: Customer,
        args: { limit?: number | null },
        ctx: GraphqlContext,
      ) => {
        const orders = await ctx.loaders.ordersByCustomer.load(customer.id);
        const normalized = orders.map((order) => normalizeOrder(order));
        return typeof args.limit === "number" ? normalized.slice(0, args.limit) : normalized;
      },
      addresses: async (customer: Customer) => {
        return await storage.getCustomerAddresses(customer.id);
      },
      engagementPlan: async (customer: Customer) => {
        return await storage.getCustomerEngagementPlan(customer.id);
      },
      insights: async (customer: Customer, _args: unknown, ctx: GraphqlContext) => {
        const orders = await ctx.loaders.ordersByCustomer.load(customer.id);
        const orderTimestamps = orders
          .map((order) => toISOString(order.createdAt))
          .filter((value): value is string => Boolean(value));
        const insightInput = {
          customer: {
            id: customer.id,
            name: customer.name,
            branchId: customer.branchId,
            totalSpend: toNumber((customer as any).totalSpent ?? (customer as any).totalSpend),
            loyaltyPoints: customer.loyaltyPoints ?? 0,
            balanceDue: toNumber(customer.balanceDue),
            orderCount: orders.length,
            lastOrderDate: orderTimestamps[0] ?? null,
          },
          orderCadenceDays: null,
          orderTimestamps,
          topServices: resolveTopServices(orders),
          timelineSummary: buildTimelineSummary(orders),
        } satisfies Parameters<CustomerInsightsService["generateSummary"]>[0];
        const summary: CustomerInsightSummaryRecord = await services.customerInsightsService.generateSummary(
          insightInput,
        );
        return summary;
      },
    },
    CustomerAddress: {
      lat: (address: CustomerAddress) => (address.lat != null ? Number(address.lat) : null),
      lng: (address: CustomerAddress) => (address.lng != null ? Number(address.lng) : null),
    },
    Order: {
      customer: async (order: Order, _args: unknown, ctx: GraphqlContext) => {
        if (!order.customerId) return null;
        return await ctx.loaders.customerById.load(order.customerId);
      },
    },
    Delivery: {
      deliveryFee: (delivery: DeliveryOrder) => (delivery.deliveryFee != null ? toNumber(delivery.deliveryFee) : null),
      estimatedDistance: (delivery: DeliveryOrder) =>
        delivery.estimatedDistance != null ? toNumber(delivery.estimatedDistance) : null,
      actualDistance: (delivery: DeliveryOrder) =>
        delivery.actualDistance != null ? toNumber(delivery.actualDistance) : null,
      order: (delivery: DeliveryOrder) => normalizeOrder(delivery.order as Order & any),
      optimization: async (delivery: DeliveryOrder, _args: unknown, ctx: GraphqlContext) => {
        if (!ctx.loaders.deliveryOptimization) return null;
        if (!delivery.branchId) return null;
        const key = `${delivery.branchId}:${delivery.id}`;
        const result = await ctx.loaders.deliveryOptimization.load(key);
        return result;
      },
    },
  };
}

