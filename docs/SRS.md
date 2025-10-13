# Software Requirements Specification (SRS)

## 1. Introduction

### 1.1 Purpose
This document defines the complete functional and non-functional requirements for the Laundry POS and Delivery system (“FlutterPos”). It is the single source of truth for intended behavior across the web client, API, and database. It must be updated alongside code changes that affect routes, models, or behavior.

### 1.2 Scope
FlutterPos is a multi-branch laundry point-of-sale and delivery management platform. It supports catalog management, customer accounts, prepaid packages, orders and payments, delivery orchestration with real-time updates, analytics, and branch customization.

### 1.3 Definitions and Acronyms
- SRS: Software Requirements Specification
- API: Application Programming Interface
- POS: Point of Sale
- RBAC: Role-Based Access Control
- HMR: Hot Module Replacement (Vite dev)

### 1.4 Stakeholders
- Business Owner, Branch Managers, Staff, Delivery Drivers, Customers
- Engineering, QA, DevOps

### 1.5 References
- Architecture overview: docs/ARCHITECTURE.md
- API reference and connectivity: docs/API-REFERENCE.md, docs/delivery-orders.md, docs/packages.md
- Data schema: shared/schema.ts (source of truth for tables and enums)
- Backup procedures: docs/backup.md

## 2. Overall Description

### 2.1 Product Perspective
- Client: React + Vite single-page app served by the Express server in dev and prod.
- API: Express REST under `/api/*`, sessions via Postgres (connect-pg-simple), RBAC.
- Database: PostgreSQL accessed via Drizzle ORM (schema in `shared/schema.ts`).
- Realtime: WebSockets at `/ws/delivery-orders` and `/ws/driver-location`.
- Notifications: Email (Nodemailer) and SMS via Twilio when `SMS_PROVIDER=twilio` with `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, and `SMS_FROM_NUMBER` configured.

See docs/ARCHITECTURE.md for component and data-flow details.

### 2.2 User Classes
- Super Administrator: full system control across all branches.
- Branch Administrator: manage a specific branch (catalog, pricing, customers, orders, reports).
- Staff: day-to-day POS operations (orders, payments, customers) under branch permissions.
- Delivery Driver: receives assigned delivery jobs, streams location updates.
- Customer (and Guest): place delivery requests/orders, manage addresses, view receipts.

### 2.3 Operating Environment
- Node.js 18–20 runtime, Express server on `PORT` (default 5000)
- PostgreSQL (DATABASE_URL)
- Modern browser (Chrome, Safari, Firefox, Edge)

### 2.4 Assumptions and Dependencies
- Single server process serves both API and client. In dev, Vite middleware is attached to the same server.
- Sessions stored in Postgres; cookies are HTTP-only; production requires `SESSION_SECRET`.
- Email/SMS are optional, controlled by env flags; SMS delivery uses Twilio when `ENABLE_SMS_NOTIFICATIONS=true` with `SMS_PROVIDER=twilio`, `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, and `SMS_FROM_NUMBER` configured.
- DB migrations managed by Drizzle; schema changes originate from `shared/schema.ts`.

## 3. System Features

### 3.1 Authentication and RBAC
- Login via username/password (passport-local). Super admin hardcoded credentials are available for development only.
- Sessions: `express-session` with Postgres store. Admin and customer sessions are separated.
- Guards: `requireAuth`, `requireAdminOrSuperAdmin`, `requireSuperAdmin`, `requireCustomerOrAdmin` enforce access.
- Customer login and password reset via OTP (sent through NotificationService; dev can expose OTP in debug mode).

### 3.2 Branch and Catalog Management
- Branch CRUD, QR generation/management, service cities, delivery settings, payment methods.
- Catalog: categories, clothing items, laundry services, item-service prices per branch.
- Bulk catalog import/export (Excel templates).

### 3.3 Customer and Package Management
- Customer CRUD, addresses, balances and pay-later flows.
- Prepaid packages: define package items/credits; assign to customers; track usage and balances.

### 3.4 Orders, Payments, and Receipts
- Orders with laundry items and products; computes totals with tax and package credits.
- Status lifecycle for in-store orders and for delivery orders.
- Payments recorded against orders/customers; email receipts; order print history.

### 3.5 Delivery Management (Realtime)
- Customer delivery requests; staff/branch acceptance and assignment to drivers.
- WebSocket broadcasts for delivery status and driver location.
- Validated state transitions to prevent invalid jumps.

### 3.6 Reporting and Analytics
- Sales summaries, top products/services, clothing-item analytics, expenses reports, branch performance.

### 3.7 Notifications
- Email via SMTP (Nodemailer) with `SMTP_*` env; SMS via Twilio when enabled and configured with `SMS_PROVIDER=twilio`, `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, and `SMS_FROM_NUMBER`.
- Customer insights provide templated outreach; admins can queue bulk SMS/email actions through `/api/customer-insights/*` routes with per-customer cooldowns and audit logging.

### 3.8 Branch Customization and Ads
- Branch-specific customer dashboard settings and ad management with impressions/clicks.

### 3.9 Engagement Automation
- `/api/reports/customer-insights` exposes churn tiers, preferred services, and recommended outreach actions.
- `GET/PUT /api/customer-insights/:id/actions` returns or overrides the stored action plan (next contact, channel, notes).
- `POST /api/customer-insights/actions/bulk-send` queues SMS/email notifications, enforces rate limits (default 24h), and records outcomes for each customer.
- Admin UI supports filtering insights by churn tier, reviewing suggested actions, and confirming bulk outreach with template placeholders (e.g., `{name}`).
- Command center dossier (`GET /api/customers/:id/command-center`) aggregates profile, order history, balances, package usage, AI-generated summaries, outreach timeline, and exposes inline actions that call existing REST endpoints (payments, customer-insights). Audit entries can be pushed via `POST /api/customers/:id/command-center/audit`.

## 4. Functional Requirements

Authentication
- FR-101: Admin users can log in and maintain an authenticated session.
- FR-102: Customers can register, log in, manage addresses, and reset passwords via OTP.
- FR-103: RBAC must restrict endpoints per role; unauthorized access returns 401/403.

Catalog
- FR-201: Admins manage categories, clothing items, services, and item-service prices per branch.
- FR-202: Export/import catalog via Excel templates; parse and validate rows.

Customers and Packages
- FR-301: Admins manage customers, balances, and addresses; customers view/update their own data.
- FR-302: Define and assign packages; track per-item credit usage across multiple packages per transaction.

Orders and Payments
- FR-401: Create/modify orders; compute totals with applied credits and tax; print and email receipts.
- FR-402: Update order status; maintain order logs and print counts.
- FR-403: Record payments with method and audit trail; update customer balances.

Delivery
- FR-501: Accept delivery requests, assign drivers, enforce status transition rules.
- FR-502: Broadcast delivery updates and driver locations over WebSockets for live dashboards.

Reporting
- FR-601: Provide aggregate reports and downloadable exports for expenses and sales metrics.
- FR-602: Customer insights must display churn tiers and suggested outreach while allowing admins to queue rate-limited bulk SMS/email actions with audit trails.

Customization and Ads
- FR-701: Branch-specific UI copy and feature flags for the customer dashboard.
- FR-702: Manage branch ads; record impressions and clicks with optional geo/language metadata.

## 5. Data Model
- Source of truth: `shared/schema.ts` (Drizzle). Includes enums for order/delivery status, payment methods, etc.
- Key entities: Users, Branches, Cities, Customers, Addresses, Categories, ClothingItems, LaundryServices, ItemServicePrices, Products, Orders, OrderPrints, Payments, Packages, PackageItems, CustomerPackages/Items, Transactions, Expenses, Ads, Impressions, Clicks, Sessions, Settings.
- See docs/packages.md and docs/delivery-orders.md for focused data/flow notes.

## 6. External Interface Requirements
- REST API base: `/api/*` (see docs/API-REFERENCE.md for the full map with guards).
- WebSockets: `/ws/delivery-orders` (status broadcasts), `/ws/driver-location` (location stream).
- Static uploads: served from `/uploads/*`.
- Client SPA: served by Express (dev: Vite middleware; prod: static build).

## 7. Non-functional Requirements
- Security: HTTP-only cookies, session store in Postgres, rate limiting on auth/reset/register, CSP and headers in prod.
- Localization: Bilingual fields (English/Arabic) for catalog/branch copy; backfill utility provided.
- Performance: Paged list endpoints; avoid N+1 via storage layer; gzip compression enabled.
- Reliability: Exponential backoff for DB readiness; graceful error responses with structured messages.
- Observability: Console logging of API calls and structured server logs.
- Backup: Database backup and restore per docs/backup.md.

## 8. Constraints
- Tech stack: Node 18–20, Express, React, Vite, PostgreSQL, Drizzle, ws.
- Env vars: `DATABASE_URL` (required), `PORT` (default 5000), `HOST`, `SESSION_SECRET` (prod), `ENABLE_EMAIL_NOTIFICATIONS`, `SMTP_*`, `ENABLE_SMS_NOTIFICATIONS`, `SMS_PROVIDER`, `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, `SMS_FROM_NUMBER`.
- Deployment: Single-process server exposes API, SPA, and WS on the same origin/port.

## 9. Connectivity and Ports
- Server binds `HOST`:`PORT` (default `0.0.0.0:5000`) and serves:
- API under `/api/*` with session cookies.
- SPA and static assets; uploads under `/uploads/*`.
- WebSocket upgrades on `/ws/delivery-orders` and `/ws/driver-location`.
- Database via `DATABASE_URL` (Postgres). Sessions stored in tables `sessions` and `customer_sessions`.

## 10. Acceptance Criteria (Samples)
- Admin login establishes a session and returns `/api/auth/user` with role and branch context.
- Creating an order with package-eligible items consumes credits first and charges only residual quantities; totals reflect tax.
- Delivery request transitions only permit the configured next statuses; invalid transitions return 400.
- Reports endpoints return aggregates consistent with underlying transactions and payments for the specified time range.

## 11. Maintenance
- Keep this SRS in sync with code changes. When modifying `server/`, `client/`, or `shared/`, update docs/SRS.md and run `npm run validate:srs`.
- Add or adjust sections in docs/ARCHITECTURE.md and docs/API-REFERENCE.md as new capabilities are introduced.

