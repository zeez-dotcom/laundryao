/*
 Baseline Drizzle migrations and backfill missing initial tables.
 - Creates schema `drizzle` and table `__drizzle_migrations` if missing
 - Inserts a baseline row for the latest entry in migrations/meta/_journal.json
 - Backfills specific missing tables from the initial migration, plus FKs
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

function readEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split(/\n+/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    const val = line.slice(idx + 1);
    env[key] = val;
  }
  return env;
}

function getLatestJournalEntry() {
  const journalPath = path.resolve(process.cwd(), 'migrations/meta/_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  if (!journal.entries || journal.entries.length === 0) {
    throw new Error('No entries found in migrations/meta/_journal.json');
  }
  // Last entry is considered latest
  const latest = journal.entries[journal.entries.length - 1];
  const sqlPath = path.resolve(process.cwd(), 'migrations', `${latest.tag}.sql`);
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');
  return { when: latest.when, tag: latest.tag, hash };
}

async function main() {
  const env = readEnv();
  const { when, tag, hash } = getLatestJournalEntry();

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Ensure drizzle schema and migrations table exist
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query(`CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`);

  // If no rows exist, insert baseline as the latest journal entry
  const { rows } = await client.query('SELECT id, hash, created_at FROM drizzle."__drizzle_migrations" ORDER BY id DESC LIMIT 1');
  if (rows.length === 0) {
    await client.query('INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)', [hash, when]);
    console.log(`Inserted baseline migration for ${tag} (created_at=${when})`);
  } else {
    console.log('Migrations table already has entries; skipping baseline insert.');
  }

  // Determine missing tables from initial migration that we know might be absent
  const initialTables = [
    'branch_delivery_areas',
    'delivery_account_branches',
    'delivery_areas',
    'driver_locations',
  ];
  const missing = [];
  for (const t of initialTables) {
    const r = await client.query(
      "select 1 from information_schema.tables where table_schema='public' and table_name=$1",
      [t]
    );
    if (r.rowCount === 0) missing.push(t);
  }

  if (missing.length > 0) {
    console.log('Backfilling missing tables:', missing.join(', '));
  }

  // Backfill each missing table with definitions from migrations/0000_many_la_nuit.sql
  // and add their foreign keys guarded by duplicate_object handler
  if (missing.includes('delivery_areas')) {
    await client.query('CREATE TABLE IF NOT EXISTS "delivery_areas" ("id" varchar(255) PRIMARY KEY NOT NULL)');
  }

  // Ensure types align with current foreign key targets (uuid for users.id and branches.id)
  // Helper to drop/recreate empty table with correct types
  async function recreateIfEmpty(table, createSql) {
    const cnt = await client.query(`select count(*)::int as c from "${table}"`);
    if (cnt.rows[0].c === 0) {
      await client.query(`DROP TABLE IF EXISTS "${table}"`);
      await client.query(createSql);
      return true;
    }
    return false;
  }

  if (missing.includes('branch_delivery_areas')) {
    await client.query('CREATE TABLE IF NOT EXISTS "branch_delivery_areas" ("branch_id" uuid NOT NULL, "area_id" varchar(255) NOT NULL, CONSTRAINT "branch_delivery_areas_branch_id_area_id_pk" PRIMARY KEY("branch_id","area_id"))');
  } else {
    // If exists but wrong type, recreate if empty
    const t = await client.query("select data_type from information_schema.columns where table_schema='public' and table_name='branch_delivery_areas' and column_name='branch_id'");
    if (t.rows[0]?.data_type !== 'uuid') {
      await recreateIfEmpty('branch_delivery_areas', 'CREATE TABLE "branch_delivery_areas" ("branch_id" uuid NOT NULL, "area_id" varchar(255) NOT NULL, CONSTRAINT "branch_delivery_areas_branch_id_area_id_pk" PRIMARY KEY("branch_id","area_id"))');
    }
  }

  if (missing.includes('delivery_account_branches')) {
    await client.query('CREATE TABLE IF NOT EXISTS "delivery_account_branches" ("delivery_account_id" uuid NOT NULL, "branch_id" uuid NOT NULL, CONSTRAINT "delivery_account_branches_delivery_account_id_branch_id_pk" PRIMARY KEY("delivery_account_id","branch_id"))');
  } else {
    const t1 = await client.query("select data_type from information_schema.columns where table_schema='public' and table_name='delivery_account_branches' and column_name='delivery_account_id'");
    const t2 = await client.query("select data_type from information_schema.columns where table_schema='public' and table_name='delivery_account_branches' and column_name='branch_id'");
    if (t1.rows[0]?.data_type !== 'uuid' || t2.rows[0]?.data_type !== 'uuid') {
      await recreateIfEmpty('delivery_account_branches', 'CREATE TABLE "delivery_account_branches" ("delivery_account_id" uuid NOT NULL, "branch_id" uuid NOT NULL, CONSTRAINT "delivery_account_branches_delivery_account_id_branch_id_pk" PRIMARY KEY("delivery_account_id","branch_id"))');
    }
  }

  if (missing.includes('driver_locations')) {
    await client.query('CREATE TABLE IF NOT EXISTS "driver_locations" ("driver_id" uuid NOT NULL, "lat" numeric(9, 6) NOT NULL, "lng" numeric(9, 6) NOT NULL, "timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT "driver_locations_driver_id_timestamp_pk" PRIMARY KEY("driver_id","timestamp"))');
  } else {
    const t = await client.query("select data_type from information_schema.columns where table_schema='public' and table_name='driver_locations' and column_name='driver_id'");
    if (t.rows[0]?.data_type !== 'uuid') {
      await recreateIfEmpty('driver_locations', 'CREATE TABLE "driver_locations" ("driver_id" uuid NOT NULL, "lat" numeric(9, 6) NOT NULL, "lng" numeric(9, 6) NOT NULL, "timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT "driver_locations_driver_id_timestamp_pk" PRIMARY KEY("driver_id","timestamp"))');
    }
  }

  // Add foreign keys (use DO blocks to avoid errors if already present)
  // branch_delivery_areas FKs
  await client.query(`DO $$
  BEGIN
    BEGIN
      ALTER TABLE "branch_delivery_areas" ADD CONSTRAINT "branch_delivery_areas_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TABLE "branch_delivery_areas" ADD CONSTRAINT "branch_delivery_areas_area_id_delivery_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."delivery_areas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END $$;`);

  // delivery_account_branches FKs
  await client.query(`DO $$
  BEGIN
    BEGIN
      ALTER TABLE "delivery_account_branches" ADD CONSTRAINT "delivery_account_branches_delivery_account_id_users_id_fk" FOREIGN KEY ("delivery_account_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TABLE "delivery_account_branches" ADD CONSTRAINT "delivery_account_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END $$;`);

  // driver_locations FK
  await client.query(`DO $$
  BEGIN
    BEGIN
      ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END $$;`);

  await client.end();
  console.log('Baseline and backfill complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
