-- Add payment_method to expenses for cash vs non-cash reconciliation
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method text;
CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON expenses(payment_method);
