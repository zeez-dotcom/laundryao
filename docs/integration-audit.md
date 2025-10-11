# Integration Audit (2025-10-11)

## Scope
- Review feature modules defined in the SRS and confirm whether matching APIs and reporting endpoints exist.
- Identify mismatches between the React client and Express API wiring.
- Propose remediation steps to close gaps.

## Summary Table

| Feature Area | Expected Behavior | Current Integration | Gaps | Fix Plan |
| --- | --- | --- | --- | --- |
| Authentication & RBAC | Admin/customer auth flows, guarded endpoints. | REST routes implemented in `server/routes.ts` cover login, logout, session introspection, and role guards. Client hooks hit these paths. | None observed. | — |
| Catalog Management | Manage categories/items/services, Excel import/export. | API reference matches implemented routes (e.g., `/api/catalog/*`). Client utilities use these endpoints. | None observed. | — |
| Customers & Packages | CRUD, address management, package assignment. | Server exposes the documented endpoints (e.g., `/api/customers`, `/api/packages/:id/assign`) and storage logic. Client components consume them. | None observed. | — |
| Orders & Payments | POS order lifecycle, receipts, payments. | REST routes exist and are exercised by UI flows. Reporting endpoints pull from same storage layer. | None observed. | — |
| Delivery Management | Customer requests, staff acceptance, driver assignment, status updates, realtime feeds. | Routes exist for request intake and status updates; WebSockets broadcast status/driver location. Client delivery board calls `/api/delivery-orders/:id/driver` to assign drivers. | Missing `PATCH /api/delivery-orders/:id/driver` route; status vocabulary mismatch (`pending_pickup` vs `pending`). | Add driver assignment route that reuses `storage.assignDeliveryOrder` and broadcasts update. Align front-end filters/actions to use `DeliveryStatus` enum (`pending`, `accepted`, etc.), adding mapping helper if UI labels differ. |
| Reporting & Analytics | Sales, services, products, packages, expenses, branch stats. | Routes under `/api/report*` and `/api/reports/*` implemented; client dashboards query them. | None observed. | — |
| Branch Customization & Ads | Branch dashboard copy, ad management, impression/click tracking. | CRUD endpoints for customization and ads exist; customer dashboard records impressions/clicks. | No admin analytics endpoint to view aggregated ad performance. | Add reporting route (e.g., `/api/branches/:id/ads/analytics`) that summarizes impressions/clicks by placement/timeframe for branch admins and super admins. |

## Detailed Findings

### Delivery module gaps
- **Missing driver-assignment API:** The client delivery board calls `PATCH /api/delivery-orders/:orderId/driver`, but the Express router only registers creation, request acceptance, listing, driver lookup, and status updates—no driver assignment route is defined. 【F:client/src/components/branch/DeliveryOrders.tsx†L126-L155】【F:server/routes.ts†L997-L1219】
- **Unutilized storage helper:** The storage layer already provides `assignDeliveryOrder(orderId, driverId)`, so the missing route is an integration gap rather than a missing capability. 【F:server/storage.ts†L4292-L4321】
- **Status enum mismatch:** The SPA sends status values such as `pending_pickup` and `delivered`, but the canonical `DeliveryStatus` enum enumerates `pending`, `accepted`, `driver_enroute`, `picked_up`, `processing_started`, `ready`, `out_for_delivery`, `completed`, and `cancelled`. Express validates against this enum, so updates from the UI will fail validation. 【F:client/src/components/branch/DeliveryOrders.tsx†L24-L35】【F:shared/schema.ts†L44-L65】【F:server/routes.ts†L1179-L1209】

### Ads analytics visibility
- The SRS expects ad impressions and clicks to be recorded for branch dashboards, and that data is persisted through `/customer/ads/:id/(impression|click)`. However, there is no endpoint that lets administrators review performance metrics, leaving the “reports everywhere” goal unmet for this module. 【F:docs/SRS.md†L90-L122】【F:server/routes.ts†L4845-L4942】【F:server/storage.ts†L4411-L4454】

## Remediation Plan
1. **Driver assignment route**
   - Add `PATCH /api/delivery-orders/:id/driver` guarded by `requireAuth` and branch checks. Use `storage.assignDeliveryOrder`, then broadcast via the delivery WebSocket to keep dashboards in sync. Update API docs and client success messaging accordingly.
2. **Status vocabulary alignment**
   - Replace hard-coded client statuses with the canonical enum values (e.g., map `pending` ↔︎ “Pending Pickup” label). Update filters, next-step transitions, and tests to use the enum. Adjust server validation only if additional states are introduced deliberately.
3. **Ad analytics reporting**
   - Implement a summarized analytics endpoint (e.g., grouping impressions/clicks by day and placement) accessible to branch admins/super admins. Extend the admin UI to visualize the metrics (table + chart) and add tests for aggregation queries.

Tracking these fixes will close the outstanding integration gaps and ensure that every feature has both functioning APIs and observable reporting surfaces.
