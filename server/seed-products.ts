import { db } from "./db";
import { products } from "@shared/schema";
import { getSeedData } from "./seed-data";

export async function seedProducts() {
  const { PRODUCT_SEEDS } = await getSeedData();
  if (PRODUCT_SEEDS.length) {
    await db
      .insert(products)
      .values(PRODUCT_SEEDS)
      .onConflictDoNothing();
  }
}
