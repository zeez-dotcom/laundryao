# Delivery Control Tower Operations

## Overview
The delivery control tower aggregates real-time telemetry, predictive ETA models, and driver workload constraints to orchestrate last-mile execution. This playbook outlines the day-to-day operating rhythm, response procedures, and fallback plans for incidents that impact the control tower UI or optimization services.

## Daily Operating Rhythm
1. **Shift Handoff (08:00 / 20:00):**
   - Review the `/api/control-tower/overview` dashboard for open deliveries, SLA breach heatmap, and driver availability.
   - Verify that auto-assignment webhooks are succeeding (check `autoAssignment` column in new delivery order logs).
   - Confirm data latency: last driver ping should be < 10 minutes; if greater, trigger telemetry health check.
2. **Proactive Monitoring (Hourly):**
   - Filter deliveries with `riskLevel = warning` and trigger preventive outreach (SMS / call) when ETA > SLA × 0.8.
   - Validate manual overrides pending review; assign owners for unresolved overrides.
3. **End-of-Day Review (23:00):**
   - Export daily assignment metrics for audit (target driver utilization 70–85%).
   - Capture incidents and improvement notes in the operations log.

## Manual Override Workflow
1. Use the control tower map or table to select a delivery.
2. Review driver candidates returned by `POST /api/control-tower/assignments/preview` (check `confidence` and `reasons`).
3. Confirm driver capacity in the driver detail drawer.
4. Apply override via `POST /api/control-tower/assignments/override`.
5. Document rationale in the case management system (include ETA, SLA delta, and driver acknowledgement).
6. Monitor for telemetry updates to confirm driver movement within 10 minutes.

## Auto-Assignment Guardrails
The automation service will skip assignment when:
- Predicted ETA exceeds **75 minutes**.
- Driver location is older than **20 minutes**.
- Delivery lacks geocoded coordinates.
- No driver has available capacity (capacity = 4 active orders minus reserved buffer).

Operators should investigate skipped assignments by validating telemetry feed, verifying branch configuration, and escalating to fleet management if no drivers are available.

## Incident Response
| Scenario | Detection | Immediate Action | Escalation |
| --- | --- | --- | --- |
| **Telemetry outage** | No driver pings for 15 min | Notify fleet lead, switch to manual assignment. Use last known locations. | Escalate to Infrastructure if outage >30 min. |
| **Optimization service error** | `/api/control-tower/overview` returns 500 | Restart service container, fall back to manual routing. | Raise incident if downtime >15 min. |
| **Heatmap data missing** | SLA heatmap empty during peak | Verify analytics warehouse sync; rerun migration if table empty. | Contact data engineering if persists >1 hour. |
| **Incorrect auto-assignment** | Drivers report impossible routes | Pause automation (`AUTO_ASSIGN=false` flag), audit recent assignments, communicate to drivers. | Escalate to product if model regression suspected. |

## Fallback Procedures
- **Manual Routing Spreadsheet:** Maintain up-to-date driver roster with capacities. Use when UI unavailable.
- **Telemetry Replay:** If telemetry table backlogs, run the `20250918093000_create_driver_location_telemetry` migration replay and restart ingestion workers.
- **Driver Check-In Loop:** Every 30 minutes, supervisors call drivers to capture manual position updates when GPS unreliable.
- **Customer Communication:** When risk level `breach` persists > 10 minutes, send proactive notification with new ETA.

## Post-Incident Review Checklist
1. Document timeline (detection, mitigation, recovery).
2. Capture root cause and contributing factors.
3. Identify automation guardrail adjustments (e.g., update max ETA threshold).
4. Update runbooks and share learnings in weekly ops sync.
