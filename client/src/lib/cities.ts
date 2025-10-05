import type { City } from "@shared/schema";

let cached: City[] = [];

export async function getCities(): Promise<City[]> {
  if (cached.length > 0) return cached;
  const res = await fetch("/api/cities", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load cities");
  cached = await res.json();
  return cached;
}
