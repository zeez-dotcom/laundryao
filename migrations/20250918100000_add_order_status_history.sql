CREATE TABLE IF NOT EXISTS "order_status_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "actor" text,
  "occurred_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "order_status_history_order_id_idx"
  ON "order_status_history" ("order_id");

CREATE INDEX IF NOT EXISTS "order_status_history_occurred_at_idx"
  ON "order_status_history" ("occurred_at");
