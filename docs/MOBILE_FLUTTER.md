Flutter Mobile App — Overview and Developer Guide

Scopes Covered
- Customer app: login, dashboard (orders + deliveries), ordering flow, chat, payments history, settings.
- Staff app: login, deliveries dashboard (update status), staff chat, record payment, settings.

Repo Layout
- mobile/flutter_app/
  - lib/
    - api/: REST clients (Dio + cookies)
    - models/: DTOs (customer, order, delivery)
    - config/: runtime API/branch settings
    - features/
      - auth/: customer + staff logins
      - customer/: tabbed shell (home)
      - dashboard/, orders/, deliveries/: customer views
      - ordering/: order flow (select items → service → qty → address → payment → place)
      - chat/: customer chat + WS service
      - staff/: staff dashboard, chat, record payments, tabbed shell
      - payments/: customer history, staff record
      - settings/: runtime settings, QR scan (branch)
    - providers/: Riverpod providers for orders/deliveries
  - pubspec.yaml: dio, cookie_jar, go_router, riverpod, ws, intl, shared_preferences, mobile_scanner

Server Endpoints Mapped
- Auth (customer): POST /customer/login, GET /customer/me
- Auth (staff): POST /auth/login, /auth/logout
- Orders: GET /customer/orders, GET /customer/orders/:id/receipt
- Deliveries: GET /customer/deliveries
- Ordering: POST /api/delivery-orders (requires session); public items/services via
  - GET /api/clothing-items?branchCode=CODE
  - GET /api/clothing-items/:id/services?branchCode=CODE
- Addresses: GET/POST /customer/addresses
- Payments: GET /api/customers/:id/payments, POST /api/customers/:id/payments
- Chat (WS): /ws/customer-chat?branchCode=CODE (JSON: send {type:'chat', text})

Runtime Config
- Settings screen stores API base URL and branch code.
- AppConfig (ChangeNotifier) persists with shared_preferences.
- Dio baseUrl updates live from AppConfig; WS URLs derive from http(s) → ws(s).

Routes (go_router)
- /landing (entry)
- /settings
- /login → /dashboard (customer)
- /dashboard → CustomerHome tabs
- /new-order (customer)
- /payments (customer)
- /chat (customer)
- /staff-login → /staff (staff)
- /staff → StaffHome tabs
- /staff-chat (staff)
- /record-payment (staff)

How to Run
1) cd mobile/flutter_app
2) flutter pub get
3) flutter run --dart-define=API_BASE_URL=https://your-api-host
   - or set base URL in the app via Settings → API Base URL
4) Set Branch Code (Settings) or scan branch QR (if enabled).

Continue Development
- Add Riverpod providers for auth and config app-wide (currently used for data lists).
- Improve ordering UI: show prices per line, running totals, tax breakdown, service picker by category.
- Add push notifications (FCM) for ready/delivery updates.
- Add deep links from OS notifications to tracking and receipts.

