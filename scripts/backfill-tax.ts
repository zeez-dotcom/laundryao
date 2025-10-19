import 'dotenv/config';
import { db } from '../server/db';
import { orders } from '../shared/schema';
import { and, between, eq } from 'drizzle-orm';

function getServerTaxRate(): number {
  const raw = (process.env.TAX_RATE_PERCENT ?? process.env.TAX_RATE ?? '').trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!isFinite(n) || isNaN(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

async function main() {
  const rate = getServerTaxRate();
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const start = process.env.START_DATE ? new Date(process.env.START_DATE) : undefined;
  const end = process.env.END_DATE ? new Date(process.env.END_DATE) : undefined;

  const where = start && end
    ? between(orders.createdAt, start, end)
    : undefined;

  const rows = await db.select({
    id: orders.id,
    subtotal: orders.subtotal,
    tax: orders.tax,
    total: orders.total,
  }).from(orders).where(where as any);

  let scanned = 0;
  let updated = 0;
  for (const row of rows) {
    scanned++;
    const subtotal = Number(row.subtotal);
    const newTax = round2(subtotal * rate);
    const newTotal = round2(subtotal + newTax);
    const curTax = Number(row.tax);
    const curTotal = Number(row.total);
    if (curTax !== newTax || curTotal !== newTotal) {
      updated++;
      console.log(`Order ${row.id}: subtotal=${subtotal.toFixed(2)} tax ${curTax.toFixed(2)}->${newTax.toFixed(2)} total ${curTotal.toFixed(2)}->${newTotal.toFixed(2)}`);
      if (!dryRun) {
        await db.update(orders).set({
          tax: newTax.toFixed(2) as any,
          total: newTotal.toFixed(2) as any,
        }).where(eq(orders.id, row.id));
      }
    }
  }

  console.log(`Scanned: ${scanned}, Updated: ${updated}, Rate: ${(rate * 100).toFixed(2)}%${dryRun ? ' (dry-run)' : ''}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });

