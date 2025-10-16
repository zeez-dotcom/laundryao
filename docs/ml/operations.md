# ML Operations Runbook

> **Status:** Planning stub – feature computation and model training are not yet fully implemented. This runbook documents the intended operating model so the data/ML team can fill in the missing workflows.

## Feature Store

- **Schema source:** `shared/ml/features.ts` defines the canonical list of production ML features with entity metadata and TTL guidance.
- **Storage:** Provisioned via `server/db/migrations/20250918120000_create_feature_store.sql` which creates the `ml_feature_specs` and `ml_feature_values` tables.
- **Ingestion jobs:** `server/services/ml/feature-store.ts` contains helper utilities to read from warehouse materialized views (`ml_churn_features`, `ml_upsell_features`, `ml_eta_features`) and upsert the feature values table.

### Refresh cadence

| Feature | View | Suggested schedule |
|---------|------|--------------------|
| Churn score | `ml_churn_features` | Daily at 02:00 UTC |
| Upsell propensity | `ml_upsell_features` | Every 6 hours |
| Delivery ETA | `ml_eta_features` | Every 5 minutes |

Use the scheduler integration (Airflow DAG / cronjob) to invoke `scripts/ml/train.ts <job>` with the `--dry-run` flag in staging prior to production rollout.

## Model Training

1. **Kickoff:** Call `scripts/ml/train.ts` with the target job (`churn`, `upsell`, `eta`, or `all`). This script currently reuses the feature refresh helper; connect your training pipeline once models are available.
2. **Tracking:** Integrate with MLflow or Weights & Biases by wrapping the training invocation and logging feature freshness plus model metrics.
3. **Promotion:** Publish the resulting model artifact to the model registry and update serving endpoints (see below).
4. **Fallback criteria:** Trigger fallback heuristics when:
   - Prediction latency exceeds 2× the service SLO.
   - A/B guardrail metrics regress beyond agreed thresholds.
   - Feature drift exceeds tolerances defined below.

## Serving Integration

- **Customer dossier:** Use the churn and upsell features to enrich the dossier response. Ensure the handler gracefully degrades to rule-based heuristics if feature data is stale (e.g., `computed_at` older than TTL).
- **Order composer:** Surface upsell propensity for real-time offer ranking with a rule-based fallback when ML scores are unavailable.
- **Delivery ETA endpoint:** Combine the predicted ETA with deterministic SLA calculations; if `ml_feature_values` lacks a fresh record, fall back to deterministic estimates.

## Monitoring

1. **Data drift:** Build dashboards tracking feature distributions over time (e.g., average churn score by cohort, ETA residuals). Trigger alerts when KS-test / PSI thresholds are breached.
2. **Accuracy:** Compare predicted vs actual churn/upsell conversions and delivery durations. Log metrics to your observability stack.
3. **Operational:** Monitor ingestion job success rate, row counts written, and scheduler delays.

## Runbook Actions

- **Backfill:** For schema changes, populate `ml_feature_specs` and run the ingestion job in backfill mode with `--dry-run` before writing to production.
- **Failover:** Disable ML predictions by toggling the feature flag (to be implemented) and restart services to clear cached scores.
- **Retraining cadence:** Default monthly for churn/upsell, weekly for ETA unless business context dictates otherwise.

---

> **Next steps:** Implement warehouse views, training pipelines, model registry integration, and endpoint wiring as described above.

