import type { City } from "@shared/schema";

let cached: City[] | null = null;

export async function getCities(): Promise<City[]> {
  if (cached) return cached;
  const res = await fetch("/api/cities");
  if (!res.ok) throw new Error("Failed to load cities");
  cached = await res.json();
  return cached;
}
