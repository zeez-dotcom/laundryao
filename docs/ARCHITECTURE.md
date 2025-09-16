# System Architecture

## Overview

```mermaid
flowchart LR
  subgraph Browser
    A[React SPA]
  end

  subgraph Server
    B[Express Router /api/*]
    WS1[/ws/delivery-orders/]
    WS2[/ws/driver-location/]
  end

  subgraph Infra
    DB[(PostgreSQL)]
    SMTP[[SMTP Provider]]
    SMS[[SMS Provider (optional)]]
  end

  A <--> B
  A <--> WS1
  A <--> WS2
  B <--> DB
  B -.notifications.-> SMTP
  B -.notifications.-> SMS
```

- Single server process (Express + Vite in dev) serves:
  - REST API under `/api/*`.
  - Web client SPA (React + Vite) over the same origin.
  - WebSockets on `/ws/delivery-orders` and `/ws/driver-location`.
  - Static uploads under `/uploads/*`.
  - Persistence is PostgreSQL via Drizzle ORM. Sessions are stored in Postgres using `connect-pg-simple`.

## Components
- Client (React + Vite)
- Server (Express)
- Storage/Data access (Drizzle + SQL helpers in `server/storage.ts`)
- Database (PostgreSQL)
- Realtime (ws)
- Notifications (Nodemailer; SMS stub)

## Connectivity
- Client → Server:
- HTTPS requests to REST API (`/api/*`).
- WebSocket connections to `/ws/delivery-orders` and `/ws/driver-location` for realtime events.
- Server → Database:
- Postgres connection via `pg.Pool` using `DATABASE_URL`.
- Sessions persisted to Postgres tables `sessions` (admin) and `customer_sessions`.
- Server → Notifications:
- Email via SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- SMS is a stub; when `ENABLE_SMS_NOTIFICATIONS=true`, messages are logged (provider integration point).
- Dev tooling:
- Vite middleware attaches to Express in development for HMR and client serving.

All database access occurs server-side. The client never connects directly to Postgres or other services.

## Request Lifecycle
- Global middleware: CORS headers (credentials allowed), JSON/urlencoded parsers with size limits, compression.
- Security headers (prod): X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, CSP with limited `connect-src`.
- Session middleware: separate admin and customer sessions; cookies are HTTP-only and `secure` in production.
- Logging: API calls under `/api/*` are logged with method, path, status, and a compact response summary.

## Authentication & Authorization
- Passport local strategy for admin/staff/super admin login.
- Hardcoded dev super admin: `superadmin/laundry123` (dev only) to bootstrap access.
- Guards:
- `requireAuth` for authenticated admin/staff endpoints.
- `requireAdminOrSuperAdmin` for privileged branch management.
- `requireSuperAdmin` for cross-branch/global endpoints.
- `requireCustomerOrAdmin` for endpoints usable by a logged-in customer or an admin acting on their behalf.
- Customers: register/login/addresses with separate customer session cookie (`customer_sid` limited to `/customer/*`).

### Role Access Matrix (high level)

| Area | Super Admin | Branch Admin | Staff | Customer |
|---|---|---|---|---|
| Branch mgmt, QR, settings | ✅ | ✅ (own) | ❌ | ❌ |
| Catalog (categories/items/services/prices) | ✅ | ✅ (own) | ❌ | ❌ |
| Users | ✅ | ❌ | ❌ | ❌ |
| Orders & Payments | ✅ | ✅ (own) | ✅ (own) | View own only |
| Packages (define/update) | ✅ | ✅ (own) | ❌ | View own only |
| Delivery mgmt (assign/status) | ✅ | ✅ (own) | ✅ (own) | Request/track |
| Reports (global) | ✅ | ❌ | ❌ | ❌ |
| Reports (branch) | ✅ | ✅ (own) | ❌ | ❌ |
| Ads/Customization | ✅ | ✅ (own) | ❌ | ❌ |

## Realtime
- WebSockets are terminated by the same HTTP server instance.
- `/ws/delivery-orders`: broadcasts delivery status and assignment updates.
- `/ws/driver-location`: broadcasts the latest driver locations; drivers can push their location which is persisted and rebroadcast.

## Data Flow (Examples)
- Order creation:
- Client sends order payload → Server validates and computes totals (including package credits) via storage → Persist order and optional payment → Return receipt data.
- Delivery lifecycle:
- Customer submits request → Branch accepts and assigns driver → Status transitions validated → Broadcast updates over WS → Completion recorded.
- Package usage:
- On checkout, server computes best-fit credit usage across customer packages, updates balances, and returns applied-credits info for the receipt.

## Ports and Deployment
- Default port: `5000` (configurable via `PORT`).
- One process serves API, SPA, uploads, and WS.
- `HOST` controls bind address (default `0.0.0.0`).

## Environment Variables
- Required: `DATABASE_URL`.
- Recommended: `SESSION_SECRET` (required in production).
- Optional Email: `ENABLE_EMAIL_NOTIFICATIONS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Optional SMS: `ENABLE_SMS_NOTIFICATIONS`.
- Misc: `PORT`, `HOST`, `NODE_ENV`, `DEBUG_OTP` (dev only to expose OTP in responses for local testing).

## Should It Connect There?
- Client ↔ Server: Yes. All client interactions should go through the server’s REST/WS interfaces on the same origin/port.
- Server ↔ Database: Yes. Only the server should access Postgres using `DATABASE_URL`.
- Server ↔ External Email/SMS: Optional. Enable via env flags; ensure credentials are not committed.
- Client ↔ Database: No. Direct DB access from the client is not allowed.
- Cross-origin: Avoid in production. Keep SPA and API on the same origin to simplify credentials and CSP.

## Files and Modules
- `server/index.ts`: App bootstrap, middleware, headers, and HTTP server.
- `server/routes.ts`: All REST routes and WS upgrade handling.
- `server/auth.ts`: Passport configuration, session stores, RBAC guards.
- `server/storage.ts`: Data access layer (Drizzle + helpers) and business logic helpers.
- `server/services/notification.ts`: Email/SMS service abstraction.
- `shared/schema.ts`: Drizzle schema for tables, enums, and validation schemas.
