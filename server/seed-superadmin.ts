import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { db } from "./db";
import { branches } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedSuperAdmin() {
  const existing = await storage.getUserByUsername("superadmin");
  if (existing) return;

  // Get the main branch ID
  const [mainBranch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.code, "BR1"))
    .limit(1);

  await storage.createUser({
    username: "superadmin",
    email: null,
    passwordHash: "admin123", // Pass plain password, createUser will hash it
    firstName: "Super",
    lastName: "Admin",
    role: "super_admin",
    isActive: true,
    branchId: mainBranch?.id || null,
  });
}
