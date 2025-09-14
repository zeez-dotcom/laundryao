-- Update delivery_status enum values
CREATE TYPE delivery_status_new AS ENUM (
  'pending',
  'accepted',
  'driver_enroute',
  'picked_up',
  'processing_started',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled'
);

ALTER TABLE delivery_orders
  ALTER COLUMN delivery_status TYPE delivery_status_new
  USING delivery_status::text::delivery_status_new;

DROP TYPE delivery_status;
ALTER TYPE delivery_status_new RENAME TO delivery_status;
