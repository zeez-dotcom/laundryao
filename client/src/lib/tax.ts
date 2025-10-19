export function getTaxRate(): number {
  // Default to 0% tax unless explicitly configured in settings
  if (typeof window === "undefined") {
    return 0;
  }
  const stored = localStorage.getItem("taxRate");
  const parsed = stored != null ? parseFloat(stored) : 0;
  return (isNaN(parsed) ? 0 : parsed) / 100;
}
