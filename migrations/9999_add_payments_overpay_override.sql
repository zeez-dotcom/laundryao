-- Add overpay override fields to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_overpay_override boolean NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS override_reason text;
