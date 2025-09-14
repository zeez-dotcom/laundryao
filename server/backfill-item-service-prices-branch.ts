import { db } from "./db";
import { sql } from "drizzle-orm";
import logger from "./logger";

async function backfill() {
  await db.execute(sql`
    UPDATE item_service_prices
    SET branch_id = (
      SELECT id FROM branches LIMIT 1
    )
    WHERE branch_id IS NULL;
  `);

  const { rows } = await db.execute<{ count: string }>(
    sql`SELECT CAST(count(*) AS CHAR) AS count FROM item_service_prices WHERE branch_id IS NULL`
  );
  console.log(`Remaining rows with NULL branch_id: ${rows[0].count}`);
}

backfill()
  .then(() => {
    console.log("Backfill complete");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
