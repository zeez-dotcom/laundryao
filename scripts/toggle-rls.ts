import 'dotenv/config';
import pg from 'pg';

const tables = [
  'orders',
  'customers',
  'payments',
  'transactions',
  'products',
  'packages',
  'expenses',
  'item_service_prices',
  'branch_qr_codes',
  'notifications',
];

async function main() {
  const action = (process.argv[2] || '').toLowerCase();
  if (!['enable', 'disable'].includes(action)) {
    console.error('Usage: tsx scripts/toggle-rls.ts <enable|disable>');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    for (const t of tables) {
      if (action === 'enable') {
        await client.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY`);
        console.log(`RLS enabled on ${t}`);
      } else {
        await client.query(`ALTER TABLE public.${t} DISABLE ROW LEVEL SECURITY`);
        console.log(`RLS disabled on ${t}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

