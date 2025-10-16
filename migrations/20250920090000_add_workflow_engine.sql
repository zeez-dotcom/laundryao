DO $$ BEGIN
  CREATE TYPE "workflow_status" AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "workflow_execution_status" AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "workflow_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "status" "workflow_status" NOT NULL DEFAULT 'draft',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "users"("id"),
  "branch_id" uuid REFERENCES "branches"("id"),
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "workflow_definitions_branch_idx" ON "workflow_definitions" ("branch_id");
CREATE INDEX IF NOT EXISTS "workflow_definitions_status_idx" ON "workflow_definitions" ("status");

CREATE TABLE IF NOT EXISTS "workflow_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id" uuid NOT NULL REFERENCES "workflow_definitions"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "kind" text NOT NULL,
  "type" text NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "position_x" integer NOT NULL DEFAULT 0,
  "position_y" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_nodes_workflow_key_unique" ON "workflow_nodes" ("workflow_id", "key");
CREATE INDEX IF NOT EXISTS "workflow_nodes_workflow_idx" ON "workflow_nodes" ("workflow_id");

CREATE TABLE IF NOT EXISTS "workflow_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id" uuid NOT NULL REFERENCES "workflow_definitions"("id") ON DELETE CASCADE,
  "source_node_id" uuid NOT NULL REFERENCES "workflow_nodes"("id") ON DELETE CASCADE,
  "target_node_id" uuid NOT NULL REFERENCES "workflow_nodes"("id") ON DELETE CASCADE,
  "label" text,
  "condition" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "workflow_edges_workflow_idx" ON "workflow_edges" ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_edges_source_idx" ON "workflow_edges" ("source_node_id");
CREATE INDEX IF NOT EXISTS "workflow_edges_target_idx" ON "workflow_edges" ("target_node_id");

CREATE TABLE IF NOT EXISTS "workflow_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id" uuid NOT NULL REFERENCES "workflow_definitions"("id") ON DELETE CASCADE,
  "trigger_type" text NOT NULL,
  "status" "workflow_execution_status" NOT NULL DEFAULT 'pending',
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "trigger_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "started_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" timestamptz,
  "error_message" text
);

CREATE INDEX IF NOT EXISTS "workflow_executions_workflow_idx" ON "workflow_executions" ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_executions_status_idx" ON "workflow_executions" ("status");
CREATE INDEX IF NOT EXISTS "workflow_executions_started_idx" ON "workflow_executions" ("started_at");

CREATE TABLE IF NOT EXISTS "workflow_execution_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_id" uuid NOT NULL REFERENCES "workflow_executions"("id") ON DELETE CASCADE,
  "node_id" uuid REFERENCES "workflow_nodes"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "message" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "workflow_execution_events_execution_idx" ON "workflow_execution_events" ("execution_id");
CREATE INDEX IF NOT EXISTS "workflow_execution_events_node_idx" ON "workflow_execution_events" ("node_id");
