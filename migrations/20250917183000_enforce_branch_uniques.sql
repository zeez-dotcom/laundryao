-- Enforce branch-scoped uniqueness for package names
-- Packages: unique (branch_id, name_en) and (branch_id, name_ar) when provided

CREATE UNIQUE INDEX IF NOT EXISTS packages_branch_name_en_unique
  ON packages(branch_id, name_en);

-- name_ar is nullable; enforce uniqueness only when NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS packages_branch_name_ar_unique
  ON packages(branch_id, name_ar)
  WHERE name_ar IS NOT NULL;

