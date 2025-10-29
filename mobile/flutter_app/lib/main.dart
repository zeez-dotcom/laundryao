import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'features/auth/login_screen.dart';
import 'features/customer/customer_home.dart';
import 'features/staff/staff_login_screen.dart';
import 'features/staff/staff_home.dart';
import 'features/settings/settings_screen.dart';
import 'features/chat/customer_chat_screen.dart';
import 'features/staff/staff_chat_screen.dart';
import 'features/ordering/order_flow_screen.dart';
import 'features/payments/customer_payments_screen.dart';
import 'features/payments/staff_record_payment_screen.dart';
import 'config/config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'features/landing/landing_screen.dart';

void main() { runApp(const ProviderScope(child: MyApp())); }

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    final router = GoRouter(initialLocation: '/landing', routes: [
      GoRoute(path: '/landing', builder: (_, __) => const LandingScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/dashboard', builder: (_, __) => const CustomerHome()),
      GoRoute(path: '/staff-login', builder: (_, __) => const StaffLoginScreen()),
      GoRoute(path: '/staff', builder: (_, __) => const StaffHome()),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(path: '/chat', builder: (ctx, __) {
        final cfg = AppConfig();
        return CustomerChatScreen(baseWsUrl: cfg.wsBaseUrl, branchCode: cfg.branchCode);
      }),
      GoRoute(path: '/staff-chat', builder: (ctx, __) {
        final cfg = AppConfig();
        return StaffChatScreen(baseWsUrl: cfg.wsBaseUrl, branchCode: cfg.branchCode);
      }),
      GoRoute(path: '/new-order', builder: (ctx, __) {
        final cfg = AppConfig();
        return OrderFlowScreen(branchCode: cfg.branchCode);
      }),
      GoRoute(path: '/payments', builder: (_, __) => const CustomerPaymentsScreen()),
      GoRoute(path: '/record-payment', builder: (_, __) => const StaffRecordPaymentScreen()),
    ]);

    return MaterialApp.router(
      title: 'Laundry Mobile',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.blue),
      routerConfig: router,
    );
  }
}
