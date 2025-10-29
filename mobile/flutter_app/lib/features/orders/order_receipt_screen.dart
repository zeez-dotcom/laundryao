import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../api/dio_client.dart';

class OrderReceiptScreen extends StatefulWidget {
  final String orderId;
  const OrderReceiptScreen({super.key, required this.orderId});
  @override
  State<OrderReceiptScreen> createState() => _OrderReceiptScreenState();
}

class _OrderReceiptScreenState extends State<OrderReceiptScreen> {
  final Dio _dio = ApiClient().dio;
  Map<String, dynamic>? _receipt;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await _dio.get('/customer/orders/${widget.orderId}/receipt');
      if ((res.statusCode ?? 500) >= 400) throw Exception('Failed');
      setState(() { _receipt = res.data as Map<String, dynamic>; });
    } catch (e) {
      setState(() { _error = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return Scaffold(appBar: AppBar(title: const Text('Receipt')), body: Center(child: Text(_error!)));
    final r = _receipt;
    return Scaffold(
      appBar: AppBar(
        leading: Navigator.of(context).canPop() ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()) : null,
        title: const Text('Receipt'),
      ),
      body: r == null
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Order #${r['orderNumber'] ?? ''}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (r['items'] is List)
                  Expanded(
                    child: ListView.separated(
                      itemBuilder: (_, idx) {
                        final it = (r['items'] as List)[idx] as Map<String, dynamic>;
                        return ListTile(
                          title: Text('${it['clothingItemName'] ?? it['name'] ?? 'Item'}'),
                          subtitle: Text('${it['serviceName'] ?? ''} x${it['quantity']}'),
                          trailing: Text('KD ${it['total'] ?? it['price'] ?? ''}'),
                        );
                      },
                      separatorBuilder: (_, __) => const Divider(),
                      itemCount: (r['items'] as List).length,
                    ),
                  ),
                const SizedBox(height: 8),
                Text('Subtotal: KD ${r['subtotal'] ?? ''}'),
                Text('Tax: KD ${r['tax'] ?? ''}'),
                Text('Total: KD ${r['total'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold)),
              ]),
            ),
    );
  }
}
