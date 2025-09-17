-- Add numeric publicId columns to key tables and backfill values

-- Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE users SET public_id = nextval('users_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE branches SET public_id = nextval('branches_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE branches ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS branches_public_id_unique ON branches(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE customers SET public_id = nextval('customers_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE customers ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS customers_public_id_unique ON customers(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE orders SET public_id = nextval('orders_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE orders ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS orders_public_id_unique ON orders(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Clothing items
ALTER TABLE clothing_items ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE clothing_items SET public_id = nextval('clothing_items_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE clothing_items ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS clothing_items_public_id_unique ON clothing_items(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Laundry services
ALTER TABLE laundry_services ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE laundry_services SET public_id = nextval('laundry_services_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE laundry_services ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS laundry_services_public_id_unique ON laundry_services(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Products
ALTER TABLE products ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE products SET public_id = nextval('products_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE products ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS products_public_id_unique ON products(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Packages
ALTER TABLE packages ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE packages SET public_id = nextval('packages_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE packages ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS packages_public_id_unique ON packages(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Categories (optional but useful numerics in admin)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS public_id SERIAL;
UPDATE categories SET public_id = nextval('categories_public_id_seq') WHERE public_id IS NULL;
ALTER TABLE categories ALTER COLUMN public_id SET NOT NULL;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS categories_public_id_unique ON categories(public_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

