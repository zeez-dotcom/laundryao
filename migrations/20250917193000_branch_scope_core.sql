-- Scope core uniqueness to branch

-- Customers: phone and nickname unique per branch
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_phone_number_unique'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_phone_number_unique;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_nickname_unique'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_nickname_unique;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_branch_phone_unique
  ON customers(branch_id, phone_number);
CREATE UNIQUE INDEX IF NOT EXISTS customers_branch_nickname_unique
  ON customers(branch_id, nickname);

-- Orders: order_number unique per branch
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_unique'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_order_number_unique;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_branch_order_number_unique
  ON orders(branch_id, order_number);

-- Products: name unique per branch (optional; ensures no duplicate names within branch)
CREATE UNIQUE INDEX IF NOT EXISTS products_branch_name_unique
  ON products(branch_id, name);

