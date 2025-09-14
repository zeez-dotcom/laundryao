export function getTaxRate(): number {
  if (typeof window === "undefined") {
    return 0.085;
  }
  const stored = localStorage.getItem("taxRate");
  const parsed = stored ? parseFloat(stored) : 8.5;
  return (isNaN(parsed) ? 8.5 : parsed) / 100;
}
