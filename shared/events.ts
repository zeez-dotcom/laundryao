import { z } from "zod";

const actorSchema = z
  .object({
    actorId: z.string().min(1).optional(),
    actorType: z.enum(["system", "user", "driver", "customer", "automation"]).optional(),
    actorName: z.string().min(1).optional(),
  })
  .strict();

const contextSchema = z
  .object({
    correlationId: z.string().min(1).optional(),
    tenantId: z.string().min(1).optional(),
    requestId: z.string().min(1).optional(),
    sourceIp: z.string().min(1).optional(),
  })
  .strict();

const baseEventSchema = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  source: z.string().min(1),
  schemaVersion: z.string().min(1),
  actor: actorSchema.optional(),
  context: contextSchema.optional(),
});

const orderLifecyclePayloadSchema = z
  .object({
    orderId: z.string().min(1),
    deliveryId: z.string().optional().nullable(),
    branchId: z.string().optional().nullable(),
    customerId: z.string().optional().nullable(),
    status: z.string().min(1),
    previousStatus: z.string().optional().nullable(),
    total: z.number().nonnegative().optional(),
    promisedReadyDate: z.string().datetime().optional(),
    deliveryStatus: z.string().optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const driverTelemetryPayloadSchema = z
  .object({
    driverId: z.string().min(1),
    lat: z.number(),
    lng: z.number(),
    heading: z.number().optional(),
    speedKph: z.number().optional(),
    accuracyMeters: z.number().optional(),
    orderId: z.string().optional().nullable(),
    deliveryId: z.string().optional().nullable(),
  })
  .strict();

const campaignInteractionPayloadSchema = z
  .object({
    customerId: z.string().min(1),
    campaignId: z.string().optional().nullable(),
    branchId: z.string().optional().nullable(),
    channel: z.enum(["sms", "email", "whatsapp", "push", "in_app"]).optional().nullable(),
    templateKey: z.string().optional().nullable(),
    status: z.enum(["queued", "sent", "skipped", "failed", "updated"]).optional(),
    reason: z.string().optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const orderLifecycleEventSchema = baseEventSchema.extend({
  category: z.literal("order.lifecycle"),
  name: z.enum([
    "created",
    "status_changed",
    "delivery_created",
    "delivery_status_changed",
    "request_accepted",
  ]),
  payload: orderLifecyclePayloadSchema,
});

export const driverTelemetryEventSchema = baseEventSchema.extend({
  category: z.literal("driver.telemetry"),
  name: z.enum(["location_updated", "speed_alert"]),
  payload: driverTelemetryPayloadSchema,
});

export const campaignInteractionEventSchema = baseEventSchema.extend({
  category: z.literal("campaign.interaction"),
  name: z.enum(["plan_updated", "outreach_attempted", "outreach_completed"]),
  payload: campaignInteractionPayloadSchema,
});

export const analyticsEventSchema = z.union([
  orderLifecycleEventSchema,
  driverTelemetryEventSchema,
  campaignInteractionEventSchema,
]);

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type OrderLifecycleEvent = z.infer<typeof orderLifecycleEventSchema>;
export type DriverTelemetryEvent = z.infer<typeof driverTelemetryEventSchema>;
export type CampaignInteractionEvent = z.infer<typeof campaignInteractionEventSchema>;

export type AnalyticsEventCategory = AnalyticsEvent["category"];
