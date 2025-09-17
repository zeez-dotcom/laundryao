-- Truncate all non-system tables in application schemas
-- Excludes Postgres system schemas and the Drizzle migrations schema
\timing on

DO $$
DECLARE
  stm TEXT;
BEGIN
  SELECT 'TRUNCATE TABLE '
         || string_agg(format('%I.%I', schemaname, tablename), ', ')
         || ' RESTART IDENTITY CASCADE'
    INTO stm
  FROM pg_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'drizzle');

  IF stm IS NOT NULL THEN
    RAISE NOTICE 'Executing: %', stm;
    EXECUTE stm;
  ELSE
    RAISE NOTICE 'No user tables found to truncate.';
  END IF;
END $$;

