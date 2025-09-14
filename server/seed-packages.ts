// @ts-nocheck
import { db } from "./db";
import {
  packages,
  packageItems,
  clothingItems,
  laundryServices,
  type InsertPackage,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { getSeedData } from "./seed-data";

export async function seedPackages() {
  const existing = await db.select().from(packages).limit(1);
  if (existing.length) return;

  const {
    PACKAGE_SEEDS,
    SUBSCRIPTION_TIER_SEEDS,
    CLOTHING_PACKAGE_SEEDS,
  } = await getSeedData();

  const allSeeds = [
    ...PACKAGE_SEEDS,
    ...SUBSCRIPTION_TIER_SEEDS,
    ...CLOTHING_PACKAGE_SEEDS,
  ];

  const clothingItemIdMap = new Map<string, string>();
  const serviceIdMap = new Map<string, string>();

  const clothingNames = Array.from(
    new Set(
      allSeeds.flatMap((p) =>
        p.packageItems?.map((i) => i.clothingItemName || ""),
      ).filter(Boolean),
    ),
  );
  if (clothingNames.length) {
    const rows = await db
      .select({ id: clothingItems.id, name: clothingItems.name })
      .from(clothingItems)
      .where(inArray(clothingItems.name, clothingNames));
    for (const row of rows) clothingItemIdMap.set(row.name, row.id);
  }

  const serviceNames = Array.from(
    new Set(
      allSeeds.flatMap((p) =>
        p.packageItems?.map((i) => i.serviceName || ""),
      ).filter(Boolean),
    ),
  );
  if (serviceNames.length) {
    const rows = await db
      .select({ id: laundryServices.id, name: laundryServices.name })
      .from(laundryServices)
      .where(inArray(laundryServices.name, serviceNames));
    for (const row of rows) serviceIdMap.set(row.name, row.id);
  }

  function mapSeeds(
    seeds: Omit<InsertPackage, "id" | "createdAt" | "updatedAt">[],
  ) {
    return seeds.map((seed) => ({
      ...seed,
      packageItems: seed.packageItems
        ?.map((item) => {
          const { clothingItemName, serviceName, ...rest } = item;
          const clothingItemId = clothingItemName
            ? clothingItemIdMap.get(clothingItemName)
            : undefined;
          const serviceId = serviceName
            ? serviceIdMap.get(serviceName)
            : undefined;
          return {
            ...rest,
            ...(clothingItemId ? { clothingItemId } : {}),
            ...(serviceId ? { serviceId } : {}),
          };
        })
        .filter((i) => (i.clothingItemId && i.serviceId) || i.categoryId),
    }));
  }

  const seeds = [
    ...mapSeeds(PACKAGE_SEEDS),
    ...mapSeeds(SUBSCRIPTION_TIER_SEEDS),
    ...mapSeeds(CLOTHING_PACKAGE_SEEDS),
  ];

  for (const seed of seeds) {
    const { packageItems: items, ...pkg } = seed;
    const [inserted] = await db.insert(packages).values(pkg).returning();
    if (items && items.length > 0) {
      await db.insert(packageItems).values(
        items.map((i) => ({ ...i, packageId: inserted.id })),
      );
    }
  }
}

export default seedPackages;

