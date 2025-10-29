import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/deliveries_provider.dart';

class DeliveriesListScreen extends ConsumerWidget {
  const DeliveriesListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncDeliveries = ref.watch(deliveriesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Deliveries')),
      body: asyncDeliveries.when(
        data: (list) => list.isEmpty
            ? const Center(child: Text('No deliveries'))
            : ListView.separated(
                itemBuilder: (_, idx) {
                  final d = list[idx];
                  return ListTile(
                    title: Text('Delivery #${d.orderNumber} • ${d.deliveryStatus}'),
                    subtitle: Text(d.createdAt.toLocal().toString()),
                  );
                },
                separatorBuilder: (_, __) => const Divider(),
                itemCount: list.length,
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('Failed to load: $e')),
      ),
    );
  }
}

