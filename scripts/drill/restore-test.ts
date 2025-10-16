import "dotenv/config";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for restore verification");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    const startedAt = new Date();
    console.log(`⏳ Starting restore verification at ${startedAt.toISOString()}`);

    const orderCount = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM orders");
    const customerCount = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM customers");
    const lastBackup = await client.query<{ completed_at: string | null }>(
      "SELECT MAX(completed_at) AS completed_at FROM data_quality_runs",
    );

    console.log("✅ Restore verification summary:");
    console.log(` • Orders present: ${orderCount.rows[0]?.count ?? "0"}`);
    console.log(` • Customers present: ${customerCount.rows[0]?.count ?? "0"}`);
    console.log(
      ` • Last automated data quality run: ${lastBackup.rows[0]?.completed_at ?? "not recorded"}`,
    );

    const finishedAt = new Date();
    console.log(`✅ Verification completed at ${finishedAt.toISOString()}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("❌ Restore verification failed:", error);
  process.exit(1);
});
