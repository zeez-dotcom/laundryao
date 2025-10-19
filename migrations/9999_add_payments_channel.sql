-- Add channel column to payments for POS/online tagging
ALTER TABLE payments ADD COLUMN IF NOT EXISTS channel text;
