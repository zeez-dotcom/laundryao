import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../api/dio_client.dart';
import '../../api/addresses_api.dart';
import '../../api/auth_api.dart';

class OrderFlowScreen extends StatefulWidget {
  final String branchCode;
  const OrderFlowScreen({super.key, required this.branchCode});
  @override
  State<OrderFlowScreen> createState() => _OrderFlowScreenState();
}

class _OrderFlowScreenState extends State<OrderFlowScreen> {
  final Dio _dio = ApiClient().dio;
  final List<Map<String, dynamic>> _items = [];
  final List<Map<String, dynamic>> _cart = [];
  List<Map<String, dynamic>> _addresses = [];
  String? _selectedAddressId;
  String _paymentMethod = 'cash';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      // Fetch clothing items for branch
      final itemsRes = await _dio.get('/api/clothing-items', queryParameters: { 'branchCode': widget.branchCode });
      final list = (itemsRes.data as List).cast<Map<String, dynamic>>();
      _items.clear();
      _items.addAll(list);
      // Fetch addresses
      _addresses = await AddressesApi().list();
      if (_addresses.isNotEmpty) _selectedAddressId = _addresses.first['id'] as String;
    } catch (e) {
      _error = '$e';
    } finally {
      setState(() { _loading = false; });
    }
  }

  Future<void> _addToCart(Map<String, dynamic> item) async {
    final id = item['id'];
    final res = await _dio.get('/api/clothing-items/$id/services', queryParameters: { 'branchCode': widget.branchCode });
    final services = (res.data as List).cast<Map<String, dynamic>>();
    if (!mounted || services.isEmpty) return;
    Map<String, dynamic>? selected;
    int qty = 1;
    await showModalBottomSheet(context: context, builder: (ctx) {
      return StatefulBuilder(builder: (context, setModalState) {
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Select service for ${item['name'] ?? 'Item'}', style: const TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              ...services.map((s) => RadioListTile<Map<String, dynamic>>(
                    title: Text('${s['name'] ?? 'Service'}'),
                    subtitle: Text('KD ${s['itemPrice'] ?? s['price'] ?? ''}'),
                    value: s,
                    groupValue: selected,
                    onChanged: (v) => setModalState(() => selected = v),
                  )),
              const SizedBox(height: 8),
              Row(children: [
                const Text('Qty: '),
                IconButton(onPressed: () => setModalState(() { if (qty > 1) qty--; }), icon: const Icon(Icons.remove_circle_outline)),
                Text('$qty'),
                IconButton(onPressed: () => setModalState(() { qty++; }), icon: const Icon(Icons.add_circle_outline)),
                const Spacer(),
                ElevatedButton(onPressed: selected == null ? null : () { Navigator.of(context).pop(); }, child: const Text('Add'))
              ])
            ],
          ),
        );
      });
    });
    if (selected != null) {
      _cart.add({ 'clothingItemId': id, 'serviceId': selected!['id'], 'quantity': qty });
      setState(() {});
    }
  }

  Future<void> _placeOrder() async {
    try {
      final me = await AuthApi().me();
      final payload = {
        'customerId': me.id,
        'branchCode': widget.branchCode,
        'items': _cart,
        'deliveryAddressId': _selectedAddressId,
        'paymentMethod': _paymentMethod,
      };
      final res = await _dio.post('/api/delivery-orders', data: payload);
      if ((res.statusCode ?? 500) >= 400) throw Exception(jsonEncode(res.data));
      if (!mounted) return;
      showDialog(context: context, builder: (_) => AlertDialog(title: const Text('Order placed'), content: Text('Order #${res.data['orderNumber']}'), actions: [ TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK')) ]));
    } catch (e) {
      if (!mounted) return;
      showDialog(context: context, builder: (_) => AlertDialog(title: const Text('Failed'), content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_error != null) return Scaffold(appBar: AppBar(title: const Text('Order')), body: Center(child: Text(_error!)));
    return Scaffold(
      appBar: AppBar(title: const Text('New Delivery Request')),
      body: Column(children: [
        Expanded(child: ListView.builder(
          itemCount: _items.length,
          itemBuilder: (context, idx) {
            final it = _items[idx];
            return ListTile(
              title: Text('${it['name'] ?? 'Item'}'),
              subtitle: Text('${it['description'] ?? ''}'),
              trailing: IconButton(onPressed: () => _addToCart(it), icon: const Icon(Icons.add)),
            );
          },
        )),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: Colors.black12))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Cart', style: TextStyle(fontWeight: FontWeight.bold)),
            if (_cart.isEmpty) const Text('No items') else Wrap(spacing: 8, children: _cart.map((e) => Chip(label: Text('${e['clothingItemId']} x${e['quantity']}'))).toList()),
            const SizedBox(height: 8),
            const Text('Delivery Address', style: TextStyle(fontWeight: FontWeight.bold)),
            DropdownButton<String>(value: _selectedAddressId, items: _addresses.map((a) => DropdownMenuItem(value: a['id'] as String, child: Text('${a['label']}'))).toList(), onChanged: (v) => setState(() { _selectedAddressId = v; })),
            const SizedBox(height: 8),
            const Text('Payment Method', style: TextStyle(fontWeight: FontWeight.bold)),
            DropdownButton<String>(value: _paymentMethod, items: const [
              DropdownMenuItem(value: 'cash', child: Text('Cash on delivery')),
              DropdownMenuItem(value: 'knet', child: Text('KNET')),
              DropdownMenuItem(value: 'pay_later', child: Text('Pay later')),
            ], onChanged: (v) => setState(() { _paymentMethod = v ?? 'cash'; })),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: ElevatedButton(onPressed: _cart.isEmpty ? null : _placeOrder, child: const Text('Place Order')))
            ])
          ]),
        )
      ]),
    );
  }
}
