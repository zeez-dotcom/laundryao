import { z } from "zod";

export const featureNames = [
  "customer_churn_score",
  "customer_upsell_propensity",
  "order_eta_minutes",
] as const;

export type FeatureName = (typeof featureNames)[number];

export const featureEntityKinds = ["customer", "order", "delivery"] as const;
export type FeatureEntityKind = (typeof featureEntityKinds)[number];

export const featureSpecSchema = z.object({
  name: z.enum(featureNames),
  entityKind: z.enum(featureEntityKinds),
  description: z.string(),
  dataType: z.enum(["float", "integer", "json"]),
  ttlMinutes: z.number().positive().optional(),
  tags: z.array(z.string()).default([]),
});

export type FeatureSpec = z.infer<typeof featureSpecSchema>;

export const featureSpecs: Record<FeatureName, FeatureSpec> = {
  customer_churn_score: {
    name: "customer_churn_score",
    entityKind: "customer",
    description:
      "Probability that a customer will churn in the next 30 days based on recency, frequency, and monetary value signals.",
    dataType: "float",
    ttlMinutes: 1440,
    tags: ["classification", "retention"],
  },
  customer_upsell_propensity: {
    name: "customer_upsell_propensity",
    entityKind: "customer",
    description:
      "Likelihood that a customer will accept an upsell offer when placing an order, powered by purchase history and campaign response.",
    dataType: "float",
    ttlMinutes: 720,
    tags: ["marketing", "recommendation"],
  },
  order_eta_minutes: {
    name: "order_eta_minutes",
    entityKind: "delivery",
    description:
      "Predicted minutes until order delivery completion computed from driver telemetry, backlog, and service-level agreements.",
    dataType: "float",
    ttlMinutes: 15,
    tags: ["logistics", "forecast"],
  },
};

export const featureValueSchema = z.object({
  featureName: z.enum(featureNames),
  entityId: z.string(),
  entityKind: z.enum(featureEntityKinds),
  value: z.union([z.number(), z.bigint(), z.record(z.string(), z.any())]),
  computedAt: z.date(),
  validUntil: z.date().optional(),
  metadata: z
    .object({
      dataVersion: z.string().optional(),
      sourceJob: z.string().optional(),
    })
    .partial()
    .optional(),
});

export type FeatureValue = z.infer<typeof featureValueSchema>;

export const ingestionJobNames = {
  churn: "ml_feature_store_ingest_churn",
  upsell: "ml_feature_store_ingest_upsell",
  eta: "ml_feature_store_ingest_eta",
} as const;

export type IngestionJobName = (typeof ingestionJobNames)[keyof typeof ingestionJobNames];

