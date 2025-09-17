-- Prepare Row-Level Security (RLS) policies for branch-based tenant isolation.
-- NOTE: This migration only defines policies; it does NOT enable RLS yet.
-- To enable later (per table):
--   ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
-- This requires the app to run each request in a transaction and:
--   SET LOCAL app.branch_id = '<branch-uuid>';

-- Helper: we rely on current_setting('app.branch_id', true) which returns NULL when unset.
-- Comparisons like (branch_id = (current_setting('app.branch_id', true))::uuid) will evaluate
-- to NULL (i.e., not true) when the setting is not provided, effectively denying access
-- once RLS is enabled and forced.

-- Core tenant tables with branch_id
-- Adjust this list as your schema evolves.

-- Orders
CREATE POLICY IF NOT EXISTS tenant_orders_select ON public.orders
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_orders_insert ON public.orders
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_orders_update ON public.orders
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_orders_delete ON public.orders
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Customers
CREATE POLICY IF NOT EXISTS tenant_customers_select ON public.customers
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_customers_insert ON public.customers
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_customers_update ON public.customers
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_customers_delete ON public.customers
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Payments
CREATE POLICY IF NOT EXISTS tenant_payments_select ON public.payments
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_payments_insert ON public.payments
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_payments_update ON public.payments
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_payments_delete ON public.payments
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Transactions
CREATE POLICY IF NOT EXISTS tenant_transactions_select ON public.transactions
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_transactions_insert ON public.transactions
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_transactions_update ON public.transactions
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_transactions_delete ON public.transactions
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Products
CREATE POLICY IF NOT EXISTS tenant_products_select ON public.products
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_products_insert ON public.products
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_products_update ON public.products
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_products_delete ON public.products
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Packages
CREATE POLICY IF NOT EXISTS tenant_packages_select ON public.packages
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_packages_insert ON public.packages
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_packages_update ON public.packages
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_packages_delete ON public.packages
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Expenses
CREATE POLICY IF NOT EXISTS tenant_expenses_select ON public.expenses
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_expenses_insert ON public.expenses
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_expenses_update ON public.expenses
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_expenses_delete ON public.expenses
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Item service prices
CREATE POLICY IF NOT EXISTS tenant_item_service_prices_select ON public.item_service_prices
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_item_service_prices_insert ON public.item_service_prices
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_item_service_prices_update ON public.item_service_prices
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_item_service_prices_delete ON public.item_service_prices
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Branch QR codes
CREATE POLICY IF NOT EXISTS tenant_branch_qr_codes_select ON public.branch_qr_codes
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_branch_qr_codes_insert ON public.branch_qr_codes
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_branch_qr_codes_update ON public.branch_qr_codes
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_branch_qr_codes_delete ON public.branch_qr_codes
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);

-- Notifications (optional; often derived from orders)
CREATE POLICY IF NOT EXISTS tenant_notifications_select ON public.notifications
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_notifications_insert ON public.notifications
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_notifications_update ON public.notifications
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_notifications_delete ON public.notifications
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);
-- Optional convenience: enable RLS in one go (commented out).
-- Uncomment when ready to enforce at DB level, after app adopts withTenant.
--
-- DO $$ BEGIN
--   PERFORM 1;
--   -- Orders
--   EXECUTE 'ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.orders FORCE ROW LEVEL SECURITY';
--   -- Customers
--   EXECUTE 'ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.customers FORCE ROW LEVEL SECURITY';
--   -- Payments
--   EXECUTE 'ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.payments FORCE ROW LEVEL SECURITY';
--   -- Transactions
--   EXECUTE 'ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY';
--   -- Products
--   EXECUTE 'ALTER TABLE public.products ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.products FORCE ROW LEVEL SECURITY';
--   -- Packages
--   EXECUTE 'ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.packages FORCE ROW LEVEL SECURITY';
--   -- Expenses
--   EXECUTE 'ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY';
--   -- Item service prices
--   EXECUTE 'ALTER TABLE public.item_service_prices ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.item_service_prices FORCE ROW LEVEL SECURITY';
--   -- Branch QR codes
--   EXECUTE 'ALTER TABLE public.branch_qr_codes ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.branch_qr_codes FORCE ROW LEVEL SECURITY';
--   -- Notifications
--   EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';
--   EXECUTE 'ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY';
-- END $$;

