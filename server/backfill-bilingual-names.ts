// Backfill bilingual names by splitting fields that contain "English//Arabic"
// Applies to clothing_items, laundry_services, and categories.
// Safe to run multiple times; only updates when Arabic fields are empty and a '//' is present.

import { db } from "./db";
import {
  clothingItems,
  laundryServices,
  categories,
} from "@shared/schema";
import { and, eq, like, isNull, or } from "drizzle-orm";
import { parseInlineBilingual } from "./utils/excel";

async function backfillClothingItems() {
  const rows = await db
    .select()
    .from(clothingItems)
    .where(
      or(
        like(clothingItems.name, "%//%"),
        like(clothingItems.description, "%//%")
      )
    );

  let updated = 0;
  for (const row of rows as any[]) {
    const needsName = (!row.nameAr || row.nameAr === null || row.nameAr === "") && typeof row.name === "string" && row.name.includes("//");
    const needsDesc = (!row.descriptionAr || row.descriptionAr === null || row.descriptionAr === "") && typeof row.description === "string" && row.description.includes("//");
    if (!needsName && !needsDesc) continue;

    const patch: any = {};
    if (needsName) {
      const parts = parseInlineBilingual(row.name);
      patch.name = parts.en || row.name;
      if (parts.ar) patch.nameAr = parts.ar;
    }
    if (needsDesc) {
      const parts = parseInlineBilingual(row.description || "");
      if (parts.en) patch.description = parts.en;
      if (parts.ar) patch.descriptionAr = parts.ar;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(clothingItems).set(patch).where(eq(clothingItems.id, row.id));
      updated++;
    }
  }
  return updated;
}

async function backfillLaundryServices() {
  const rows = await db
    .select()
    .from(laundryServices)
    .where(
      or(
        like(laundryServices.name, "%//%"),
        like(laundryServices.description, "%//%")
      )
    );

  let updated = 0;
  for (const row of rows as any[]) {
    const needsName = (!row.nameAr || row.nameAr === null || row.nameAr === "") && typeof row.name === "string" && row.name.includes("//");
    const needsDesc = (!row.descriptionAr || row.descriptionAr === null || row.descriptionAr === "") && typeof row.description === "string" && row.description.includes("//");
    if (!needsName && !needsDesc) continue;

    const patch: any = {};
    if (needsName) {
      const parts = parseInlineBilingual(row.name);
      patch.name = parts.en || row.name;
      if (parts.ar) patch.nameAr = parts.ar;
    }
    if (needsDesc) {
      const parts = parseInlineBilingual(row.description || "");
      if (parts.en) patch.description = parts.en;
      if (parts.ar) patch.descriptionAr = parts.ar;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(laundryServices).set(patch).where(eq(laundryServices.id, row.id));
      updated++;
    }
  }
  return updated;
}

async function backfillCategories() {
  const rows = await db
    .select()
    .from(categories)
    .where(
      or(
        like(categories.name, "%//%"),
        like(categories.description, "%//%")
      )
    );

  let updated = 0;
  for (const row of rows as any[]) {
    const needsName = (!row.nameAr || row.nameAr === null || row.nameAr === "") && typeof row.name === "string" && row.name.includes("//");
    const needsDesc = (!row.descriptionAr || row.descriptionAr === null || row.descriptionAr === "") && typeof row.description === "string" && row.description.includes("//");
    if (!needsName && !needsDesc) continue;

    const patch: any = {};
    if (needsName) {
      const parts = parseInlineBilingual(row.name);
      patch.name = parts.en || row.name;
      if (parts.ar) patch.nameAr = parts.ar;
    }
    if (needsDesc) {
      const parts = parseInlineBilingual(row.description || "");
      if (parts.en) patch.description = parts.en;
      if (parts.ar) patch.descriptionAr = parts.ar;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(categories).set(patch).where(eq(categories.id, row.id));
      updated++;
    }
  }
  return updated;
}

async function main() {
  const [ci, ls, cat] = await Promise.all([
    backfillClothingItems(),
    backfillLaundryServices(),
    backfillCategories(),
  ]);
  console.log(JSON.stringify({ clothingItemsUpdated: ci, servicesUpdated: ls, categoriesUpdated: cat }));
}

main().catch((err) => {
  console.error("Backfill failed", err);
  process.exit(1);
});
