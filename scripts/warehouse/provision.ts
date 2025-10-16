import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import { getAnalyticsTableName } from "../../server/services/event-sink";

type Provider = "postgres" | "bigquery" | "snowflake";

interface ProvisionArtifacts {
  statements: string[];
  ingestionConfig: Record<string, unknown>;
}

function buildPostgresStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS ${getAnalyticsTableName("order.lifecycle")} (
      event_id UUID PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL,
      source TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      order_id TEXT NOT NULL,
      branch_id TEXT,
      customer_id TEXT,
      delivery_id TEXT,
      status TEXT NOT NULL,
      previous_status TEXT,
      delivery_status TEXT,
      total NUMERIC,
      promised_ready_date TEXT,
      actor_id TEXT,
      actor_type TEXT,
      actor_name TEXT,
      context JSONB,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_order_events_occurred_at ON ${getAnalyticsTableName("order.lifecycle")}(occurred_at);`,
    `CREATE INDEX IF NOT EXISTS idx_order_events_branch ON ${getAnalyticsTableName("order.lifecycle")}(branch_id);`,
    `CREATE TABLE IF NOT EXISTS ${getAnalyticsTableName("driver.telemetry")} (
      event_id UUID PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL,
      source TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      heading DOUBLE PRECISION,
      speed_kph DOUBLE PRECISION,
      accuracy_meters DOUBLE PRECISION,
      order_id TEXT,
      delivery_id TEXT,
      actor_id TEXT,
      actor_type TEXT,
      actor_name TEXT,
      context JSONB,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_driver_events_occurred_at ON ${getAnalyticsTableName("driver.telemetry")}(occurred_at);`,
    `CREATE INDEX IF NOT EXISTS idx_driver_events_driver ON ${getAnalyticsTableName("driver.telemetry")}(driver_id);`,
    `CREATE TABLE IF NOT EXISTS ${getAnalyticsTableName("campaign.interaction")} (
      event_id UUID PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL,
      source TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      branch_id TEXT,
      campaign_id TEXT,
      channel TEXT,
      template_key TEXT,
      status TEXT,
      reason TEXT,
      actor_id TEXT,
      actor_type TEXT,
      actor_name TEXT,
      context JSONB,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_events_customer ON ${getAnalyticsTableName("campaign.interaction")}(customer_id);`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_events_status ON ${getAnalyticsTableName("campaign.interaction")}(status);`,
  ];
}

function buildBigQueryStatements(dataset = "laundry_analytics"): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS \`${dataset}.${getAnalyticsTableName("order.lifecycle")}\` (
      event_id STRING,
      occurred_at TIMESTAMP,
      source STRING,
      schema_version STRING,
      order_id STRING,
      branch_id STRING,
      customer_id STRING,
      delivery_id STRING,
      status STRING,
      previous_status STRING,
      delivery_status STRING,
      total NUMERIC,
      promised_ready_date STRING,
      actor STRUCT<actor_id STRING, actor_type STRING, actor_name STRING>,
      context JSON,
      payload JSON
    );`,
    `CREATE TABLE IF NOT EXISTS \`${dataset}.${getAnalyticsTableName("driver.telemetry")}\` (
      event_id STRING,
      occurred_at TIMESTAMP,
      source STRING,
      schema_version STRING,
      driver_id STRING,
      lat FLOAT64,
      lng FLOAT64,
      heading FLOAT64,
      speed_kph FLOAT64,
      accuracy_meters FLOAT64,
      order_id STRING,
      delivery_id STRING,
      actor STRUCT<actor_id STRING, actor_type STRING, actor_name STRING>,
      context JSON,
      payload JSON
    );`,
    `CREATE TABLE IF NOT EXISTS \`${dataset}.${getAnalyticsTableName("campaign.interaction")}\` (
      event_id STRING,
      occurred_at TIMESTAMP,
      source STRING,
      schema_version STRING,
      customer_id STRING,
      branch_id STRING,
      campaign_id STRING,
      channel STRING,
      template_key STRING,
      status STRING,
      reason STRING,
      actor STRUCT<actor_id STRING, actor_type STRING, actor_name STRING>,
      context JSON,
      payload JSON
    );`,
  ];
}

function buildSnowflakeStatements(schema = "ANALYTICS"): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS ${schema}.${getAnalyticsTableName("order.lifecycle")} (
      event_id STRING PRIMARY KEY,
      occurred_at TIMESTAMP_TZ,
      source STRING,
      schema_version STRING,
      order_id STRING,
      branch_id STRING,
      customer_id STRING,
      delivery_id STRING,
      status STRING,
      previous_status STRING,
      delivery_status STRING,
      total NUMBER,
      promised_ready_date STRING,
      actor VARIANT,
      context VARIANT,
      payload VARIANT,
      created_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS ${schema}.${getAnalyticsTableName("driver.telemetry")} (
      event_id STRING PRIMARY KEY,
      occurred_at TIMESTAMP_TZ,
      source STRING,
      schema_version STRING,
      driver_id STRING,
      lat FLOAT,
      lng FLOAT,
      heading FLOAT,
      speed_kph FLOAT,
      accuracy_meters FLOAT,
      order_id STRING,
      delivery_id STRING,
      actor VARIANT,
      context VARIANT,
      payload VARIANT,
      created_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS ${schema}.${getAnalyticsTableName("campaign.interaction")} (
      event_id STRING PRIMARY KEY,
      occurred_at TIMESTAMP_TZ,
      source STRING,
      schema_version STRING,
      customer_id STRING,
      branch_id STRING,
      campaign_id STRING,
      channel STRING,
      template_key STRING,
      status STRING,
      reason STRING,
      actor VARIANT,
      context VARIANT,
      payload VARIANT,
      created_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP
    );`,
  ];
}

function buildArtifacts(provider: Provider): ProvisionArtifacts {
  const kafkaTopic = process.env.EVENT_BUS_KAFKA_TOPIC || "analytics.events";
  const ingestionConfig = {
    kafkaTopic,
    tables: {
      orderLifecycle: getAnalyticsTableName("order.lifecycle"),
      driverTelemetry: getAnalyticsTableName("driver.telemetry"),
      campaignInteraction: getAnalyticsTableName("campaign.interaction"),
    },
  } satisfies Record<string, unknown>;

  if (provider === "postgres") {
    return { statements: buildPostgresStatements(), ingestionConfig };
  }
  if (provider === "bigquery") {
    const dataset = process.env.BIGQUERY_DATASET || "laundry_analytics";
    return {
      statements: buildBigQueryStatements(dataset),
      ingestionConfig: {
        ...ingestionConfig,
        provider: "bigquery",
        dataset,
        recommendedConnector: {
          type: "dataflow", 
          template: "KafkaToBigQuery",
        },
      },
    };
  }
  const schema = process.env.SNOWFLAKE_SCHEMA || "ANALYTICS";
  return {
    statements: buildSnowflakeStatements(schema),
    ingestionConfig: {
      ...ingestionConfig,
      provider: "snowflake",
      schema,
      recommendedConnector: {
        type: "snowpipe-streaming",
        stage: process.env.SNOWFLAKE_STAGE || "kafka_stage",
      },
    },
  };
}

async function applyPostgres(statements: string[]): Promise<void> {
  const connection = process.env.WAREHOUSE_DATABASE_URL;
  if (!connection) {
    throw new Error("WAREHOUSE_DATABASE_URL must be set to apply changes");
  }
  const pool = new Pool({ connectionString: connection });
  try {
    for (const statement of statements) {
      await pool.query(statement);
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const providerArg = process.argv.find((arg) => arg.startsWith("--provider="));
  const provider = (providerArg?.split("=")[1] ?? process.env.WAREHOUSE_PROVIDER ?? "postgres") as Provider;
  if (!["postgres", "bigquery", "snowflake"].includes(provider)) {
    throw new Error(`Unsupported warehouse provider: ${provider}`);
  }

  const apply = process.argv.includes("--apply");
  const artifacts = buildArtifacts(provider);

  if (provider === "postgres" && apply) {
    await applyPostgres(artifacts.statements);
    console.log("Postgres analytics warehouse provisioned");
  } else {
    console.log(`Provisioning statements for ${provider}:`);
    for (const statement of artifacts.statements) {
      console.log(`${statement.trim()};\n`);
    }
  }

  const outputDir = fileURLToPath(new URL(".", import.meta.url));
  const outputPath = resolve(outputDir, "provisioning-plan.json");
  writeFileSync(outputPath, JSON.stringify(artifacts.ingestionConfig, null, 2));
  console.log(`Ingestion configuration written to ${outputPath}`);
}

main().catch((error) => {
  console.error("Warehouse provisioning failed", error);
  process.exit(1);
});
