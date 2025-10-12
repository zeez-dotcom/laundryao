-- Create customer_engagement_plans table for automated engagement workflows
CREATE TABLE IF NOT EXISTS customer_engagement_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  churn_tier text NOT NULL DEFAULT 'new',
  preferred_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_action text,
  recommended_channel text,
  next_contact_at timestamptz,
  last_action_at timestamptz,
  last_action_channel text,
  last_outcome text,
  source text NOT NULL DEFAULT 'auto',
  rate_limited_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_engagement_plans_customer_unique
  ON customer_engagement_plans(customer_id);

CREATE INDEX IF NOT EXISTS customer_engagement_plans_branch_next_contact_idx
  ON customer_engagement_plans(branch_id, next_contact_at);

-- Prepare row-level security (RLS) policies matching other branch-owned tables.
CREATE POLICY IF NOT EXISTS tenant_customer_engagement_plans_select ON public.customer_engagement_plans
  FOR SELECT USING (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_customer_engagement_plans_insert ON public.customer_engagement_plans
  FOR INSERT WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_customer_engagement_plans_update ON public.customer_engagement_plans
  FOR UPDATE USING (branch_id = (current_setting('app.branch_id', true))::uuid)
  WITH CHECK (branch_id = (current_setting('app.branch_id', true))::uuid);
CREATE POLICY IF NOT EXISTS tenant_customer_engagement_plans_delete ON public.customer_engagement_plans
  FOR DELETE USING (branch_id = (current_setting('app.branch_id', true))::uuid);
