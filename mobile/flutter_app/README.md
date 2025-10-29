Flutter Client Skeleton

Overview
- This folder contains a minimal Flutter app skeleton targeting the REST + WebSocket API exposed by the server.

Suggested Stack
- State: Riverpod
- HTTP: dio
- WS: web_socket_channel
- Storage: hive
- i18n: easy_localization

Structure
- lib/
  - main.dart (GoRouter routes for Customer + Staff)
  - api/
    - dio_client.dart
    - auth_api.dart
    - orders_api.dart
    - deliveries_api.dart
    - addresses_api.dart
  - models/
    - customer.dart
    - order_summary.dart
    - delivery_summary.dart
  - features/
    - auth/login_screen.dart
    - customer/customer_home.dart
    - dashboard/dashboard_screen.dart
    - orders/orders_list_screen.dart
    - deliveries/deliveries_list_screen.dart
    - ordering/order_flow_screen.dart
    - chat/customer_chat_screen.dart
    - chat/chat_service.dart
    - staff/staff_login_screen.dart
    - staff/staff_home.dart
    - staff/staff_dashboard_screen.dart
    - staff/staff_chat_screen.dart
    - payments/customer_payments_screen.dart
    - payments/staff_record_payment_screen.dart
    - settings/settings_screen.dart

Getting Started
1. flutter pub get
2. Run: flutter run --dart-define=API_BASE_URL=https://your-api-host
3. Open Settings → set API Base URL and Branch Code (if not using dart-define)
4. Log in as customer or staff

Routes
- /landing → entry screen (links to Customer/Staff/Settings)
- /settings → configure API base URL + branch code
- /login → customer login
- /dashboard → CustomerHome tabs (Dashboard, Orders, Deliveries, Chat, Settings)
- /new-order → customer ordering flow
- /payments → customer payments history
- /chat → customer chat
- /staff-login → staff login
- /staff → StaffHome tabs (Dashboard, Chat, Record Payment, Settings)
- /staff-chat → staff chat
- /record-payment → staff record payment
