import 'package:flutter/material.dart';
import 'staff_dashboard_screen.dart';
import '../staff/staff_chat_screen.dart';
import '../payments/staff_record_payment_screen.dart';
import '../settings/settings_screen.dart';
import '../../config/config.dart';

class StaffHome extends StatefulWidget {
  const StaffHome({super.key});
  @override
  State<StaffHome> createState() => _StaffHomeState();
}

class _StaffHomeState extends State<StaffHome> {
  int _index = 0;
  @override
  Widget build(BuildContext context) {
    final cfg = AppConfig();
    final tabs = <Widget>[
      const StaffDashboardScreen(),
      StaffChatScreen(baseWsUrl: cfg.wsBaseUrl, branchCode: cfg.branchCode),
      const StaffRecordPaymentScreen(),
      const SettingsScreen(),
    ];
    return Scaffold(
      body: tabs[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'Chat'),
          NavigationDestination(icon: Icon(Icons.payments_outlined), label: 'Payments'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
        ],
      ),
    );
  }
}

