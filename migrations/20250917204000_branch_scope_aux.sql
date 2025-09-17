-- Add and backfill branch_id for auxiliary tables

-- order_prints
ALTER TABLE order_prints ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE order_prints op
SET branch_id = o.branch_id
FROM orders o
WHERE op.order_id = o.id AND op.branch_id IS NULL;
ALTER TABLE order_prints
  ADD CONSTRAINT order_prints_branch_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE order_prints ALTER COLUMN branch_id SET NOT NULL;

-- payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE payments p
SET branch_id = COALESCE(o.branch_id, c.branch_id)
FROM orders o
LEFT JOIN customers c ON c.id = p.customer_id
WHERE p.order_id = o.id AND p.branch_id IS NULL;
UPDATE payments p
SET branch_id = c.branch_id
FROM customers c
WHERE p.order_id IS NULL AND p.customer_id = c.id AND p.branch_id IS NULL;
ALTER TABLE payments
  ADD CONSTRAINT payments_branch_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE payments ALTER COLUMN branch_id SET NOT NULL;

-- notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE notifications n
SET branch_id = o.branch_id
FROM orders o
WHERE n.order_id = o.id AND n.branch_id IS NULL;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_branch_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE notifications ALTER COLUMN branch_id SET NOT NULL;

-- delivery_orders
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE delivery_orders d
SET branch_id = o.branch_id
FROM orders o
WHERE d.order_id = o.id AND d.branch_id IS NULL;
ALTER TABLE delivery_orders
  ADD CONSTRAINT delivery_orders_branch_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE delivery_orders ALTER COLUMN branch_id SET NOT NULL;

