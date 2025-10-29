import 'package:flutter/material.dart';
import '../../api/orders_api.dart';
import '../../api/deliveries_api.dart';
import '../../models/order_summary.dart';
import '../../models/delivery_summary.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<List<OrderSummary>> _orders;
  late Future<List<DeliverySummary>> _deliveries;

  @override
  void initState() {
    super.initState();
    _orders = OrdersApi().listCustomerOrders();
    _deliveries = DeliveriesApi().listCustomerDeliveries();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Customer Dashboard')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Your Orders', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          FutureBuilder<List<OrderSummary>>(
            future: _orders,
            builder: (context, snap) {
              if (!snap.hasData) return const Center(child: CircularProgressIndicator());
              final list = snap.data!;
              if (list.isEmpty) return const Text('No orders');
              return Column(children: list.map((o) => ListTile(
                title: Text('#${o.orderNumber} • ${o.status}'),
                subtitle: Text(o.createdAt.toLocal().toString()),
                trailing: Text('KD ${o.subtotal.toStringAsFixed(2)}'),
              )).toList());
            },
          ),
          const SizedBox(height: 24),
          const Text('My Deliveries', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          FutureBuilder<List<DeliverySummary>>(
            future: _deliveries,
            builder: (context, snap) {
              if (!snap.hasData) return const Center(child: CircularProgressIndicator());
              final list = snap.data!;
              if (list.isEmpty) return const Text('No deliveries');
              return Column(children: list.map((d) => ListTile(
                title: Text('Delivery #${d.orderNumber} • ${d.deliveryStatus}'),
                subtitle: Text(d.createdAt.toLocal().toString()),
              )).toList());
            },
          ),
          const SizedBox(height: 24),
          ElevatedButton(onPressed: () {}, child: const Text('New Delivery Request')),
        ],
      ),
    );
  }
}

