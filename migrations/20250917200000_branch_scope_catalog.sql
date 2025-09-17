-- Add branch_id to catalog tables and enforce branch-scoped uniqueness

-- Categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE categories c
SET branch_id = u.branch_id
FROM users u
WHERE c.user_id = u.id AND c.branch_id IS NULL;
ALTER TABLE categories
  ADD CONSTRAINT categories_branch_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id);
-- Make not null after backfill (if any rows remain NULL, this will fail; adjust data first)
ALTER TABLE categories ALTER COLUMN branch_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS categories_branch_name_unique ON categories(branch_id, name);

-- Clothing items
ALTER TABLE clothing_items ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE clothing_items ci
SET branch_id = u.branch_id
FROM users u
WHERE ci.user_id = u.id AND ci.branch_id IS NULL;
ALTER TABLE clothing_items
  ADD CONSTRAINT clothing_items_branch_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE clothing_items ALTER COLUMN branch_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clothing_items_branch_name_unique ON clothing_items(branch_id, name);

-- Laundry services
ALTER TABLE laundry_services ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE laundry_services ls
SET branch_id = u.branch_id
FROM users u
WHERE ls.user_id = u.id AND ls.branch_id IS NULL;
ALTER TABLE laundry_services
  ADD CONSTRAINT laundry_services_branch_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE laundry_services ALTER COLUMN branch_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS laundry_services_branch_name_unique ON laundry_services(branch_id, name);

