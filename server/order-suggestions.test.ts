import test from "node:test";
import assert from "node:assert/strict";
import type { CustomerPackageWithUsage } from "@shared/schema";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://user:pass@localhost/db";

const { OrderSuggestionsService } = await import("./services/order-suggestions");

test("OrderSuggestionsService prioritizes frequent customer combos and surfaces seasonal highlights", async () => {
  const now = new Date("2024-06-15T08:00:00.000Z");
  const fetchCustomerOrders = async () => [
    {
      id: "ord-1",
      branchId: "b1",
      customerId: "c1",
      createdAt: new Date("2024-06-10T10:00:00.000Z").toISOString(),
      total: 140,
      items: [
        {
          service: { id: "svc-wash", name: "Wash & Fold" },
          clothingItem: { id: "cloth-shirt", name: "Shirt" },
          quantity: 3,
          total: 90,
        },
        {
          service: { id: "svc-press", name: "Pressing" },
          clothingItem: { id: "cloth-blazer", name: "Blazer" },
          quantity: 1,
          total: 50,
        },
      ],
    },
    {
      id: "ord-2",
      branchId: "b1",
      customerId: "c1",
      createdAt: new Date("2024-05-30T10:00:00.000Z").toISOString(),
      total: 60,
      items: [
        {
          service: { id: "svc-wash", name: "Wash & Fold" },
          clothingItem: { id: "cloth-shirt", name: "Shirt" },
          quantity: 2,
          total: 60,
        },
      ],
    },
  ];

  const fetchBranchOrders = async () => [
    {
      id: "ord-b1",
      branchId: "b1",
      customerId: "cx",
      createdAt: new Date("2024-06-12T09:00:00.000Z").toISOString(),
      total: 45,
      items: [
        {
          service: { id: "svc-dry", name: "Dry Cleaning" },
          clothingItem: { id: "cloth-abaya", name: "Abaya" },
          quantity: 2,
          total: 45,
        },
      ],
    },
    {
      id: "ord-b2",
      branchId: "b1",
      customerId: "cy",
      createdAt: new Date("2024-04-01T09:00:00.000Z").toISOString(),
      total: 45,
      items: [
        {
          service: { id: "svc-dry", name: "Dry Cleaning" },
          clothingItem: { id: "cloth-abaya", name: "Abaya" },
          quantity: 1,
          total: 25,
        },
      ],
    },
  ];

  const packages: CustomerPackageWithUsage[] = [
    {
      id: "pkg-1",
      packageId: "pkg-1",
      nameEn: "VIP Bundle",
      nameAr: null,
      balance: 5,
      totalCredits: 12,
      items: [
        {
          serviceId: "svc-wash",
          serviceName: "Wash & Fold",
          clothingItemId: "cloth-shirt",
          clothingItemName: "Shirt",
          balance: 5,
          totalCredits: 12,
        },
      ],
      startsAt: new Date("2024-01-01T00:00:00.000Z"),
      expiresAt: new Date("2024-07-01T00:00:00.000Z"),
    },
  ];

  const service = new OrderSuggestionsService({ fetchCustomerOrders, fetchBranchOrders });
  const result = await service.generate({ branchId: "b1", customerId: "c1", limit: 3, packages, now });

  assert.equal(result.suggestions.length, 3);
  assert.ok(result.suggestions[0].label.includes("Shirt"));
  assert.equal(result.suggestions[0].category, "repeat");
  assert.ok(result.seasonalHighlights.some((highlight) => highlight.label.includes("Dry Cleaning")));
  assert.equal(result.packageOpportunities.length, 1);
  assert.ok(result.packageOpportunities[0].estimatedSavings > 0);
  assert.equal(result.metrics.orderCount, 2);
  assert.ok(result.metrics.averageOrderValue > 0);
});
