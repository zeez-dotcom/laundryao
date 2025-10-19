-- Cash drawer sessions
CREATE TABLE IF NOT EXISTS cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) NOT NULL,
  cashier_id uuid REFERENCES users(id) NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  opening_float numeric(10,2) NOT NULL DEFAULT 0,
  counted_cash numeric(10,2) NULL,
  expected_cash numeric(10,2) NULL,
  variance numeric(10,2) NULL,
  counts jsonb NOT NULL DEFAULT '{}',
  notes text NULL
);

CREATE INDEX IF NOT EXISTS cash_sessions_branch_opened_idx ON cash_sessions(branch_id, opened_at);
