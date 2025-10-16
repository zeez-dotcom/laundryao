import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://user:pass@localhost/db";

const { CustomerInsightsService } = await import("./services/customer-insights");
type CustomerInsightSummaryRecord = Awaited<ReturnType<CustomerInsightsService["generateSummary"]>>;

type ServiceOptions = ConstructorParameters<typeof CustomerInsightsService>[0];

function createService(options: ServiceOptions) {
  const store = new Map<string, CustomerInsightSummaryRecord>();
  const service = new CustomerInsightsService(options);
  (service as any).ensureTable = async () => undefined;
  (service as any).readSummary = async (customerId: string) => store.get(customerId) ?? null;
  (service as any).writeSummary = async (record: CustomerInsightSummaryRecord) => {
    store.set(record.customerId, record);
  };
  return { service, store } as const;
}

function buildInput() {
  return {
    customer: {
      id: "cust-1",
      name: "Command Center Hero",
      branchId: "b1",
      totalSpend: 2500,
      loyaltyPoints: 42,
      balanceDue: 120.5,
      orderCount: 4,
      lastOrderDate: "2024-03-10T09:00:00.000Z",
    },
    orderCadenceDays: null,
    orderTimestamps: ["2024-03-01T10:00:00.000Z", "2024-03-08T10:00:00.000Z", "2024-03-15T10:00:00.000Z"],
    topServices: ["Wash & Fold", "Ironing"],
    timelineSummary: ["2024-03-10 | order | Completed order"],
  } as const;
}

test("CustomerInsightsService caches provider output within TTL", async () => {
  const providerCalls: any[] = [];
  const { service, store } = createService({
    provider: {
      async generate(input) {
        providerCalls.push(input);
        return {
          summary: "Weekly customer with steady cadence",
          purchaseFrequency: "Weekly",
          preferredServices: input.topServices.slice(0, 2),
          sentiment: "positive",
        };
      },
    },
    ttlMs: 1000 * 60 * 60,
  });

  const input = buildInput();
  const first = await service.generateSummary(input);
  assert.equal(first.summary, "Weekly customer with steady cadence");
  assert.equal(providerCalls.length, 1);

  const cached = await service.generateSummary(input);
  assert.equal(cached.summary, first.summary);
  assert.equal(providerCalls.length, 1);
  assert.equal(store.size, 1);
});

test("CustomerInsightsService refreshes summary after TTL expiry", async () => {
  let callCount = 0;
  const { service, store } = createService({
    provider: {
      async generate() {
        callCount += 1;
        return {
          summary: `Summary call ${callCount}`,
          purchaseFrequency: "Bi-weekly",
          preferredServices: ["Wash & Fold"],
          sentiment: "neutral",
        };
      },
    },
    ttlMs: 1000 * 60 * 60,
  });

  const input = buildInput();
  const first = await service.generateSummary(input);
  assert.equal(callCount, 1);

  const existing = store.get(input.customer.id);
  assert.ok(existing);
  existing.generatedAt = new Date(Date.now() - 1000 * 60 * 60 * 24);
  store.set(input.customer.id, existing);

  const refreshed = await service.generateSummary(input);
  assert.equal(callCount, 2);
  assert.notEqual(refreshed.summary, first.summary);
});
