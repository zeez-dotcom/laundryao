CREATE TABLE IF NOT EXISTS ml_feature_specs (
  name text PRIMARY KEY,
  entity_kind text NOT NULL,
  description text NOT NULL,
  data_type text NOT NULL,
  ttl_minutes integer,
  tags text[] DEFAULT ARRAY[]::text[]
);

CREATE TABLE IF NOT EXISTS ml_feature_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL REFERENCES ml_feature_specs(name) ON DELETE CASCADE,
  entity_id text NOT NULL,
  entity_kind text NOT NULL,
  value_numeric double precision,
  value_json jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  data_version text,
  source_job text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ml_feature_values
  ADD CONSTRAINT ml_feature_values_feature_entity_unique
  UNIQUE (feature_name, entity_id);

CREATE INDEX IF NOT EXISTS ml_feature_values_lookup_idx
  ON ml_feature_values (feature_name, entity_id);

CREATE INDEX IF NOT EXISTS ml_feature_values_valid_until_idx
  ON ml_feature_values (valid_until);

