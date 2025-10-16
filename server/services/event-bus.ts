import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { Kafka, type Producer } from "kafkajs";
import { PubSub, type Topic } from "@google-cloud/pubsub";
import { analyticsEventSchema, type AnalyticsEvent } from "@shared/events";

type EventBusDriver = "memory" | "kafka" | "pubsub";

export interface EventBusOptions {
  driver: EventBusDriver;
  kafka?: {
    brokers: string[];
    topic: string;
    clientId?: string;
    producer?: Producer;
  };
  pubsub?: {
    topic: string;
    projectId?: string;
    client?: PubSub;
    topicInstance?: Topic;
  };
  maxRetries?: number;
  retryBackoffMs?: number;
  logger?: Pick<Logger, "info" | "warn" | "error">;
}

type EventListener = (event: AnalyticsEvent) => void | Promise<void>;

const defaultLogger: Pick<Logger, "info" | "warn" | "error"> = {
  info: (...args: unknown[]) => console.info("[event-bus]", ...args),
  warn: (...args: unknown[]) => console.warn("[event-bus]", ...args),
  error: (...args: unknown[]) => console.error("[event-bus]", ...args),
};

export class EventBus {
  private readonly logger: Pick<Logger, "info" | "warn" | "error">;
  private readonly listeners = new Set<EventListener>();
  private kafkaProducer?: Producer;
  private pubsubClient?: PubSub;
  private pubsubTopic?: Topic;

  constructor(private readonly options: EventBusOptions) {
    this.logger = options.logger ?? defaultLogger;
  }

  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: AnalyticsEvent): Promise<void> {
    const payload = analyticsEventSchema.parse(event);
    const serialized = JSON.stringify(payload);
    const driver = this.options.driver;

    if (driver === "kafka") {
      await this.withRetry(async () => {
        const producer = await this.ensureKafkaProducer();
        await producer.send({
          topic: this.options.kafka!.topic,
          messages: [{ key: payload.eventId, value: serialized }],
        });
      });
    } else if (driver === "pubsub") {
      await this.withRetry(async () => {
        const topic = await this.ensurePubSubTopic();
        await topic.publishMessage({
          data: Buffer.from(serialized),
          attributes: {
            eventId: payload.eventId,
            category: payload.category,
            name: payload.name,
          },
        });
      });
    }

    await this.notifyListeners(payload);
  }

  async publishMany(events: AnalyticsEvent[]): Promise<void> {
    if (!events.length) return;
    for (const event of events) {
      const enriched = { ...event };
      if (!enriched.eventId) {
        enriched.eventId = randomUUID();
      }
      await this.publish(enriched as AnalyticsEvent);
    }
  }

  async shutdown(): Promise<void> {
    if (this.kafkaProducer && !this.options.kafka?.producer) {
      try {
        await this.kafkaProducer.disconnect();
      } catch (error) {
        this.logger.warn({ err: error }, "Failed to disconnect Kafka producer");
      }
    }
    if (this.pubsubClient && typeof this.pubsubClient.close === "function") {
      try {
        await this.pubsubClient.close();
      } catch (error) {
        this.logger.warn({ err: error }, "Failed to close Pub/Sub client");
      }
    }
    this.listeners.clear();
  }

  private async ensureKafkaProducer(): Promise<Producer> {
    if (this.kafkaProducer) {
      return this.kafkaProducer;
    }
    const kafkaConfig = this.options.kafka;
    if (!kafkaConfig) {
      throw new Error("Kafka configuration is required for Kafka driver");
    }
    if (kafkaConfig.producer) {
      this.kafkaProducer = kafkaConfig.producer;
      return this.kafkaProducer;
    }
    const kafka = new Kafka({
      clientId: kafkaConfig.clientId ?? "laundryao-api",
      brokers: kafkaConfig.brokers,
    });
    this.kafkaProducer = kafka.producer();
    await this.kafkaProducer.connect();
    return this.kafkaProducer;
  }

  private async ensurePubSubTopic(): Promise<Topic> {
    if (this.pubsubTopic) {
      return this.pubsubTopic;
    }
    const pubsubConfig = this.options.pubsub;
    if (!pubsubConfig) {
      throw new Error("Pub/Sub configuration is required for Pub/Sub driver");
    }
    if (pubsubConfig.topicInstance) {
      this.pubsubTopic = pubsubConfig.topicInstance;
      return this.pubsubTopic;
    }
    const client = pubsubConfig.client ?? new PubSub(pubsubConfig.projectId ? { projectId: pubsubConfig.projectId } : undefined);
    this.pubsubClient = client;
    this.pubsubTopic = client.topic(pubsubConfig.topic);
    return this.pubsubTopic;
  }

  private async notifyListeners(event: AnalyticsEvent): Promise<void> {
    const listeners = Array.from(this.listeners);
    if (!listeners.length) return;
    await Promise.all(
      listeners.map(async (listener) => {
        try {
          await listener(event);
        } catch (error) {
          this.logger.warn({ err: error, eventId: event.eventId }, "Event listener failed");
        }
      }),
    );
  }

  private async withRetry(operation: () => Promise<void>): Promise<void> {
    const attempts = Math.max(1, this.options.maxRetries ?? 3);
    const baseDelay = Math.max(25, this.options.retryBackoffMs ?? 100);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await operation();
        return;
      } catch (error) {
        lastError = error;
        if (attempt === attempts) {
          break;
        }
        const delay = baseDelay * Math.pow(2, attempt - 1);
        this.logger.warn({ err: error, attempt }, "Event publish failed, retrying");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Failed to publish event");
  }
}

export function createEventBusFromEnv(logger?: Pick<Logger, "info" | "warn" | "error">): EventBus {
  const driver = (process.env.EVENT_BUS_DRIVER || "memory").toLowerCase() as EventBusDriver;
  if (driver === "kafka") {
    const brokers = (process.env.KAFKA_BROKERS || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!brokers.length) {
      throw new Error("KAFKA_BROKERS must be set when EVENT_BUS_DRIVER=kafka");
    }
    const topic = process.env.EVENT_BUS_KAFKA_TOPIC || "analytics.events";
    return new EventBus({
      driver: "kafka",
      kafka: {
        brokers,
        topic,
        clientId: process.env.EVENT_BUS_CLIENT_ID || "laundryao-api",
      },
      logger,
      maxRetries: Number.parseInt(process.env.EVENT_BUS_MAX_RETRIES || "3", 10),
      retryBackoffMs: Number.parseInt(process.env.EVENT_BUS_RETRY_DELAY_MS || "100", 10),
    });
  }
  if (driver === "pubsub") {
    const topic = process.env.EVENT_BUS_PUBSUB_TOPIC || "analytics-events";
    const projectId = process.env.PUBSUB_PROJECT_ID;
    return new EventBus({
      driver: "pubsub",
      pubsub: {
        topic,
        projectId,
      },
      logger,
      maxRetries: Number.parseInt(process.env.EVENT_BUS_MAX_RETRIES || "3", 10),
      retryBackoffMs: Number.parseInt(process.env.EVENT_BUS_RETRY_DELAY_MS || "100", 10),
    });
  }
  return new EventBus({
    driver: "memory",
    logger,
  });
}

export function createAnalyticsEvent(partial: Omit<AnalyticsEvent, "eventId" | "occurredAt" | "schemaVersion"> & {
  eventId?: string;
  occurredAt?: string;
  schemaVersion?: string;
}): AnalyticsEvent {
  const event: AnalyticsEvent = {
    eventId: partial.eventId ?? randomUUID(),
    occurredAt: partial.occurredAt ?? new Date().toISOString(),
    schemaVersion: partial.schemaVersion ?? "1.0",
    source: partial.source,
    category: partial.category,
    name: partial.name,
    payload: partial.payload,
    actor: partial.actor,
    context: partial.context,
  } as AnalyticsEvent;
  return analyticsEventSchema.parse(event);
}
