-- Helpful indexes to improve common query patterns

-- Item pricing joins and filters
CREATE INDEX IF NOT EXISTS idx_item_service_prices_branch_clothing ON item_service_prices(branch_id, clothing_item_id);
CREATE INDEX IF NOT EXISTS idx_item_service_prices_branch_service ON item_service_prices(branch_id, service_id);

-- Clothing items by user/category
CREATE INDEX IF NOT EXISTS idx_clothing_items_user ON clothing_items(user_id);
CREATE INDEX IF NOT EXISTS idx_clothing_items_category ON clothing_items(category_id);

-- Products by branch/category/type
CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_item_type ON products(item_type);

-- Packages by branch
CREATE INDEX IF NOT EXISTS idx_packages_branch ON packages(branch_id);

-- Orders by branch/status/created_at
CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Customers by branch/phone
CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);

