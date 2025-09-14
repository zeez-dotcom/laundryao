import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import logger from "./logger";

async function getPlaceholderId() {
  let placeholderId: string | undefined;
  const { rows: existing } = await db.execute<{ id: string }>(
    sql`SELECT id FROM clothing_items LIMIT 1`,
  );
  if (existing.length) {
    placeholderId = existing[0].id;
  } else {
    const id = randomUUID();
    await db.execute(
      sql`INSERT INTO clothing_items (id, name) VALUES (${id}, 'Unknown item')`,
    );
    placeholderId = id;
  }
  return placeholderId;
}

async function backfill() {
  const { rows } = await db.execute<{
    id: string;
    product_id: string | null;
  }>(sql`SELECT id, product_id FROM package_items WHERE clothing_item_id IS NULL`);

  if (rows.length === 0) {
    console.log("No package_items require backfill");
    return;
  }

  const placeholderId = await getPlaceholderId();

  for (const row of rows) {
    let clothingId: string | null = null;
    if (row.product_id) {
      const { rows: prod } = await db.execute<{
        clothing_item_id: string | null;
      }>(
        sql`SELECT clothing_item_id FROM products WHERE id = ${row.product_id}`,
      );
      clothingId = prod[0]?.clothing_item_id ?? null;
    }
    if (!clothingId) {
      clothingId = placeholderId;
    }
    await db.execute(
      sql`UPDATE package_items SET clothing_item_id = ${clothingId} WHERE id = ${row.id}`,
    );
  }

  const { rows: remaining } = await db.execute<{ count: string }>(
    sql`SELECT CAST(count(*) AS CHAR) AS count FROM package_items WHERE clothing_item_id IS NULL`,
  );
  console.log(`Remaining rows with NULL clothing_item_id: ${remaining[0].count}`);
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
