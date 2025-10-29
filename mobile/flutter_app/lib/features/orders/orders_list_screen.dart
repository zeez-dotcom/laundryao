import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/orders_provider.dart';
import 'order_receipt_screen.dart';

class OrdersListScreen extends ConsumerWidget {
  const OrdersListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncOrders = ref.watch(ordersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Orders')),
      body: asyncOrders.when(
        data: (orders) => orders.isEmpty
            ? const Center(child: Text('No orders'))
            : ListView.separated(
                itemBuilder: (_, idx) {
                  final o = orders[idx];
                  return ListTile(
                    title: Text('#${o.orderNumber} • ${o.status}'),
                    subtitle: Text(o.createdAt.toLocal().toString()),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => OrderReceiptScreen(orderId: o.id)),
                    ),
                  );
                },
                separatorBuilder: (_, __) => const Divider(),
                itemCount: orders.length,
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('Failed to load: $e')),
      ),
    );
  }
}
