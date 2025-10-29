import 'package:flutter/material.dart';
import '../../api/payments_api.dart';
import '../../api/auth_api.dart';
import 'package:intl/intl.dart';

class CustomerPaymentsScreen extends StatefulWidget {
  const CustomerPaymentsScreen({super.key});
  @override
  State<CustomerPaymentsScreen> createState() => _CustomerPaymentsScreenState();
}

class _CustomerPaymentsScreenState extends State<CustomerPaymentsScreen> {
  late Future<List<Map<String, dynamic>>> _payments;

  @override
  void initState() {
    super.initState();
    _payments = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final me = await AuthApi().me();
    return PaymentsApi().history(me.id);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payments History')),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _payments,
        builder: (context, snap) {
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final list = snap.data!;
          if (list.isEmpty) return const Center(child: Text('No payments'));
          return ListView.separated(
            itemBuilder: (context, idx) {
              final p = list[idx];
              final when = DateTime.tryParse('${p['createdAt']}') ?? DateTime.now();
              return ListTile(
                title: Text('KD ${p['amount']} • ${p['paymentMethod']}'),
                subtitle: Text(DateFormat('MMM d, y h:mm a').format(when)),
              );
            },
            separatorBuilder: (_, __) => const Divider(),
            itemCount: list.length,
          );
        },
      ),
    );
  }
}

