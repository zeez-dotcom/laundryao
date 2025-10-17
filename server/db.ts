import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

let ssl: pg.ClientConfig['ssl'] | undefined = undefined;
try {
  if (connectionString) {
    const u = new URL(connectionString);
    const sslmode = u.searchParams.get('sslmode');
    const sslParam = u.searchParams.get('ssl');
    if ((sslmode && sslmode.toLowerCase() === 'require') || (sslParam && sslParam.toLowerCase() === 'true') || /\.neon\.tech$/i.test(u.hostname)) {
      ssl = { rejectUnauthorized: false };
    }
  }
} catch {
  // ignore URL parse errors and leave ssl undefined
}

export const pool = new Pool({ connectionString, ssl });
export const db = drizzle(pool);

export async function assertDbConnection() {
  const client = await pool.connect();
  try {
    await client.query('select 1');
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
}
