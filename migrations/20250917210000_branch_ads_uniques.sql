-- Enforce branch-specific uniqueness for ads by placement/title
CREATE UNIQUE INDEX IF NOT EXISTS branch_ads_branch_placement_title_unique
  ON branch_ads(branch_id, placement, title_en);

