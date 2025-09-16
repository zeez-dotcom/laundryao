ALTER TABLE "branch_customizations"
  ADD COLUMN IF NOT EXISTS "expenses_enabled" boolean NOT NULL DEFAULT false;
