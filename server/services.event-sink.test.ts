import test from "node:test";
import assert from "node:assert/strict";

import { EventBus, createAnalyticsEvent } from "./services/event-bus";
import { EventSink, type WarehouseWriter, PostgresWarehouseWriter } from "./services/event-sink";
import { newDb } from "pg-mem";

test("event sink batches events by table", async () => {
  const bus = new EventBus({ driver: "memory" });
  const writes: Array<{ table: string; rows: Array<Record<string, unknown>> }> = [];
  const writer: WarehouseWriter = {
    async writeBatch(table, rows) {
      writes.push({ table, rows });
    },
  };

  const sink = new EventSink({
    eventBus: bus,
    writer,
    flushIntervalMs: 0,
    maxBatchSize: 10,
  });
  sink.start();

  const orderEvent = createAnalyticsEvent({
    source: "tests",
    category: "order.lifecycle",
    name: "created",
    payload: {
      orderId: "order-123",
      branchId: "branch-1",
      customerId: "customer-5",
      status: "received",
      previousStatus: null,
      deliveryStatus: null,
      deliveryId: null,
      total: 199.5,
    },
  });

  const telemetryEvent = createAnalyticsEvent({
    source: "tests",
    category: "driver.telemetry",
    name: "location_updated",
    payload: {
      driverId: "driver-22",
      lat: 24.1,
      lng: 54.2,
      speedKph: 40,
      accuracyMeters: 5,
      orderId: "order-123",
      deliveryId: null,
    },
  });

  await bus.publish(orderEvent);
  await bus.publish(telemetryEvent);
  await sink.flush();

  assert.equal(writes.length, 2);
  const orderWrite = writes.find((entry) => entry.table.includes("order"));
  const telemetryWrite = writes.find((entry) => entry.table.includes("telemetry"));
  assert.ok(orderWrite && telemetryWrite);
  assert.equal(orderWrite.rows[0].order_id, "order-123");
  assert.equal(telemetryWrite.rows[0].driver_id, "driver-22");

  await sink.stop();
});

test("event sink flushes automatically when buffer exceeds threshold", async () => {
  const bus = new EventBus({ driver: "memory" });
  let flushCount = 0;
  const writer: WarehouseWriter = {
    async writeBatch(_table, _rows) {
      flushCount += 1;
    },
  };

  const sink = new EventSink({
    eventBus: bus,
    writer,
    maxBatchSize: 1,
    flushIntervalMs: 0,
  });
  sink.start();

  const campaignEvent = createAnalyticsEvent({
    source: "tests",
    category: "campaign.interaction",
    name: "outreach_attempted",
    payload: {
      customerId: "cust-1",
      branchId: "branch-1",
      campaignId: "cmp-1",
      channel: "sms",
      templateKey: "promo",
      status: "queued",
      reason: null,
    },
  });

  await bus.publish(campaignEvent);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(flushCount, 1);
  await sink.stop();
});

test("Postgres warehouse writer persists analytics rows", async () => {
  const memoryDb = newDb();
  memoryDb.public.none(`
    CREATE TABLE analytics_order_lifecycle_events (
      event_id uuid PRIMARY KEY,
      occurred_at timestamptz NOT NULL,
      source text NOT NULL,
      schema_version integer NOT NULL,
      actor_id text,
      actor_type text,
      actor_name text,
      context jsonb,
      payload jsonb,
      order_id text,
      branch_id text,
      customer_id text,
      delivery_id text,
      status text,
      previous_status text,
      promised_ready_date timestamptz,
      delivery_status text,
      total numeric
    );
    CREATE TABLE analytics_driver_telemetry_events (
      event_id uuid PRIMARY KEY,
      occurred_at timestamptz NOT NULL,
      source text NOT NULL,
      schema_version integer NOT NULL,
      actor_id text,
      actor_type text,
      actor_name text,
      context jsonb,
      payload jsonb,
      driver_id text,
      order_id text,
      delivery_id text,
      lat double precision,
      lng double precision,
      speed_kph double precision,
      accuracy_meters double precision
    );
    CREATE TABLE analytics_campaign_interaction_events (
      event_id uuid PRIMARY KEY,
      occurred_at timestamptz NOT NULL,
      source text NOT NULL,
      schema_version integer NOT NULL,
      actor_id text,
      actor_type text,
      actor_name text,
      context jsonb,
      payload jsonb,
      customer_id text,
      branch_id text,
      campaign_id text,
      channel text,
      template_key text,
      status text,
      reason text
    );
  `);

  const adapter = memoryDb.adapters.createPg();
  const { Pool } = adapter;
  const pool = new Pool();

  const bus = new EventBus({ driver: "memory" });
  const writer = new PostgresWarehouseWriter("postgres://user:pass@localhost:5432/test");
  (writer as any).pool = pool;

  const sink = new EventSink({ eventBus: bus, writer, flushIntervalMs: 0, maxBatchSize: 10 });
  sink.start();

  const orderEvent = createAnalyticsEvent({
    source: "tests",
    category: "order.lifecycle",
    name: "status_changed",
    payload: {
      orderId: "order-999",
      branchId: "branch-1",
      customerId: "customer-3",
      status: "completed",
      previousStatus: "processing",
      promisedReadyDate: new Date().toISOString(),
      total: 250.75,
    },
  });

  await bus.publish(orderEvent);
  await sink.flush();

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT order_id, branch_id, status, total FROM analytics_order_lifecycle_events",
    );
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].order_id, "order-999");
    assert.equal(result.rows[0].branch_id, "branch-1");
    assert.equal(result.rows[0].status, "completed");
    assert.equal(Number(result.rows[0].total), 250.75);
  } finally {
    client.release();
  }

  await sink.stop();
  await bus.shutdown();
});
