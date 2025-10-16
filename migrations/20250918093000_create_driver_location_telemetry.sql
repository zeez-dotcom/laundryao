CREATE TABLE IF NOT EXISTS "driver_location_telemetry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "driver_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lat" numeric(9,6) NOT NULL,
  "lng" numeric(9,6) NOT NULL,
  "speed_kph" numeric(6,2),
  "heading" numeric(6,2),
  "accuracy_meters" numeric(7,2),
  "altitude_meters" numeric(7,2),
  "battery_level_pct" numeric(5,2),
  "source" varchar(64),
  "order_id" uuid REFERENCES "orders"("id") ON DELETE SET NULL,
  "delivery_id" uuid REFERENCES "delivery_orders"("id") ON DELETE SET NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_manual_override" boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "driver_location_telemetry_driver_recorded_idx"
  ON "driver_location_telemetry" ("driver_id", "recorded_at");
CREATE INDEX IF NOT EXISTS "driver_location_telemetry_recorded_idx"
  ON "driver_location_telemetry" ("recorded_at");
CREATE INDEX IF NOT EXISTS "driver_location_telemetry_delivery_idx"
  ON "driver_location_telemetry" ("delivery_id");
