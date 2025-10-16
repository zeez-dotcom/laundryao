import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import {
  featureSpecs,
  featureValueSchema,
  FeatureValue,
  FeatureName,
} from "@shared/ml/features";

const warehouseSourceSchema = z.object({
  entityId: z.string(),
  featureName: z.string(),
  featureValue: z.union([z.number(), z.record(z.string(), z.any())]).nullable(),
  computedAt: z.coerce.date(),
  validUntil: z.coerce.date().nullable(),
  dataVersion: z.string().optional(),
});

type WarehouseRow = z.infer<typeof warehouseSourceSchema>;

export interface ComputeFeatureOptions {
  dryRun?: boolean;
  limit?: number;
}

let specsSynced = false;

async function syncFeatureSpecs() {
  if (specsSynced) {
    return;
  }

  const entries = Object.values(featureSpecs);
  for (const spec of entries) {
    await db.execute(sql`
      INSERT INTO ml_feature_specs (name, entity_kind, description, data_type, ttl_minutes, tags)
      VALUES (${spec.name}, ${spec.entityKind}, ${spec.description}, ${spec.dataType}, ${spec.ttlMinutes ?? null}, ${spec.tags})
      ON CONFLICT (name)
      DO UPDATE SET
        entity_kind = EXCLUDED.entity_kind,
        description = EXCLUDED.description,
        data_type = EXCLUDED.data_type,
        ttl_minutes = EXCLUDED.ttl_minutes,
        tags = EXCLUDED.tags;
    `);
  }

  specsSynced = true;
}

async function upsertFeatureValues(rows: FeatureValue[], options: ComputeFeatureOptions = {}) {
  if (rows.length === 0) {
    return { inserted: 0 };
  }

  if (options.dryRun) {
    return { inserted: rows.length };
  }

  await syncFeatureSpecs();

  const values = rows.map((row) => ({
    feature_name: row.featureName,
    entity_id: row.entityId,
    entity_kind: row.entityKind,
    value_numeric: typeof row.value === "number" ? row.value : null,
    value_json: typeof row.value === "number" ? null : row.value,
    computed_at: row.computedAt,
    valid_until: row.validUntil ?? null,
    data_version: row.metadata?.dataVersion ?? null,
    source_job: row.metadata?.sourceJob ?? null,
  }));

  for (const value of values) {
    await db.execute(sql`
      INSERT INTO ml_feature_values (feature_name, entity_id, entity_kind, value_numeric, value_json, computed_at, valid_until, data_version, source_job)
      VALUES (${value.feature_name}, ${value.entity_id}, ${value.entity_kind}, ${value.value_numeric}, ${value.value_json}, ${value.computed_at}, ${value.valid_until}, ${value.data_version}, ${value.source_job})
      ON CONFLICT (feature_name, entity_id)
      DO UPDATE SET
        value_numeric = EXCLUDED.value_numeric,
        value_json = EXCLUDED.value_json,
        computed_at = EXCLUDED.computed_at,
        valid_until = EXCLUDED.valid_until,
        data_version = EXCLUDED.data_version,
        source_job = EXCLUDED.source_job,
        created_at = NOW();
    `);
  }

  return { inserted: rows.length };
}

const allowedWarehouseViews = new Set([
  "ml_churn_features",
  "ml_upsell_features",
  "ml_eta_features",
]);

async function fetchWarehouseSnapshot(viewName: string, options: ComputeFeatureOptions = {}) {
  if (!allowedWarehouseViews.has(viewName)) {
    throw new Error(`Unsupported warehouse view: ${viewName}`);
  }

  const limitSql = options.limit ? sql`LIMIT ${options.limit}` : sql``;
  const result = await db.execute<WarehouseRow>(sql`
    SELECT
      entity_id AS "entityId",
      feature_name AS "featureName",
      feature_value AS "featureValue",
      computed_at AS "computedAt",
      valid_until AS "validUntil",
      data_version AS "dataVersion"
    FROM ${sql.raw(viewName)}
    ${limitSql}
  `);

  const parsed = (result.rows as WarehouseRow[])
    .map((row) => {
      const parseResult = warehouseSourceSchema.safeParse(row);
      if (!parseResult.success) {
        return null;
      }
      const featureName = row.featureName as FeatureName | undefined;
      const spec = featureName ? featureSpecs[featureName] : undefined;
      if (!spec) {
        return null;
      }

      if (parseResult.data.featureValue == null) {
        return null;
      }

      const featureValue = featureValueSchema.safeParse({
        featureName: spec.name,
        entityId: parseResult.data.entityId,
        entityKind: spec.entityKind,
        value: parseResult.data.featureValue,
        computedAt: parseResult.data.computedAt,
        validUntil: parseResult.data.validUntil ?? undefined,
        metadata: {
          dataVersion: parseResult.data.dataVersion,
          sourceJob: viewName,
        },
      });

      if (!featureValue.success) {
        return null;
      }

      return featureValue.data;
    })
    .filter((value): value is FeatureValue => value !== null);

  return parsed;
}

export async function computeChurnFeatures(options: ComputeFeatureOptions = {}) {
  const rows = await fetchWarehouseSnapshot("ml_churn_features", options);
  return upsertFeatureValues(rows, options);
}

export async function computeUpsellFeatures(options: ComputeFeatureOptions = {}) {
  const rows = await fetchWarehouseSnapshot("ml_upsell_features", options);
  return upsertFeatureValues(rows, options);
}

export async function computeEtaFeatures(options: ComputeFeatureOptions = {}) {
  const rows = await fetchWarehouseSnapshot("ml_eta_features", options);
  return upsertFeatureValues(rows, options);
}

export async function refreshAllFeatures(options: ComputeFeatureOptions = {}) {
  const [churn, upsell, eta] = await Promise.all([
    computeChurnFeatures(options),
    computeUpsellFeatures(options),
    computeEtaFeatures(options),
  ]);

  return {
    churn,
    upsell,
    eta,
  };
}

