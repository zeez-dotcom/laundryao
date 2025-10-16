# Analytics Warehouse Provisioning Guide

## Overview

The analytics warehouse captures the operational event stream emitted by the API. Three canonical event families are currently supported:

| Category | Event name(s) | Purpose |
| --- | --- | --- |
| `order.lifecycle` | `created`, `request_accepted`, `delivery_status_changed` | Track the full fulfillment lifecycle, linking order, branch, customer, and delivery progress. |
| `driver.telemetry` | `location_updated` | Persist real-time driver location updates for route analytics and SLA monitoring. |
| `campaign.interaction` | `plan_updated`, `outreach_attempted`, `outreach_completed` | Record command-center outreach, plan adjustments, and outcomes for growth experiments. |

Each event carries a normalized payload plus the raw JSON body so downstream consumers can rehydrate the original context. The shared schema lives in [`shared/events.ts`](../../shared/events.ts).

## Provisioning workflow

The script [`scripts/warehouse/provision.ts`](../../scripts/warehouse/provision.ts) generates the DDL and recommended ingestion configuration for Postgres, BigQuery, or Snowflake targets.

### Usage

```bash
# Preview SQL for the default Postgres target
npx tsx scripts/warehouse/provision.ts

# Apply directly against a Postgres warehouse (requires WAREHOUSE_DATABASE_URL)
WAREHOUSE_DATABASE_URL=postgres://warehouse:warehouse@localhost:5433/laundry_warehouse \
  npx tsx scripts/warehouse/provision.ts --apply

# Emit DDL for BigQuery
BIGQUERY_DATASET=laundry_analytics \
  npx tsx scripts/warehouse/provision.ts --provider=bigquery

# Emit DDL for Snowflake
SNOWFLAKE_SCHEMA=ANALYTICS \
  SNOWFLAKE_STAGE=kafka_stage \
  npx tsx scripts/warehouse/provision.ts --provider=snowflake
```

The script always writes `scripts/warehouse/provisioning-plan.json` describing the Kafka topic (`EVENT_BUS_KAFKA_TOPIC`) and table mapping that downstream ingestion jobs should follow.

### Table layout

All targets create three tables:

* `analytics_order_lifecycle_events`
* `analytics_driver_telemetry_events`
* `analytics_campaign_interaction_events`

Common columns include `event_id`, `occurred_at`, `source`, `schema_version`, `actor_*`, `context` (JSON), and the full `payload` (JSON/VARIANT). Fact-specific columns (e.g., `order_id`, `driver_id`, `template_key`) are indexed for fast analytics queries.

## Event ingestion pipeline

1. Controllers publish analytics events through the [`EventBus`](../../server/services/event-bus.ts).
2. The [`EventSink`](../../server/services/event-sink.ts) batches those events and, when configured, writes them into the warehouse (`WAREHOUSE_DATABASE_URL`).
3. For Kafka or Pub/Sub backends, use the generated `provisioning-plan.json` as the contract between the topic and warehouse tables. Recommended connectors:
   * **BigQuery**: Dataflow `KafkaToBigQuery` template with JSON to column mapping defined in the plan file.
   * **Snowflake**: Snowpipe Streaming (or Kafka connector) landing into the stage specified via `SNOWFLAKE_STAGE` before `COPY INTO` the analytics tables.

## Required environment variables

| Variable | Description |
| --- | --- |
| `EVENT_BUS_DRIVER` | `memory`, `kafka`, or `pubsub`. Defaults to `memory` locally. |
| `EVENT_BUS_KAFKA_TOPIC` | Topic name when using Kafka/Redpanda. |
| `KAFKA_BROKERS` | Comma-separated broker list for Kafka/Redpanda. |
| `EVENT_BUS_PUBSUB_TOPIC` / `PUBSUB_PROJECT_ID` | Pub/Sub topic and project when using Google Cloud Pub/Sub. |
| `WAREHOUSE_DATABASE_URL` | Optional Postgres connection string for the in-app sink. |
| `EVENT_SINK_BATCH_SIZE` / `EVENT_SINK_FLUSH_INTERVAL_MS` | Tune batch size and flush cadence for the sink. |
| `BIGQUERY_DATASET`, `SNOWFLAKE_SCHEMA`, `SNOWFLAKE_STAGE` | Provider-specific overrides for generated DDL. |

## Local development

`docker-compose.dev.yml` provisions Redpanda (Kafka-compatible) and a dedicated analytics Postgres instance. The API container reads from these services and will automatically batch events into the warehouse if `WAREHOUSE_DATABASE_URL` is set. Run `npm run dev` to start the API and inspect emitted events in the analytics tables.

To reset the warehouse tables during development:

```bash
WAREHOUSE_DATABASE_URL=postgres://warehouse:warehouse@localhost:5433/laundry_warehouse \
  psql "$WAREHOUSE_DATABASE_URL" -c "TRUNCATE analytics_order_lifecycle_events, analytics_driver_telemetry_events, analytics_campaign_interaction_events"
```

## Monitoring and validation

* Unit tests in [`server/services.event-bus.test.ts`](../../server/services.event-bus.test.ts) and [`server/services.event-sink.test.ts`](../../server/services.event-sink.test.ts) verify retry semantics and batching logic.
* The `provisioning-plan.json` file is suitable for CI artifacts, ensuring the infrastructure team can reconcile Terraform/DBT definitions with application expectations.

Keep this document synchronized with any future event categories or schema changes.
