import 'dotenv/config';
import { pool } from '../server/db';

async function run(query: string, label: string) {
  const client = await pool.connect();
  try {
    console.log(`\n=== ${label} ===`);
    const res = await client.query(query);
    console.log(`Rows affected: ${res.rowCount}`);
  } finally {
    client.release();
  }
}

function tsSuffix() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  const suffix = tsSuffix();

  // Helper to safely append suffix to a text column for duplicates (keep first occurrence)
  const dedupe = async (table: string, branchCol: string, keyCol: string, updateCol?: string) => {
    const col = updateCol || keyCol;
    const sql = `
      WITH ranked AS (
        SELECT id, ${branchCol} AS branch_id, ${keyCol} AS keyval,
               ROW_NUMBER() OVER (PARTITION BY ${branchCol}, ${keyCol} ORDER BY id) rn
        FROM ${table}
        WHERE ${keyCol} IS NOT NULL
      )
      UPDATE ${table} t
      SET ${col} = ${col} || ' (dup ${suffix}-' || r.rn || ')'
      FROM ranked r
      WHERE t.id = r.id AND r.rn > 1;
    `;
    await run(sql, `dedupe ${table} on (${branchCol}, ${keyCol})`);
  };

  // Packages: name_en + name_ar
  await dedupe('packages', 'branch_id', 'name_en');
  await dedupe('packages', 'branch_id', 'name_ar');

  // Coupons: code
  await dedupe('coupons', 'branch_id', 'code');

  // Orders: order_number
  await dedupe('orders', 'branch_id', 'order_number');

  // Products: name
  await dedupe('products', 'branch_id', 'name');

  // Categories: name
  await dedupe('categories', 'branch_id', 'name');

  // Clothing items: name
  await dedupe('clothing_items', 'branch_id', 'name');

  // Laundry services: name
  await dedupe('laundry_services', 'branch_id', 'name');

  // Branch QR codes: qr_code
  await dedupe('branch_qr_codes', 'branch_id', 'qr_code');

  console.log('\nDedupe complete. Review changes before running migrations.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

