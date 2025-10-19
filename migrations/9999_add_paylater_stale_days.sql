ALTER TABLE branch_customizations ADD COLUMN IF NOT EXISTS pay_later_stale_days integer DEFAULT 14;
