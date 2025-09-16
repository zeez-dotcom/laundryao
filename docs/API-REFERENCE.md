# API Reference

Base URL
- All endpoints are served from the same origin as the SPA. The REST API is under `/api/*`. WebSocket endpoints are under `/ws/*`.
- Health: `GET /health` and `GET /health/db`.

## Cheat Sheet (Most Used)
- POST `/api/login` — login (admin/staff)
- GET `/api/auth/user` — who am I (role + branch)
- POST `/api/orders` — create order
- PATCH `/api/orders/:id/status` — update order status
- POST `/api/payments` — record payment
- GET `/api/report/summary` — POS dashboard summary
- POST `/customer/login` — customer login
- POST `/api/delivery-orders` — create delivery request
- PATCH `/api/delivery-orders/:id/status` — update delivery status
- WS `/ws/delivery-orders` — subscribe to delivery updates

Auth and Sessions
- Admin sessions: HTTP-only cookie `sid` (path `/`).
- Customer sessions: HTTP-only cookie `customer_sid` (path `/customer`).
- Guards:
- `requireAuth` (authenticated admin/staff), `requireAdminOrSuperAdmin`, `requireSuperAdmin`, `requireCustomerOrAdmin`.

## Authentication
- POST `/api/login` — admin/staff login.
- POST `/api/logout` — admin/staff logout.
- GET `/api/auth/user` — requireAuth; returns current user with role/branch.
- POST `/auth/password/forgot` — admin password reset request.
- POST `/auth/password/reset` — admin password reset.

## Customer Auth & Profile
- POST `/customer/register` — customer registration.
- POST `/customer/login` — customer login.
- POST `/customer/logout` — customer logout.
- GET `/customer/me` — get current customer profile.
- POST `/customer/request-password-reset` — send OTP to phone.
- POST `/customer/reset-password` — verify OTP and set new password.
- GET `/customer/addresses` — list own addresses.
- POST `/customer/addresses` — create own address.
- PUT `/customer/addresses/:id` — update own address.
- DELETE `/customer/addresses/:id` — delete own address.
- GET `/customer/packages` — requireCustomerOrAdmin; list own packages with usage.
- GET `/customer/orders` — list recent own orders.
- GET `/customer/orders/:id/receipt` — retrieve receipt data for own order.

## Users
- GET `/api/users` — requireSuperAdmin; list users.
- POST `/api/users` — requireSuperAdmin; create user.
- PUT `/api/users/:id` — requireSuperAdmin; update user (admin edit).
- PUT `/api/users/:id/branch` — requireSuperAdmin; set user branch.
- PUT `/api/users/:id` — requireAuth; update own profile (via guarded path in routes).
- PUT `/api/users/:id/password` — requireAuth; update own password.

## Branches
- GET `/api/branches` — requireSuperAdmin; list branches.
- POST `/api/branches` — requireSuperAdmin; create branch.
- PUT `/api/branches/:id` — requireAdminOrSuperAdmin; update branch.
- DELETE `/api/branches/:id` — requireSuperAdmin; delete branch.
- GET `/api/branches/:code` — public; get branch by code.
- Customization
- GET `/api/branches/:branchId/customization` — requireAuth.
- PUT `/api/branches/:branchId/customization` — requireAuth.
- QR Codes
- GET `/api/branches/:id/qr-codes` — requireAdminOrSuperAdmin.
- GET `/api/branches/:id/qr-codes/active` — requireAdminOrSuperAdmin.
- POST `/api/branches/:id/qr-codes` — requireAdminOrSuperAdmin.
- PUT `/api/branches/:id/qr-codes/:qrId/deactivate` — requireAdminOrSuperAdmin.
- POST `/api/branches/:id/qr-codes/regenerate` — requireAdminOrSuperAdmin.
- Delivery Settings
- GET `/api/branches/:id/delivery-settings` — requireAdminOrSuperAdmin.
- PUT `/api/branches/:id/delivery-settings` — requireAdminOrSuperAdmin.
- Customer Dashboard Settings
- GET `/api/branches/:id/customer-dashboard-settings` — requireAdminOrSuperAdmin.
- PUT `/api/branches/:id/customer-dashboard-settings` — requireAdminOrSuperAdmin.
- Service Cities/Items/Packages/Payments
- GET `/api/branches/:id/service-cities` — requireAdminOrSuperAdmin.
- GET `/api/branches/:id/delivery-items` — requireAdminOrSuperAdmin.
- PUT `/api/branches/:id/delivery-items/:clothingItemId/:serviceId` — requireAdminOrSuperAdmin.
- GET `/api/branches/:id/delivery-packages` — requireAdminOrSuperAdmin.
- PUT `/api/branches/:id/delivery-packages/:packageId` — requireAdminOrSuperAdmin.
- GET `/api/branches/:id/payment-methods` — requireAdminOrSuperAdmin.
- PUT `/api/branches/:id/payment-methods/:paymentMethod` — requireAdminOrSuperAdmin.

## Catalog (Categories, Items, Services, Prices, Products)
- Categories — requireAdminOrSuperAdmin
- GET `/api/categories`
- POST `/api/categories`
- PUT `/api/categories/:id`
- DELETE `/api/categories/:id`
- Clothing Items
- GET `/api/clothing-items/:id` — requireAuth.
- POST `/api/clothing-items` — requireAdminOrSuperAdmin.
- PUT `/api/clothing-items/:id` — requireAdminOrSuperAdmin.
- DELETE `/api/clothing-items/:id` — requireAdminOrSuperAdmin.
- Laundry Services
- GET `/api/laundry-services` — requireAuth.
- GET `/api/laundry-services/:id` — requireAuth.
- POST `/api/laundry-services` — requireAdminOrSuperAdmin.
- PUT `/api/laundry-services/:id` — requireAdminOrSuperAdmin.
- DELETE `/api/laundry-services/:id` — requireAdminOrSuperAdmin.
- Item-Service Prices (per-branch)
- GET `/api/item-prices` — requireAuth.
- POST `/api/item-service-prices` — requireAdminOrSuperAdmin.
- PUT `/api/item-service-prices` — requireAdminOrSuperAdmin.
- DELETE `/api/item-service-prices` — requireAdminOrSuperAdmin.
- Products
- POST `/api/products` — requireAdminOrSuperAdmin.
- PUT `/api/products/:id` — requireAdminOrSuperAdmin.
- GET `/api/products/:id/services` — requireAuth; get available services/prices for a product’s clothing item.
- Catalog I/O
- GET `/api/catalog/export` — requireAuth.
- GET `/api/catalog/bulk-template` — requireAuth.

## Customers (Admin-facing)
- GET `/api/customers` — requireAuth.
- GET `/api/customers/:id` — requireAuth.
- GET `/api/customers/:customerId/packages` — requireAuth.
- GET `/api/customers/phone/:phoneNumber` — requireAuth.
- GET `/api/customers/nickname/:nickname` — requireAuth.
- POST `/api/customers` — requireAuth.
- PATCH `/api/customers/:id` — requireAuth.
- PUT `/api/customers/:id/password` — requireAdminOrSuperAdmin.
- DELETE `/api/customers/:id` — requireAuth.
- Addresses
- GET `/api/customers/:customerId/addresses` — requireAuth.
- POST `/api/customers/:customerId/addresses` — requireAuth.

## Orders
- GET `/api/orders` — requireAuth.
- GET `/api/orders/:id` — requireAuth.
- GET `/api/customers/:customerId/orders` — requireAuth.
- POST `/api/orders` — requireAuth.
- PATCH `/api/orders/:id` — requireAuth.
- PATCH `/api/orders/:id/status` — requireAuth.
- PUT `/api/orders/:orderId/status` — requireAuth (alternative status update path).
- POST `/api/orders/:id/print` — requireAuth.
- GET `/api/orders/:id/prints` — requireAuth.

## Payments and Transactions
- GET `/api/payments` — requireAuth.
- GET `/api/customers/:customerId/payments` — requireAuth.
- POST `/api/customers/:customerId/payments` — requireAuth.
- POST `/api/payments` — requireAuth.
- POST `/api/transactions` — requireAuth.
- GET `/api/transactions` — requireAuth.
- GET `/api/transactions/:id` — requireAuth.
- POST `/api/receipts/email` — requireAuth.

## Packages
- GET `/api/packages` — requireAuth.
- GET `/api/packages/:id` — requireAuth.
- POST `/api/packages` — requireAdminOrSuperAdmin.
- PUT `/api/packages/:id` — requireAdminOrSuperAdmin.
- DELETE `/api/packages/:id` — requireAdminOrSuperAdmin.
- POST `/api/packages/:id/assign` — requireAuth; assign to customer.

## Coupons
- GET `/api/coupons` — requireAuth.
- GET `/api/coupons/:id` — requireAuth.
- POST `/api/coupons` — requireAuth.
- PUT `/api/coupons/:id` — requireAuth.
- DELETE `/api/coupons/:id` — requireAuth.
- POST `/api/coupons/validate` — public; validate coupon for a given cart.

## Delivery
- POST `/api/delivery-orders` — create delivery request (customer flow entrypoint).
- GET `/api/delivery-order-requests` — requireAuth; list requests to review/accept.
- PATCH `/api/delivery-order-requests/:id/accept` — requireAuth; accept a request.
- GET `/api/delivery-orders` — requireAuth; list/manage delivery orders.
- PATCH `/api/delivery-orders/:id/status` — requireAuth; update delivery order state.
- GET `/api/drivers` — requireAuth; list/lookup drivers.
- GET `/api/qr/:code` — public; resolve branch QR.

## Reporting and Analytics
- GET `/api/report/summary` — requireAuth; POS dashboard summary.
- GET `/api/report/summary/stream` — requireAuth; server-sent progressing summary.
- GET `/api/reports/orders` — requireAdminOrSuperAdmin.
- GET `/api/reports/top-services` — requireAdminOrSuperAdmin.
- GET `/api/reports/top-products` — requireAdminOrSuperAdmin.
- GET `/api/reports/clothing-items` — requireAdminOrSuperAdmin.
- GET `/api/reports/expenses` — requireAdminOrSuperAdmin.
- GET `/api/reports/global-stats` — requireSuperAdmin.
- GET `/api/reports/branch-performance` — requireSuperAdmin.
- GET `/api/reports/revenue-trends` — requireSuperAdmin.
- GET `/api/reports/service-analytics` — requireSuperAdmin.

## Expenses
- GET `/api/expenses` — requireAdminOrSuperAdmin.
- POST `/api/expenses` — requireAdminOrSuperAdmin.
- PUT `/api/expenses/:id` — requireAdminOrSuperAdmin.
- DELETE `/api/expenses/:id` — requireAdminOrSuperAdmin.
- DELETE `/api/expenses` — requireAdminOrSuperAdmin (bulk).
- GET `/api/expenses/export` — requireAdminOrSuperAdmin.
- GET `/api/expenses/export.xlsx` — requireAdminOrSuperAdmin.

## Security Settings
- GET `/api/security-settings` — requireAdminOrSuperAdmin.
- PUT `/api/security-settings` — requireAdminOrSuperAdmin.

## Misc
- POST `/api/admin/backfill-bilingual` — requireAdminOrSuperAdmin; backfill bilingual names.
- GET `/api/cities` — public; list cities/governorates.
- POST `/api/chatbot` — development helper for chat; not security-sensitive.

## WebSockets
- `GET ws://<host>/ws/delivery-orders`
- Server broadcasts JSON messages:
- `{ "orderId": string, "deliveryStatus": string | null, "driverId": string | null }`
- `GET ws://<host>/ws/driver-location`
- On connection: server sends latest known locations for all drivers.
- Clients can send: `{ "driverId": string, "lat": number, "lng": number }` to update a driver location (authorized per deployment policy; see routes).
- Server broadcasts the same shape for every update.

## Error Handling
- JSON body with `message` on errors; 400 for validation, 401/403 for auth/role, 404 for not found, 500 for server errors.

## Quick Start Flows

Admin POS
1) POST `/api/login` → set `sid` cookie
2) GET `/api/auth/user` → confirm role and branch
3) POST `/api/orders` → create order (server computes totals and package credits)
4) POST `/api/payments` → record payment (optional)
5) PATCH `/api/orders/:id/status` → progress order lifecycle

Customer Delivery
1) POST `/customer/login` (or `/customer/register`)
2) POST `/api/delivery-orders` → create delivery request
3) Connect to WS `/ws/delivery-orders` → receive status updates
4) Optionally track driver via WS `/ws/driver-location`
