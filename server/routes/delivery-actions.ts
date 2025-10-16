import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import type { Logger } from "pino";

import type { IStorage } from "../storage";
import type { DeliveryChannelEvent } from "../types/delivery-channel";

const MIN_NOTICE_MINUTES = 45;
const MAX_RESCHEDULES = 3;
const COMPENSATION_MAX_PERCENT = 0.25;

const rescheduleCounts = new Map<string, number>();
const compensationLedger = new Map<string, number>();

function getPortalSession(req: Request) {
  return (req.session as any)?.deliveryPortal as
    | { deliveryId: string; orderId: string; contact: string; customerName?: string | null; expiresAt?: number }
    | undefined;
}

function ensurePortalAccess(requireAuth: RequestHandler, logger: Logger): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const portalSession = getPortalSession(req);
    const deliveryId = (req.params as any)?.deliveryId;
    if (portalSession && portalSession.deliveryId === deliveryId) {
      if (portalSession.expiresAt && portalSession.expiresAt < Date.now()) {
        logger.warn({ deliveryId }, "delivery portal session expired");
        return res.status(401).json({ message: "Session expired" });
      }
      return next();
    }
    return requireAuth(req, res, next);
  };
}

const rescheduleSchema = z.object({
  windowStart: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid start time"),
  windowEnd: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid end time"),
  reason: z.string().optional(),
});

const compensationSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  reason: z.string().optional(),
});

interface DeliveryActionRouteDeps {
  app: Express;
  storage: IStorage;
  logger: Logger;
  requireAuth: RequestHandler;
  broadcastDeliveryEvent: (event: DeliveryChannelEvent) => Promise<void>;
}

async function buildRescheduleWindows(delivery: any) {
  const base = delivery.scheduledDeliveryTime ? new Date(delivery.scheduledDeliveryTime) : new Date();
  if (base.getTime() < Date.now()) {
    base.setTime(Date.now() + MIN_NOTICE_MINUTES * 60 * 1000);
  }
  const windows = [] as Array<{ start: string; end: string; label: string }>;
  for (let i = 0; i < 4; i++) {
    const start = new Date(base.getTime() + i * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    windows.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    });
  }
  return windows;
}

async function getPortalDeliveryPayload(storage: IStorage, deliveryId: string) {
  const delivery = await storage.getDeliveryOrderById(deliveryId);
  if (!delivery) return undefined;
  const tracking = await storage.getDeliveryTrackingSnapshot(delivery.orderId);
  const orderTotal = Number.parseFloat(String((delivery.order as any).total ?? 0));
  const outstandingComp = compensationLedger.get(deliveryId) ?? 0;
  return {
    delivery: {
      id: delivery.id,
      orderId: delivery.orderId,
      status: delivery.deliveryStatus,
      scheduledDeliveryTime: delivery.scheduledDeliveryTime?.toISOString() ?? null,
      driverId: delivery.driverId ?? null,
      fee: delivery.deliveryFee ?? null,
    },
    order: {
      id: delivery.order.id,
      number: (delivery.order as any).orderNumber ?? null,
      customerName: (delivery.order as any).customerName ?? null,
      customerPhone: (delivery.order as any).customerPhone ?? null,
      address: (delivery.order as any).deliveryAddress ?? null,
      total: Number.isFinite(orderTotal) ? orderTotal : null,
    },
    tracking: tracking
      ? {
          etaMinutes: tracking.etaMinutes ?? null,
          distanceKm: tracking.distanceKm ?? null,
          driverLocation: tracking.driverLocation
            ? {
                lat: tracking.driverLocation.lat,
                lng: tracking.driverLocation.lng,
                timestamp: tracking.driverLocation.timestamp.toISOString(),
              }
            : null,
        }
      : null,
    reschedulePolicy: {
      minimumNoticeMinutes: MIN_NOTICE_MINUTES,
      maxReschedules: MAX_RESCHEDULES,
      remainingReschedules: Math.max(0, MAX_RESCHEDULES - (rescheduleCounts.get(deliveryId) ?? 0)),
      windows: await buildRescheduleWindows(delivery),
    },
    compensationPolicy: {
      maxPercent: COMPENSATION_MAX_PERCENT,
      maxAmount: Number.isFinite(orderTotal) ? orderTotal * COMPENSATION_MAX_PERCENT : null,
      previouslyOffered: outstandingComp,
    },
  };
}

export function registerDeliveryActionRoutes({
  app,
  storage,
  logger,
  requireAuth,
  broadcastDeliveryEvent,
}: DeliveryActionRouteDeps) {
  const portalOrAuth = ensurePortalAccess(requireAuth, logger);

  app.get("/api/portal/delivery/:deliveryId", portalOrAuth, async (req, res) => {
    try {
      const payload = await getPortalDeliveryPayload(storage, req.params.deliveryId);
      if (!payload) {
        return res.status(404).json({ message: "Delivery not found" });
      }
      res.json(payload);
    } catch (error) {
      logger.error({ err: error }, "failed to load delivery portal payload");
      res.status(500).json({ message: "Failed to load delivery" });
    }
  });

  app.get(
    "/api/portal/delivery/:deliveryId/reschedule-windows",
    portalOrAuth,
    async (req, res) => {
      const delivery = await storage.getDeliveryOrderById(req.params.deliveryId);
      if (!delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }
      res.json({
        deliveryId: req.params.deliveryId,
        windows: await buildRescheduleWindows(delivery),
        minimumNoticeMinutes: MIN_NOTICE_MINUTES,
        remainingReschedules: Math.max(0, MAX_RESCHEDULES - (rescheduleCounts.get(req.params.deliveryId) ?? 0)),
      });
    },
  );

  app.post("/api/portal/delivery/:deliveryId/reschedule", portalOrAuth, async (req, res) => {
    try {
      const deliveryId = req.params.deliveryId;
      const delivery = await storage.getDeliveryOrderById(deliveryId);
      if (!delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      const count = rescheduleCounts.get(deliveryId) ?? 0;
      if (count >= MAX_RESCHEDULES) {
        return res.status(409).json({ message: "Reschedule limit reached" });
      }

      const { windowStart, windowEnd, reason } = rescheduleSchema.parse(req.body);
      const startDate = new Date(windowStart);
      const endDate = new Date(windowEnd);

      if (startDate.getTime() < Date.now() + MIN_NOTICE_MINUTES * 60 * 1000) {
        return res
          .status(400)
          .json({ message: `Reschedules require ${MIN_NOTICE_MINUTES} minutes notice` });
      }

      if (endDate <= startDate) {
        return res.status(400).json({ message: "Invalid window" });
      }

      const updated = await storage.updateDeliverySchedule(deliveryId, startDate, reason ?? null);
      if (!updated) {
        return res.status(500).json({ message: "Failed to update schedule" });
      }

      rescheduleCounts.set(deliveryId, count + 1);
      await storage.logOrderStatus(updated.orderId, "delivery:rescheduled", reason ?? undefined);

      res.json({
        deliveryId,
        scheduledDeliveryTime: updated.scheduledDeliveryTime?.toISOString() ?? startDate.toISOString(),
        windowEnd: endDate.toISOString(),
      });

      await broadcastDeliveryEvent({
        type: "reschedule",
        orderId: updated.orderId,
        reschedule: {
          deliveryId,
          orderId: updated.orderId,
          scheduledDeliveryTime: updated.scheduledDeliveryTime?.toISOString() ?? startDate.toISOString(),
          actor: getPortalSession(req)?.contact ?? (req.user as any)?.id ?? null,
          reason: reason ?? null,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "failed to reschedule delivery");
      res.status(400).json({ message: "Invalid reschedule payload" });
    }
  });

  app.post("/api/portal/delivery/:deliveryId/compensation", portalOrAuth, async (req, res) => {
    try {
      const deliveryId = req.params.deliveryId;
      const delivery = await storage.getDeliveryOrderById(deliveryId);
      if (!delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      const payload = compensationSchema.parse(req.body);
      const orderTotal = Number.parseFloat(String((delivery.order as any).total ?? 0));
      const maxComp = Number.isFinite(orderTotal) ? orderTotal * COMPENSATION_MAX_PERCENT : undefined;

      if (maxComp !== undefined && payload.amount > maxComp) {
        return res.status(422).json({ message: "Compensation exceeds policy limit" });
      }

      const offered = compensationLedger.get(deliveryId) ?? 0;
      compensationLedger.set(deliveryId, offered + payload.amount);

      await storage.logOrderStatus(
        delivery.orderId,
        "delivery:compensation_offered",
        payload.reason ?? undefined,
      );
      await storage.appendDeliveryNote(
        deliveryId,
        `Compensation offered: ${payload.amount} ${payload.currency}${payload.reason ? ` (${payload.reason})` : ""}`,
      );

      res.json({
        deliveryId,
        amount: payload.amount,
        currency: payload.currency,
        reason: payload.reason ?? null,
        totalCompensation: compensationLedger.get(deliveryId) ?? payload.amount,
      });

      await broadcastDeliveryEvent({
        type: "compensation",
        orderId: delivery.orderId,
        compensation: {
          deliveryId,
          orderId: delivery.orderId,
          amount: payload.amount,
          currency: payload.currency,
          reason: payload.reason ?? null,
          actor: getPortalSession(req)?.contact ?? (req.user as any)?.id ?? null,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "failed to record compensation offer");
      res.status(400).json({ message: "Invalid compensation payload" });
    }
  });
}
