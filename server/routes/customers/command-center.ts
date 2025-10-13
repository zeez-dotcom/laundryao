import type { Express, RequestHandler } from "express";
import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { IStorage } from "../../storage";
import { db } from "../../db";
import type { UserWithBranch } from "@shared/schema";
import { CustomerInsightsService } from "../../services/customer-insights";

export interface CommandCenterOutreachEvent {
  id: string;
  occurredAt: string;
  channel: string;
  summary: string;
  relatedOrderId?: string | null;
}

export interface CommandCenterTimelineEvent {
  id: string;
  occurredAt: string;
  category: "order" | "payment" | "loyalty" | "notification" | "engagement" | "system";
  title: string;
  details?: string;
  meta?: Record<string, unknown>;
}

interface RegisterCustomerCommandCenterRoutesDeps {
  app: Express;
  storage: IStorage;
  requireAdminOrSuperAdmin: RequestHandler;
  logger: Logger;
  customerInsightsService: CustomerInsightsService;
  fetchOutreachEvents?: (customerId: string) => Promise<CommandCenterOutreachEvent[]>;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function resolveCustomerId(rawId: string): Promise<string> {
  if (/^\d+$/.test(rawId)) {
    const { rows } = await db.execute(sql`
      SELECT id FROM customers WHERE public_id = ${Number(rawId)} LIMIT 1
    `);
    const row = rows?.[0] as { id?: string } | undefined;
    if (row?.id) {
      return row.id;
    }
  }
  return rawId;
}

async function defaultFetchOutreachEvents(customerId: string): Promise<CommandCenterOutreachEvent[]> {
  const result = await db.execute(sql`
    SELECT n.id, n.type, n.sent_at, n.order_id
    FROM notifications n
    INNER JOIN orders o ON o.id = n.order_id
    WHERE o.customer_id = ${customerId}
    ORDER BY n.sent_at DESC
  `);
  return (result.rows || []).map((row: any) => ({
    id: String(row.id),
    occurredAt: toIso(row.sent_at) ?? new Date().toISOString(),
    channel: row.type || "notification",
    summary: `Notification sent for order ${row.order_id}`,
    relatedOrderId: row.order_id ? String(row.order_id) : null,
  }));
}

function buildTimelineSummary(events: CommandCenterTimelineEvent[]): string[] {
  return events.slice(0, 30).map((event) => {
    const date = new Date(event.occurredAt).toISOString().split("T")[0];
    const details = event.details ? ` - ${event.details}` : "";
    return `${date} | ${event.category} | ${event.title}${details}`;
  });
}

export function registerCustomerCommandCenterRoutes({
  app,
  storage,
  requireAdminOrSuperAdmin,
  logger,
  customerInsightsService,
  fetchOutreachEvents = defaultFetchOutreachEvents,
}: RegisterCustomerCommandCenterRoutesDeps): void {
  app.get(
    "/api/customers/:id/command-center",
    requireAdminOrSuperAdmin,
    async (req, res) => {
      try {
        const user = req.user as UserWithBranch;
        const branchScope = user.role === "super_admin" ? undefined : user.branchId || undefined;
        const resolvedId = await resolveCustomerId(req.params.id);
        const customer = await storage.getCustomer(resolvedId, branchScope);
        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }

        const [orders, packages, payments, loyaltyHistory, plan, outreachEvents] = await Promise.all([
          storage.getOrdersByCustomer(customer.id, branchScope),
          storage.getCustomerPackagesWithUsage(customer.id),
          storage.getPaymentsByCustomer(customer.id, branchScope),
          storage.getLoyaltyHistory(customer.id),
          storage.getCustomerEngagementPlan(customer.id),
          fetchOutreachEvents(customer.id),
        ]);

        const sortedOrders = [...orders].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        const orderHistory = sortedOrders.map((order) => {
          const items = Array.isArray((order as any).items) ? ((order as any).items as any[]) : [];
          return {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            total: toNumber(order.total),
            paid: toNumber((order as any).paid),
            remaining: toNumber((order as any).remaining),
            createdAt: toIso(order.createdAt),
            promisedReadyDate: toIso(order.promisedReadyDate),
            items: items.map((item) => ({
              serviceId: item.serviceId || null,
              serviceName: item.serviceName || item.serviceLabel || null,
              clothingItemId: item.clothingItemId || null,
              quantity: typeof item.quantity === "number" ? item.quantity : Number(item.quantity) || 0,
            })),
          };
        });

        const serviceUsage = new Map<string, number>();
        for (const order of orderHistory) {
          for (const item of order.items) {
            const key = item.serviceName || item.serviceId || "service";
            serviceUsage.set(key, (serviceUsage.get(key) || 0) + (item.quantity || 0));
          }
        }
        const preferredServices = [...serviceUsage.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name)
          .filter(Boolean);

        const packageUsage = packages.map((pkg: any) => ({
          id: pkg.id,
          name: pkg.package?.nameEn || pkg.name || pkg.packageName,
          balance: toNumber(pkg.balance),
          startsAt: toIso(pkg.startsAt),
          expiresAt: toIso(pkg.expiresAt),
          totalCredits: pkg.totalCredits ?? pkg.package?.maxItems ?? null,
        }));

        const timelineEvents: CommandCenterTimelineEvent[] = [];
        for (const order of orderHistory) {
          timelineEvents.push({
            id: `order-${order.id}`,
            occurredAt: order.createdAt ?? new Date().toISOString(),
            category: "order",
            title: `Order ${order.orderNumber} (${order.status || "unknown"})`,
            details: `Total E£ ${order.total.toFixed(2)} | Remaining E£ ${order.remaining.toFixed(2)}`,
          });
        }

        for (const payment of payments) {
          timelineEvents.push({
            id: `payment-${payment.id}`,
            occurredAt: toIso(payment.createdAt) ?? new Date().toISOString(),
            category: "payment",
            title: `Payment of E£ ${toNumber(payment.amount).toFixed(2)}`,
            details: payment.paymentMethod ? `Method: ${payment.paymentMethod}` : undefined,
          });
        }

        for (const entry of loyaltyHistory) {
          timelineEvents.push({
            id: `loyalty-${entry.id}`,
            occurredAt: toIso(entry.createdAt) ?? new Date().toISOString(),
            category: "loyalty",
            title: entry.change >= 0 ? `Earned ${entry.change} loyalty points` : `Redeemed ${Math.abs(entry.change)} loyalty points`,
            details: entry.description || undefined,
          });
        }

        for (const outreach of outreachEvents) {
          timelineEvents.push({
            id: `outreach-${outreach.id}`,
            occurredAt: outreach.occurredAt,
            category: "notification",
            title: outreach.summary,
            details: outreach.channel ? `Channel: ${outreach.channel}` : undefined,
            meta: outreach.relatedOrderId ? { orderId: outreach.relatedOrderId } : undefined,
          });
        }

        if (plan?.lastActionAt) {
          timelineEvents.push({
            id: `plan-${plan.id}-last`,
            occurredAt: toIso(plan.lastActionAt) ?? new Date().toISOString(),
            category: "engagement",
            title: plan.lastOutcome ? plan.lastOutcome : "Engagement touchpoint recorded",
            details: plan.lastActionChannel ? `Channel: ${plan.lastActionChannel}` : undefined,
          });
        }

        const sortedTimeline = timelineEvents.sort(
          (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        );

        const auditTrail = sortedTimeline.filter((event) => event.category === "payment" || event.category === "engagement");

        const orderTimestamps = orderHistory
          .map((order) => order.createdAt)
          .filter((value): value is string => Boolean(value));

        const insightInput = {
          customer: {
            id: customer.id,
            name: customer.name,
            branchId: customer.branchId,
            totalSpend: toNumber(customer.totalSpent ?? customer.totalSpend),
            loyaltyPoints: customer.loyaltyPoints ?? 0,
            balanceDue: toNumber(customer.balanceDue),
            orderCount: orderHistory.length,
            lastOrderDate: orderHistory.length ? orderHistory[0].createdAt : null,
          },
          orderCadenceDays: null,
          orderTimestamps,
          topServices: preferredServices,
          timelineSummary: buildTimelineSummary(sortedTimeline),
        } satisfies Parameters<CustomerInsightsService["generateSummary"]>[0];

        const insights = await customerInsightsService.generateSummary(insightInput);

        const response = {
          customer: {
            id: customer.id,
            branchId: customer.branchId,
            name: customer.name,
            phoneNumber: customer.phoneNumber,
            email: customer.email,
            loyaltyPoints: customer.loyaltyPoints,
            isActive: customer.isActive,
            createdAt: toIso(customer.createdAt),
          },
          financial: {
            balanceDue: toNumber(customer.balanceDue),
            totalSpend: toNumber(customer.totalSpent ?? customer.totalSpend),
            loyaltyPoints: customer.loyaltyPoints ?? 0,
            packageCredits: packageUsage.reduce((sum, pkg) => sum + (pkg.balance || 0), 0),
          },
          orders: orderHistory,
          packages: packageUsage,
          outreachTimeline: sortedTimeline,
          auditTrail,
          actions: {
            issueCredit: {
              method: "POST",
              endpoint: `/api/customers/${customer.id}/payments`,
              payloadExample: {
                amount: 100,
                paymentMethod: "credit",
                receivedBy: "Command Center",
                notes: "Manual credit issued via command center",
              },
            },
            schedulePickup: {
              method: "PUT",
              endpoint: `/api/customer-insights/${customer.id}/actions`,
              payloadExample: {
                nextContactAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                recommendedAction: "Pickup scheduled",
                recommendedChannel: "sms",
              },
            },
            launchChat: {
              method: "PUT",
              endpoint: `/api/customer-insights/${customer.id}/actions`,
              payloadExample: {
                lastOutcome: "Live chat launched",
                recommendedChannel: "chat",
              },
              caution: "Trigger customer chatbot session separately when applicable",
            },
            queueCampaign: {
              method: "PUT",
              endpoint: `/api/customer-insights/${customer.id}/actions`,
              payloadExample: {
                recommendedAction: "Ramadan loyalty SMS",
                recommendedChannel: "sms",
              },
            },
          },
          insights,
        };

        res.json(response);
      } catch (error) {
        logger.error({ err: error, customerId: req.params.id }, "Failed to build customer command center dossier");
        res.status(500).json({ message: "Failed to load customer command center" });
      }
    },
  );

  app.post(
    "/api/customers/:id/command-center/audit",
    requireAdminOrSuperAdmin,
    async (req, res) => {
      const schema = z
        .object({
          eventId: z.string().min(1),
          category: z.string().min(1),
          description: z.string().min(1),
          occurredAt: z.string().datetime().optional(),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid audit payload" });
      }
      logger.info({
        customerId: req.params.id,
        eventId: parsed.data.eventId,
        category: parsed.data.category,
        description: parsed.data.description,
        occurredAt: parsed.data.occurredAt || new Date().toISOString(),
      });
      res.status(204).send();
    },
  );
}
