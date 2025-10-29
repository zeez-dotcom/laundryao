import 'package:flutter/material.dart';
import '../dashboard/dashboard_screen.dart';
import '../orders/orders_list_screen.dart';
import '../deliveries/deliveries_list_screen.dart';
import '../chat/customer_chat_screen.dart';
import '../settings/settings_screen.dart';
import '../../config/config.dart';

class CustomerHome extends StatefulWidget {
  const CustomerHome({super.key});
  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final cfg = AppConfig();
    final tabs = <Widget>[
      const DashboardScreen(),
      const OrdersListScreen(),
      const DeliveriesListScreen(),
      CustomerChatScreen(baseWsUrl: cfg.wsBaseUrl, branchCode: cfg.branchCode),
      const SettingsScreen(),
    ];
    return Scaffold(
      body: tabs[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.local_shipping_outlined), label: 'Deliveries'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'Chat'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
        ],
      ),
    );
  }
}

