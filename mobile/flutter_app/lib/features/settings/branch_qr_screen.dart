import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../config/config.dart';

class BranchQrScreen extends StatefulWidget {
  const BranchQrScreen({super.key});
  @override
  State<BranchQrScreen> createState() => _BranchQrScreenState();
}

class _BranchQrScreenState extends State<BranchQrScreen> {
  bool _handled = false;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Branch QR')),
      body: MobileScanner(onDetect: (capture) async {
        if (_handled) return;
        final codes = capture.barcodes;
        if (codes.isEmpty) return;
        final val = codes.first.rawValue;
        if (val == null || val.isEmpty) return;
        _handled = true;
        // Accept either direct branch code or URL containing branch code param
        String code = val;
        try {
          final uri = Uri.parse(val);
          final qp = uri.queryParameters['branchCode'];
          code = qp ?? (uri.pathSegments.isNotEmpty ? uri.pathSegments.last : val);
        } catch (_) {}
        await AppConfig().setBranchCode(code);
        if (!mounted) return;
        Navigator.of(context).pop(code);
      }),
    );
  }
}
