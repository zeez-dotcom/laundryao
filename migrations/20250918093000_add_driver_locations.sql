CREATE TABLE IF NOT EXISTS "driver_locations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "driver_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "lat" numeric(9, 6) NOT NULL,
    "lng" numeric(9, 6) NOT NULL,
    "recorded_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "driver_locations_driver_id_idx" ON "driver_locations" ("driver_id");
CREATE INDEX IF NOT EXISTS "driver_locations_recorded_at_idx" ON "driver_locations" ("recorded_at");
CREATE UNIQUE INDEX IF NOT EXISTS "driver_locations_driver_recorded_unique" ON "driver_locations" ("driver_id", "recorded_at");
