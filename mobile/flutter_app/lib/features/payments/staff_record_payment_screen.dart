import 'package:flutter/material.dart';
import '../../api/payments_api.dart';
import '../../api/dio_client.dart';

class StaffRecordPaymentScreen extends StatefulWidget {
  const StaffRecordPaymentScreen({super.key});
  @override
  State<StaffRecordPaymentScreen> createState() => _StaffRecordPaymentScreenState();
}

class _StaffRecordPaymentScreenState extends State<StaffRecordPaymentScreen> {
  final _phone = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  String _method = 'cash';
  String? _customerId;
  bool _loading = false;

  Future<void> _lookup() async {
    setState(() { _loading = true; });
    try {
      final res = await ApiClient().dio.get('/api/customers/phone/${_phone.text.trim()}');
      if ((res.statusCode ?? 500) >= 400 || res.data == null) throw Exception('Not found');
      setState(() { _customerId = res.data['id'] as String; });
    } catch (e) {
      if (!mounted) return; ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Lookup failed: $e')));
    } finally { setState(() { _loading = false; }); }
  }

  Future<void> _record() async {
    if (_customerId == null) return;
    try {
      await PaymentsApi().record(_customerId!, amount: _amount.text.trim(), paymentMethod: _method, notes: _notes.text.trim().isEmpty ? null : _notes.text.trim());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment recorded')));
      setState(() { _phone.clear(); _amount.clear(); _notes.clear(); _customerId = null; });
    } catch (e) {
      if (!mounted) return; ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: Navigator.of(context).canPop() ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()) : null,
        title: const Text('Record Payment'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Customer phone number'),
          TextField(controller: _phone, keyboardType: TextInputType.phone),
          const SizedBox(height: 8),
          ElevatedButton(onPressed: _loading ? null : _lookup, child: const Text('Find customer')),
          const Divider(height: 24),
          Text('Customer ID: ${_customerId ?? '-'}'),
          const SizedBox(height: 8),
          const Text('Amount (KD)'),
          TextField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true)),
          const SizedBox(height: 8),
          const Text('Payment method'),
          DropdownButton<String>(value: _method, items: const [
            DropdownMenuItem(value: 'cash', child: Text('Cash')),
            DropdownMenuItem(value: 'card', child: Text('Card')),
            DropdownMenuItem(value: 'knet', child: Text('KNET')),
          ], onChanged: (v) => setState(() { _method = v ?? 'cash'; })),
          const SizedBox(height: 8),
          const Text('Notes'),
          TextField(controller: _notes),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: _customerId == null || _amount.text.trim().isEmpty ? null : _record, child: const Text('Record Payment'))
        ]),
      ),
    );
  }
}
