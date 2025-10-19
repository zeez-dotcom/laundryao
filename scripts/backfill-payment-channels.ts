import 'dotenv/config';
import { db } from '../server/db';
import { payments } from '../shared/schema';
import { isNull, sql } from 'drizzle-orm';

async function main() {
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  // Heuristic: notes ILIKE '%online%' OR payment_method in ('knet','credit_card') -> 'online' else 'pos'
  const rows = await db.execute<any>(sql.raw(`
    SELECT id, payment_method, notes, channel FROM payments WHERE channel IS NULL
  `));
  let updated = 0;
  for (const r of rows.rows) {
    const method = String(r.payment_method || '').toLowerCase();
    const notes = String(r.notes || '').toLowerCase();
    const channel = (notes.includes('online') || method === 'knet' || method === 'credit_card') ? 'online' : 'pos';
    console.log(`Payment ${r.id}: channel -> ${channel}`);
    if (!dryRun) {
      await db.execute(sql.raw(`UPDATE payments SET channel = '${channel}' WHERE id = '${r.id}'`));
    }
    updated++;
  }
  console.log(`Updated ${updated} payments${dryRun ? ' (dry-run)' : ''}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

