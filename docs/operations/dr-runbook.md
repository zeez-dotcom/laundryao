# Disaster Recovery Drill Runbook

**Last updated:** 2025-10-16

## Objectives

- Validate ability to restore production data within the defined Recovery Time Objective (RTO) of 60 minutes.
- Confirm Recovery Point Objective (RPO) of ≤ 15 minutes by replaying event sinks and warehouse change streams.
- Exercise incident communications, audit logging, and compliance reporting pathways.

## Quarterly Schedule

| Quarter | Primary Owner | Window | Notes |
| --- | --- | --- | --- |
| Q1 | Platform Operations | First Tuesday | Full backup restore to standby cluster. |
| Q2 | Data Engineering | Second Tuesday | Point-in-time recovery with analytics warehouse validation. |
| Q3 | Platform Operations | First Tuesday | Regional failover rehearsal. |
| Q4 | Compliance & Security | Second Tuesday | Unannounced tabletop + targeted restore. |

All drills produce a compliance report entry in `docs/compliance/reports/` via the automated scheduler.

## Preparation Checklist

1. Export latest infrastructure state (`terraform plan` / `pulumi stack export`).
2. Snapshot production Postgres and S3 object stores to the designated cold storage bucket.
3. Notify stakeholders in the `#ops-drills` channel (template stored in `attached_assets/drill-comm-template.md`).
4. Freeze non-essential deploys for the duration of the drill window.

## Execution Steps

1. Provision recovery environment using infrastructure as code with the snapshot identifiers gathered above.
2. Restore Postgres backups and replay WAL up to the designated RPO checkpoint.
3. Rehydrate the analytics warehouse and run automated data quality checks (`DataQualityService`).
4. Run workflow smoke tests to ensure builder automations remain intact.
5. Execute the restore verification script:

   ```bash
   npm run db:prepare # ensure schema parity
   npx tsx scripts/drill/restore-test.ts
   ```

6. Capture command output, sanitize as needed, and attach to the quarterly compliance report.
7. Switch traffic (or simulate via DNS cutover) and monitor critical dashboards for 30 minutes.

## Post-Drill Activities

- Conduct a 24-hour blameless retro; log findings in `docs/compliance/reports/` for the current quarter.
- File remediation tickets for any failed controls or elongated RTO/RPO metrics.
- Update runbook and related SOPs to reflect lessons learned.

## Backup Retention Policy

- Point-in-time backups retained for 14 days in warm storage.
- Weekly full backups retained for 12 weeks in cold storage with immutability lock.
- Quarterly archival snapshots retained for 7 years for compliance (GDPR + PCI DSS evidence).

## Audit & Compliance Hooks

- Audit middleware logs customer updates, workflow changes, and integration events for forensic traceability.
- Compliance scheduler persists quarterly drill evidence into `docs/compliance/reports/` with summarized metrics.
- Restore verification script records the timestamp of the latest automated data-quality run to verify monitoring freshness.

Maintain this document alongside operational changes to ensure recovery posture remains current.
