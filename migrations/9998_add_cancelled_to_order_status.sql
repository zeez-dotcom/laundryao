-- Add 'cancelled' to status enum used by orders
DO $$ BEGIN
  ALTER TYPE status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
