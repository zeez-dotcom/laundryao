-- Core performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch_created_status_method ON orders(branch_id, created_at, status, payment_method);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_incurred ON expenses(branch_id, incurred_at);
