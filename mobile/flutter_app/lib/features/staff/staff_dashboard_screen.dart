import 'package:flutter/material.dart';
import '../../api/staff_deliveries_api.dart';

class StaffDashboardScreen extends StatefulWidget {
  const StaffDashboardScreen({super.key});
  @override
  State<StaffDashboardScreen> createState() => _StaffDashboardScreenState();
}

class _StaffDashboardScreenState extends State<StaffDashboardScreen> {
  late Future<List<Map<String, dynamic>>> _deliveries;

  @override
  void initState() {
    super.initState();
    _deliveries = StaffDeliveriesApi().listDeliveries();
  }

  Future<void> _advance(Map<String, dynamic> d) async {
    // naive advance: if ready → out_for_delivery else -> ready
    final current = '${d['status'] ?? d['deliveryStatus'] ?? ''}';
    String next = 'ready';
    if (current == 'ready') next = 'out_for_delivery';
    await StaffDeliveriesApi().updateStatus('${d['orderId'] ?? d['id']}', next);
    if (!mounted) return;
    setState(() { _deliveries = StaffDeliveriesApi().listDeliveries(); });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Staff Dashboard')),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _deliveries,
        builder: (context, snap) {
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final list = snap.data!;
          if (list.isEmpty) return const Center(child: Text('No deliveries'));
          return ListView.separated(
            itemCount: list.length,
            separatorBuilder: (_, __) => const Divider(),
            itemBuilder: (context, idx) {
              final d = list[idx];
              return ListTile(
                title: Text('#${d['orderNumber'] ?? d['orderId'] ?? ''} • ${d['deliveryStatus'] ?? d['status'] ?? ''}'),
                subtitle: Text('${d['customerName'] ?? ''}'),
                trailing: ElevatedButton(onPressed: () => _advance(d), child: const Text('Advance')),
              );
            },
          );
        },
      ),
    );
  }
}

