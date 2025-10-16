import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://user:pass@localhost/db";

const { OrderAnomaliesService } = await import("./services/order-anomalies");

function buildItems() {
  return [
    {
      service: { id: "svc-wash", name: "Wash & Fold" },
      clothingItem: { id: "cloth-shirt", name: "Shirt" },
      quantity: 2,
      total: 40,
    },
  ];
}

test("OrderAnomaliesService flags price spikes and potential duplicates", async () => {
  const fetchRecentOrders = async () => [
    {
      id: "order-1",
      branchId: "b1",
      customerId: "c1",
      createdAt: new Date("2024-06-01T09:00:00.000Z").toISOString(),
      total: 55,
      items: buildItems(),
    },
    {
      id: "order-2",
      branchId: "b1",
      customerId: "c1",
      createdAt: new Date("2024-06-05T09:30:00.000Z").toISOString(),
      total: 58,
      items: buildItems(),
    },
    {
      id: "order-3",
      branchId: "b1",
      customerId: "c1",
      createdAt: new Date("2024-06-06T08:00:00.000Z").toISOString(),
      total: 180,
      items: buildItems(),
    },
    {
      id: "order-4",
      branchId: "b1",
      customerId: "c1",
      createdAt: new Date("2024-06-06T08:40:00.000Z").toISOString(),
      total: 180,
      items: buildItems(),
    },
  ];

  const service = new OrderAnomaliesService({ fetchRecentOrders });
  const result = await service.detect({ branchId: "b1", customerId: "c1" });

  assert.equal(result.anomalies.length, 2);
  const types = result.anomalies.map((anomaly) => anomaly.type).sort();
  assert.deepEqual(types, ["possible_duplicate", "price_spike"]);
  const auditTypes = result.auditTrail.map((entry) => entry.type).sort();
  assert.deepEqual(auditTypes, ["possible_duplicate", "price_spike"]);
  assert.ok(result.auditTrail.every((entry) => entry.orderId.startsWith("order")));
});
