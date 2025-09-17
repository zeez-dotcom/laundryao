import 'dotenv/config';
import { Client } from 'pg';

async function truncateAll() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const res = await client.query<{
      schemaname: string;
      tablename: string;
    }>(
      `SELECT schemaname, tablename
       FROM pg_tables
       WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
       ORDER BY schemaname, tablename`
    );

    if (res.rowCount === 0) {
      console.log('No user tables found to truncate.');
      return;
    }

    const fqns = res.rows.map(r => `${quoteIdent(r.schemaname)}.${quoteIdent(r.tablename)}`);
    const sql = `TRUNCATE TABLE ${fqns.join(', ')} RESTART IDENTITY CASCADE`;
    console.log(`Executing: ${sql}`);
    await client.query(sql);
    console.log('All tables truncated. Identities reset.');
  } finally {
    await client.end();
  }
}

function quoteIdent(ident: string): string {
  // Minimal identifier quoting compatible with Postgres
  return '"' + ident.replace(/"/g, '""') + '"';
}

truncateAll().catch(err => {
  console.error('Failed to truncate tables:', err);
  process.exit(1);
});

