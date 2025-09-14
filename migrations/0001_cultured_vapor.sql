CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
ALTER TABLE "branch_delivery_areas" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "branch_delivery_areas" ALTER COLUMN "area_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "branch_service_cities" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "branch_service_cities" ALTER COLUMN "city_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "clothing_items" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "clothing_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "clothing_items" ALTER COLUMN "category_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "clothing_items" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "customer_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_package_items" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_package_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "customer_package_items" ALTER COLUMN "customer_package_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_package_items" ALTER COLUMN "service_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_package_items" ALTER COLUMN "clothing_item_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "customer_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "package_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "starts_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "starts_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "expires_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "customer_packages" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "delivery_account_branches" ALTER COLUMN "delivery_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "delivery_account_branches" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "delivery_areas" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "delivery_orders" ALTER COLUMN "order_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "delivery_orders" ALTER COLUMN "driver_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "delivery_orders" ALTER COLUMN "pickup_time" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "delivery_orders" ALTER COLUMN "dropoff_time" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "driver_locations" ALTER COLUMN "driver_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "driver_locations" ALTER COLUMN "timestamp" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "driver_locations" ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "item_service_prices" ALTER COLUMN "clothing_item_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "item_service_prices" ALTER COLUMN "service_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "item_service_prices" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "laundry_services" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "laundry_services" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "laundry_services" ALTER COLUMN "category_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "laundry_services" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "loyalty_history" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "loyalty_history" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "loyalty_history" ALTER COLUMN "customer_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "loyalty_history" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "loyalty_history" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "order_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "sent_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "sent_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "order_prints" ALTER COLUMN "order_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "order_prints" ALTER COLUMN "printed_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "order_prints" ALTER COLUMN "printed_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "customer_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "estimated_pickup" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "actual_pickup" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "promised_ready_date" SET DEFAULT CURRENT_DATE + INTERVAL '1 day';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "package_items" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "package_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "package_items" ALTER COLUMN "package_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "package_items" ALTER COLUMN "clothing_item_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "package_items" ALTER COLUMN "service_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "package_items" ALTER COLUMN "category_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "customer_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "order_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "category_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "clothing_item_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "security_settings" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "security_settings" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "security_settings" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "security_settings" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "expire" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "order_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "branch_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "delivery_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;