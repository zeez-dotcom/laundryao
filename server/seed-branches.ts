import { db } from "./db";
import { branches } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedBranches() {
  const existing = await db
    .select()
    .from(branches)
    .where(eq(branches.code, "BR1"))
    .limit(1);
  if (existing.length) return;
  await db.insert(branches).values({ name: "Main Branch", code: "BR1" });
}

export default seedBranches;

