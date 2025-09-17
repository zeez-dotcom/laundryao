-- Convert coupons code uniqueness to branch-scoped uniqueness

-- Best-effort drop of previous global unique constraints/indexes on coupons.code
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'coupons_code_unique'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS coupons_code_unique';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'coupons_code_key'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS coupons_code_key';
  END IF;
EXCEPTION WHEN others THEN
  -- Ignore errors to keep migration idempotent
  NULL;
END $$;

-- Enforce uniqueness per branch
CREATE UNIQUE INDEX IF NOT EXISTS coupons_branch_code_unique
  ON coupons(branch_id, code);

