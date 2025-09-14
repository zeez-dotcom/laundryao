// @ts-nocheck
import {
  type InsertCategory,
  type InsertClothingItem,
  type InsertLaundryService,
  type InsertPackage,
  type InsertProduct,
  branches,
} from "@shared/schema";
import { db } from "./db";
import { inArray } from "drizzle-orm";

export const CATEGORY_SEEDS: Omit<InsertCategory, "userId">[] = [
  { name: "Normal Iron", type: "service", isActive: true },
  { name: "Normal Wash", type: "service", isActive: true },
  { name: "Normal Wash & Iron", type: "service", isActive: true },
  { name: "Urgent Iron", type: "service", isActive: true },
  { name: "Urgent Wash", type: "service", isActive: true },
  { name: "Urgent Wash & Iron", type: "service", isActive: true },
  { name: "Clothing Items", type: "clothing", isActive: true },
];

export const CLOTHING_ITEM_SEEDS: Omit<
  InsertClothingItem,
  "categoryId" | "userId"
>[] = [
  { name: "Thobe" },
  { name: "Shirt" },
  { name: "T-Shirt" },
  { name: "Trouser" },
];

interface ProductSeedDef extends Omit<InsertProduct, "branchId"> {
  branchCode: string;
  seedId: string;
}

const PRODUCT_SEED_DEFS: ProductSeedDef[] = [
  {
    seedId: "prod-everyday-1",
    name: "Everyday Garment",
    description: "Standard everyday item",
    price: "5.00",
    stock: 100,
    branchCode: "BR1",
    itemType: "everyday",
  },
  {
    seedId: "prod-premium-1",
    name: "Premium Garment One",
    description: "High quality garment",
    price: "8.00",
    stock: 50,
    branchCode: "BR1",
    itemType: "premium",
  },
  {
    seedId: "prod-premium-2",
    name: "Premium Garment Two",
    description: "Another premium item",
    price: "9.50",
    stock: 40,
    branchCode: "BR1",
    itemType: "premium",
  },
  {
    seedId: "prod-sub-standard",
    name: "Subscription Standard Item",
    description: "Item for standard subscription",
    price: "4.00",
    stock: 100,
    branchCode: "BR1",
    itemType: "everyday",
  },
  {
    seedId: "prod-sub-premium-1",
    name: "Subscription Premium Item 1",
    description: "Premium subscription item",
    price: "12.00",
    stock: 30,
    branchCode: "BR1",
    itemType: "premium",
  },
  {
    seedId: "prod-sub-premium-2",
    name: "Subscription Premium Item 2",
    description: "Second premium subscription item",
    price: "13.00",
    stock: 25,
    branchCode: "BR1",
    itemType: "premium",
  },
];

interface PackageSeedDef
  extends Omit<InsertPackage, "id" | "createdAt" | "updatedAt" | "branchId"> {
  branchCode: string;
}

const PACKAGE_SEED_DEFS: PackageSeedDef[] = [
  {
    nameEn: "Standard 10",
    nameAr: "قياسي 10",
    descriptionEn: "10-item package for everyday garments",
    descriptionAr: "حزمة 10 قطع للملابس اليومية",
    price: "30.00",
    maxItems: 10,
    expiryDays: 30,
    bonusCredits: 0,
    branchCode: "BR1",
    packageItems: [
      {
        clothingItemName: "Thobe",
        serviceName: "Normal Wash",
        credits: 10,
      },
    ],
  },
  {
    nameEn: "Premium 10",
    nameAr: "ممتاز 10",
    descriptionEn: "10-item package including premium pieces",
    descriptionAr: "حزمة 10 قطع تشمل الملابس الفاخرة",
    price: "50.00",
    maxItems: 10,
    expiryDays: 30,
    bonusCredits: 2,
    branchCode: "BR1",
    packageItems: [
      {
        clothingItemName: "Shirt",
        serviceName: "Normal Wash",
        credits: 6,
      },
      {
        clothingItemName: "T-Shirt",
        serviceName: "Normal Wash",
        credits: 4,
      },
    ],
  },
];

const SUBSCRIPTION_TIER_SEED_DEFS: PackageSeedDef[] = [
  {
    nameEn: "Standard Monthly",
    nameAr: "شهري قياسي",
    descriptionEn: "30-item monthly subscription for everyday wear",
    descriptionAr: "اشتراك شهري 30 قطعة للملابس اليومية",
    price: "100.00",
    maxItems: 30,
    expiryDays: 30,
    bonusCredits: 0,
    branchCode: "BR1",
    packageItems: [
      {
        clothingItemName: "Trouser",
        serviceName: "Normal Wash",
        credits: 30,
      },
    ],
  },
  {
    nameEn: "Premium Monthly",
    nameAr: "شهري ممتاز",
    descriptionEn: "30-item monthly subscription including premium garments",
    descriptionAr: "اشتراك شهري 30 قطعة يشمل الملابس الفاخرة",
    price: "150.00",
    maxItems: 30,
    expiryDays: 30,
    bonusCredits: 5,
    branchCode: "BR1",
    packageItems: [
      {
        clothingItemName: "Thobe",
        serviceName: "Normal Wash",
        credits: 20,
      },
      {
        clothingItemName: "Shirt",
        serviceName: "Normal Wash",
        credits: 10,
      },
    ],
  },
];

// Sample packages built from clothing item seeds. These use the clothing item
// names as placeholder IDs which will be mapped to real IDs during seeding.
const CLOTHING_PACKAGE_SEED_DEFS: PackageSeedDef[] = [
  {
    nameEn: "Sample Clothing Package",
    nameAr: "حزمة ملابس تجريبية",
    descriptionEn: "Package including sample clothing items",
    descriptionAr: "حزمة تشمل عناصر الملابس النموذجية",
    price: "20.00",
    maxItems: CLOTHING_ITEM_SEEDS.length,
    expiryDays: 30,
    bonusCredits: 0,
    branchCode: "BR1",
    packageItems: CLOTHING_ITEM_SEEDS.map((ci) => ({
      clothingItemName: ci.name,
      serviceName: "Normal Wash",
      credits: 1,
    })),
  },
];

async function fetchBranchMap(codes: string[]): Promise<Record<string, string>> {
  const rows = await db
    .select({ id: branches.id, code: branches.code })
    .from(branches)
    .where(inArray(branches.code, codes));
  const map: Record<string, string> = {};
  for (const row of rows) map[row.code] = row.id;
  return map;
}

export async function getSeedData() {
  const codes = Array.from(
    new Set([
      ...PRODUCT_SEED_DEFS.map((p) => p.branchCode),
      ...PACKAGE_SEED_DEFS.map((p) => p.branchCode),
      ...SUBSCRIPTION_TIER_SEED_DEFS.map((p) => p.branchCode),
      ...CLOTHING_PACKAGE_SEED_DEFS.map((p) => p.branchCode),
    ]),
  );
  const branchMap = await fetchBranchMap(codes);

  const apply = <T extends { branchCode: string }>(
    seed: T,
  ): Omit<T, "branchCode"> & { branchId: string } => {
    const id = branchMap[seed.branchCode];
    if (!id) throw new Error(`Branch with code ${seed.branchCode} not found`);
    const { branchCode, ...rest } = seed;
    return { ...rest, branchId: id };
  };

  return {
    PRODUCT_SEEDS: PRODUCT_SEED_DEFS.map(apply),
    PACKAGE_SEEDS: PACKAGE_SEED_DEFS.map(apply),
    SUBSCRIPTION_TIER_SEEDS: SUBSCRIPTION_TIER_SEED_DEFS.map(apply),
    CLOTHING_PACKAGE_SEEDS: CLOTHING_PACKAGE_SEED_DEFS.map(apply),
  };
}

export function mapClothingItemSeeds(
  categoryIds: Record<string, string>,
): Omit<InsertClothingItem, "userId">[] {
  const clothingCategory = CATEGORY_SEEDS.find((c) => c.type === "clothing")!;
  return CLOTHING_ITEM_SEEDS.map((item) => ({
    ...item,
    categoryId: categoryIds[clothingCategory.name],
  }));
}

export function mapLaundryServiceSeeds(
  categoryIds: Record<string, string>,
): Omit<InsertLaundryService, "userId">[] {
  return CATEGORY_SEEDS.filter((c) => c.type === "service").map((c) => ({
    name: c.name,
    price: "0.00",
    categoryId: categoryIds[c.name],
  }));
}
