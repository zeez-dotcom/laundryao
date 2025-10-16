CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role text NOT NULL,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role, permission_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'system',
  entity_type text NOT NULL,
  entity_id text,
  severity text NOT NULL DEFAULT 'info',
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_events_event_type_idx ON audit_events (event_type);

CREATE TABLE IF NOT EXISTS data_quality_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  check_types jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS data_quality_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES data_quality_runs(id) ON DELETE CASCADE,
  check_name text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  entity_type text NOT NULL,
  entity_id text,
  detected_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS data_quality_exceptions_run_idx ON data_quality_exceptions (run_id);
CREATE INDEX IF NOT EXISTS data_quality_exceptions_check_idx ON data_quality_exceptions (check_name);

INSERT INTO permissions (slug, resource, action, description)
VALUES
  ('analytics.datasets.read', 'analytics.datasets', 'read', 'View curated analytics datasets'),
  ('analytics.datasets.manage', 'analytics.datasets', 'manage', 'Modify analytics datasets and workspace views'),
  ('workflows.builder.edit', 'workflows.builder', 'edit', 'Design and update workflows'),
  ('workflows.builder.publish', 'workflows.builder', 'publish', 'Run or publish workflow actions')
ON CONFLICT (slug) DO UPDATE
SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO role_permissions (role, permission_id, granted_at)
SELECT 'super_admin', id, CURRENT_TIMESTAMP FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_id, granted_at)
SELECT 'admin', id, CURRENT_TIMESTAMP
FROM permissions
WHERE slug IN ('analytics.datasets.read', 'workflows.builder.edit', 'workflows.builder.publish')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_id, granted_at)
SELECT 'user', id, CURRENT_TIMESTAMP
FROM permissions
WHERE slug = 'analytics.datasets.read'
ON CONFLICT DO NOTHING;
