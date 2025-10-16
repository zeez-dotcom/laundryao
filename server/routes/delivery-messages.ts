import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import type { Logger } from "pino";

import type { IStorage } from "../storage";
import type { DeliveryChannelEvent, DeliveryMessagePayload } from "../types/delivery-channel";
import type { EventBus } from "../services/event-bus";
import { createAnalyticsEvent } from "../services/event-bus";

const deliveryOtpStore = new Map<string, { otp: string; expiresAt: Date }>();
const deliveryMessages = new Map<string, DeliveryMessagePayload[]>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function verifyOtp(key: string, otp: string): boolean {
  const record = deliveryOtpStore.get(key);
  if (!record) return false;
  if (record.expiresAt.getTime() < Date.now()) {
    deliveryOtpStore.delete(key);
    return false;
  }
  const matches = record.otp === otp;
  if (matches) {
    deliveryOtpStore.delete(key);
  }
  return matches;
}

function getPortalSession(req: Request) {
  return (req.session as any)?.deliveryPortal as
    | { deliveryId: string; orderId: string; contact: string; customerName?: string | null; expiresAt?: number }
    | undefined;
}

function ensurePortalAccess(
  requireAuth: RequestHandler,
  logger: Logger,
): RequestHandler {
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

async function resolveDelivery(storage: IStorage, deliveryId: string) {
  const delivery = await storage.getDeliveryOrderById(deliveryId);
  if (!delivery) return undefined;
  return delivery;
}

const messageSchema = z.object({
  body: z.string().trim().min(1, "Message is required"),
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        url: z.string().url().optional(),
      }),
    )
    .optional(),
  metadata: z.record(z.any()).optional(),
});

const authRequestSchema = z.object({
  deliveryId: z.string().min(1),
  contact: z.string().min(3),
  channel: z.enum(["email", "sms"]).default("sms"),
});

const authVerifySchema = authRequestSchema.extend({
  otp: z.string().min(4).max(6),
});

interface DeliveryMessageRouteDeps {
  app: Express;
  storage: IStorage;
  logger: Logger;
  requireAuth: RequestHandler;
  broadcastDeliveryEvent: (event: DeliveryChannelEvent) => Promise<void>;
  eventBus: EventBus;
}

export function registerDeliveryMessageRoutes({
  app,
  storage,
  logger,
  requireAuth,
  broadcastDeliveryEvent,
  eventBus,
}: DeliveryMessageRouteDeps) {
  const portalOrAuth = ensurePortalAccess(requireAuth, logger);

  app.post("/api/portal/delivery-auth/request", async (req, res) => {
    try {
      const { deliveryId, contact, channel } = authRequestSchema.parse(req.body);
      const delivery = await resolveDelivery(storage, deliveryId);
      if (!delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      const otp = generateOtp();
      const key = `${deliveryId}:${contact}`;
      deliveryOtpStore.set(key, {
        otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      logger.info({ deliveryId, contact, channel }, "delivery portal OTP generated");

      const response: Record<string, unknown> = {
        message: "Verification code sent",
        channel,
      };
      if (process.env.NODE_ENV !== "production") {
        response.debugOtp = otp;
      }
      res.json(response);
    } catch (error) {
      logger.error({ err: error }, "failed to issue delivery portal OTP");
      res.status(400).json({ message: "Invalid authentication request" });
    }
  });

  app.post("/api/portal/delivery-auth/verify", async (req, res) => {
    try {
      const { deliveryId, contact, otp } = authVerifySchema.parse(req.body);
      const delivery = await resolveDelivery(storage, deliveryId);
      if (!delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      const key = `${deliveryId}:${contact}`;
      if (!verifyOtp(key, otp)) {
        return res.status(401).json({ message: "Invalid verification code" });
      }

      (req.session as any).deliveryPortal = {
        deliveryId,
        orderId: delivery.orderId,
        contact,
        customerName: (delivery.order as any).customerName ?? null,
        expiresAt: Date.now() + 30 * 60 * 1000,
      };

      res.json({
        message: "Authenticated",
        delivery: {
          id: delivery.id,
          orderId: delivery.orderId,
          deliveryStatus: delivery.deliveryStatus,
          scheduledDeliveryTime: delivery.scheduledDeliveryTime?.toISOString() ?? null,
          customerName: (delivery.order as any).customerName ?? null,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "failed to verify delivery portal OTP");
      res.status(400).json({ message: "Invalid verification payload" });
    }
  });

  app.get("/api/portal/delivery/:deliveryId/messages", portalOrAuth, async (req, res) => {
    const deliveryId = req.params.deliveryId;
    const delivery = await resolveDelivery(storage, deliveryId);
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    const items = deliveryMessages.get(deliveryId) ?? [];
    res.json({
      deliveryId,
      orderId: delivery.orderId,
      messages: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    });
  });

  app.post("/api/portal/delivery/:deliveryId/messages", portalOrAuth, async (req, res) => {
    try {
      const deliveryId = req.params.deliveryId;
      const portalSession = getPortalSession(req);
      const user = req.user as any;
      const delivery = await resolveDelivery(storage, deliveryId);
      if (!delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      if (!portalSession && !user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const parsed = messageSchema.parse(req.body);
      const message: DeliveryMessagePayload = {
        id: randomUUID(),
        deliveryId,
        orderId: delivery.orderId,
        senderType: portalSession ? "customer" : "agent",
        body: parsed.body,
        createdAt: new Date().toISOString(),
        attachments: parsed.attachments?.map((item) => ({
          id: item.id ?? randomUUID(),
          name: item.name,
          url: item.url,
        })),
        metadata: parsed.metadata ?? null,
      };

      const existing = deliveryMessages.get(deliveryId) ?? [];
      existing.push(message);
      deliveryMessages.set(deliveryId, existing);

      res.status(201).json({ message });

      await broadcastDeliveryEvent({
        type: "message",
        orderId: delivery.orderId,
        message,
      });

      await eventBus.publish(
        createAnalyticsEvent({
          source: "api.delivery-portal.messages",
          category: "delivery.communication",
          name: "message_sent",
          payload: {
            orderId: delivery.orderId,
            deliveryId,
            senderType: message.senderType,
          },
          actor: portalSession
            ? {
                actorId: portalSession.contact,
                actorType: "customer",
                actorName: portalSession.customerName ?? "Customer",
              }
            : user
            ? {
                actorId: user.id,
                actorType: "user",
                actorName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.username || "Agent",
              }
            : {
                actorId: "system",
                actorType: "system",
                actorName: "system",
              },
        }),
      );
    } catch (error) {
      logger.error({ err: error }, "failed to record delivery message");
      res.status(400).json({ message: "Invalid message payload" });
    }
  });
}

export type { DeliveryMessagePayload };
