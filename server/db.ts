import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({ connectionString });
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

