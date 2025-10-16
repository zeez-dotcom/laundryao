import type { Express, RequestHandler } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import type { UserWithBranch } from "@shared/schema";

import type { IStorage } from "../storage";
import { OrderSuggestionsService } from "../services/order-suggestions";
import { OrderAnomaliesService } from "../services/order-anomalies";
import { createAnalyticsEvent, type EventBus } from "../services/event-bus";

interface SmartOrderRoutesDeps {
  app: Express;
  requireAuth: RequestHandler;
  storage: IStorage;
  logger: Logger;
  eventBus: EventBus;
  suggestionsService: OrderSuggestionsService;
  anomaliesService: OrderAnomaliesService;
}

const querySchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(10).optional(),
});

function formatActorName(user?: UserWithBranch | null): string {
  if (!user) return "system";
  const parts = [user.firstName, user.lastName].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  if (parts.length) {
    return parts.join(" ");
  }
  return user.username ?? "system";
}

export function registerSmartOrderRoutes({
  app,
  requireAuth,
  storage,
  logger,
  eventBus,
  suggestionsService,
  anomaliesService,
}: SmartOrderRoutesDeps): void {
  app.get("/api/orders/smart", requireAuth, async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid query", issues: parsed.error.format() });
    }

    const { branchId, customerId, limit } = parsed.data;
    const currentUser = req.user as UserWithBranch | undefined;
    const isSuperAdmin = currentUser?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!currentUser?.branchId) {
        return res.status(403).json({ message: "Branch access required" });
      }
      if (currentUser.branchId !== branchId) {
        return res.status(403).json({ message: "You are not authorized to access this branch" });
      }
    }

    try {
      if (customerId) {
        const tenantBranchId = isSuperAdmin ? branchId : currentUser?.branchId;
        const customer = await storage.getCustomer(customerId, tenantBranchId);
        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }
      }

      const packages = customerId
        ? await storage.getCustomerPackagesWithUsage(customerId)
        : [];
      const [suggestionsResult, anomalyResult] = await Promise.all([
        suggestionsService.generate({ branchId, customerId, limit, packages }),
        anomaliesService.detect({ branchId, customerId }),
      ]);

      if (anomalyResult.auditTrail.length) {
        const actorUser = currentUser;
        await Promise.all(
          anomalyResult.auditTrail.map((entry) =>
            eventBus.publish(
              createAnalyticsEvent({
                source: "api.orders.smart",
                category: "order.lifecycle",
                name: "status_changed",
                payload: {
                  orderId: entry.orderId,
                  branchId: entry.branchId,
                  customerId: entry.customerId ?? null,
                  status: "anomaly_detected",
                  previousStatus: null,
                  total:
                    typeof entry.metadata.total === "number"
                      ? entry.metadata.total
                      : undefined,
                  metadata: {
                    ...entry.metadata,
                    anomalyType: entry.type,
                    severity: entry.severity,
                    message: entry.message,
                  },
                },
                actor: {
                  actorId: actorUser?.id ?? "system",
                  actorType: actorUser ? "user" : "system",
                  actorName: formatActorName(actorUser),
                },
                context: { tenantId: branchId },
              }),
            ),
          ),
        ).catch((error) => {
          logger.warn({ err: error }, "Failed to record anomaly audit trail");
        });
      }

      res.json({
        suggestions: suggestionsResult.suggestions,
        seasonalHighlights: suggestionsResult.seasonalHighlights,
        packageImpact: suggestionsResult.packageOpportunities,
        metrics: suggestionsResult.metrics,
        anomalies: anomalyResult.anomalies,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, branchId, customerId }, "Failed to build smart order recommendations");
      res.status(500).json({ message: "Unable to generate smart order insights" });
    }
  });
}
