import test from "node:test";
import assert from "node:assert/strict";

import { EventBus, createAnalyticsEvent } from "./services/event-bus";

const baseEvent = createAnalyticsEvent({
  source: "test-suite",
  category: "order.lifecycle",
  name: "created",
  payload: {
    orderId: "order-1",
    branchId: "branch-1",
    customerId: "customer-1",
    status: "received",
    previousStatus: null,
    deliveryId: null,
    total: 120.5,
  },
});

test("memory event bus notifies listeners", async () => {
  const received: string[] = [];
  const bus = new EventBus({ driver: "memory" });
  bus.on((event) => {
    received.push(event.eventId);
  });

  await bus.publish(baseEvent);

  assert.equal(received.length, 1);
  assert.equal(received[0], baseEvent.eventId);
});

test("kafka event bus retries publish failures", async () => {
  let attempts = 0;
  const producer = {
    async connect() {
      return undefined;
    },
    async disconnect() {
      return undefined;
    },
    async send() {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("temporary failure");
      }
      return { errorCode: 0, baseOffset: "0", logAppendTime: "0", partition: 0 } as any;
    },
    async sendBatch() {
      return undefined as any;
    },
    async transaction() {
      return {} as any;
    },
    events: {} as any,
    on() {
      return this as any;
    },
  } as unknown as import("kafkajs").Producer;

  const bus = new EventBus({
    driver: "kafka",
    kafka: {
      brokers: ["example:9092"],
      topic: "analytics.events",
      producer,
    },
    maxRetries: 3,
    retryBackoffMs: 10,
  });

  await bus.publish(baseEvent);
  assert.equal(attempts, 2);
});

test("pubsub event bus publishes serialized payload", async () => {
  const published: Array<{ data: Buffer; attributes?: Record<string, string> }> = [];
  const topic = {
    async publishMessage(message: { data: Buffer; attributes?: Record<string, string> }) {
      published.push(message);
      return "1";
    },
  } as unknown as import("@google-cloud/pubsub").Topic;

  const bus = new EventBus({
    driver: "pubsub",
    pubsub: {
      topic: "analytics-events",
      topicInstance: topic,
    },
  });

  await bus.publish(baseEvent);

  assert.equal(published.length, 1);
  const decoded = JSON.parse(published[0].data.toString());
  assert.equal(decoded.eventId, baseEvent.eventId);
  assert.equal(published[0].attributes?.category, "order.lifecycle");
});
