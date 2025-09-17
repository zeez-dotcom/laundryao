-- Audit potential duplicates that would violate new branch-scoped unique indexes
\timing on

-- Packages: (branch_id, name_en) and (branch_id, name_ar when not null)
WITH d AS (
  SELECT branch_id, name_en, COUNT(*) cnt
  FROM packages
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'packages_en' AS scope, * FROM d;

WITH d AS (
  SELECT branch_id, name_ar, COUNT(*) cnt
  FROM packages
  WHERE name_ar IS NOT NULL
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'packages_ar' AS scope, * FROM d;

-- Coupons: (branch_id, code)
WITH d AS (
  SELECT branch_id, code, COUNT(*) cnt
  FROM coupons
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'coupons' AS scope, * FROM d;

-- Customers: (branch_id, phone_number), (branch_id, nickname)
WITH d AS (
  SELECT branch_id, phone_number, COUNT(*) cnt
  FROM customers
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'customers_phone' AS scope, * FROM d;

WITH d AS (
  SELECT branch_id, nickname, COUNT(*) cnt
  FROM customers
  WHERE nickname IS NOT NULL
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'customers_nickname' AS scope, * FROM d;

-- Orders: (branch_id, order_number)
WITH d AS (
  SELECT branch_id, order_number, COUNT(*) cnt
  FROM orders
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'orders' AS scope, * FROM d;

-- Products: (branch_id, name)
WITH d AS (
  SELECT branch_id, name, COUNT(*) cnt
  FROM products
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'products' AS scope, * FROM d;

-- Categories: (branch_id, name)
WITH d AS (
  SELECT branch_id, name, COUNT(*) cnt
  FROM categories
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'categories' AS scope, * FROM d;

-- Clothing items: (branch_id, name)
WITH d AS (
  SELECT branch_id, name, COUNT(*) cnt
  FROM clothing_items
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'clothing_items' AS scope, * FROM d;

-- Services: (branch_id, name)
WITH d AS (
  SELECT branch_id, name, COUNT(*) cnt
  FROM laundry_services
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'laundry_services' AS scope, * FROM d;

-- Branch QR codes: (branch_id, qr_code)
WITH d AS (
  SELECT branch_id, qr_code, COUNT(*) cnt
  FROM branch_qr_codes
  GROUP BY 1,2 HAVING COUNT(*) > 1
)
SELECT 'branch_qr_codes' AS scope, * FROM d;

