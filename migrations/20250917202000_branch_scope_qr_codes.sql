-- Make branch QR codes unique per branch
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_qr_codes_qr_code_unique'
  ) THEN
    ALTER TABLE branch_qr_codes DROP CONSTRAINT branch_qr_codes_qr_code_unique;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS branch_qr_codes_branch_qr_unique
  ON branch_qr_codes(branch_id, qr_code);

