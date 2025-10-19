CREATE TABLE IF NOT EXISTS gl_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) NOT NULL,
  key text NOT NULL,
  account text NOT NULL,
  type text NOT NULL DEFAULT 'expense',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gl_mappings_branch_key_unique ON gl_mappings(branch_id, key);
