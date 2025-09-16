-- Expenses table for financial reporting
CREATE TABLE IF NOT EXISTS "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "category" text NOT NULL,
  "amount" numeric(10,2) NOT NULL,
  "notes" text,
  "incurred_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "expenses_branch_incurred_idx" ON "expenses" ("branch_id", "incurred_at");
