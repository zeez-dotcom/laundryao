import 'package:flutter/material.dart';
import '../../config/config.dart';
import 'branch_qr_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _baseUrl = TextEditingController();
  final _branchCode = TextEditingController();
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    final cfg = AppConfig();
    cfg.load().then((_) {
      setState(() {
        _baseUrl.text = cfg.baseUrl;
        _branchCode.text = cfg.branchCode;
        _loaded = true;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: Navigator.of(context).canPop() ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()) : null,
        title: const Text('Settings'),
      ),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('API Base URL'),
                  TextField(controller: _baseUrl, decoration: const InputDecoration(hintText: 'https://your-api-host')),
                  const SizedBox(height: 12),
                  const Text('Branch Code'),
                  TextField(controller: _branchCode, decoration: const InputDecoration(hintText: 'e.g., KWT')),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: () async {
                      final code = await Navigator.of(context).push<String>(
                        MaterialPageRoute(builder: (_) => const BranchQrScreen()),
                      );
                      if (code != null && code.isNotEmpty) {
                        setState(() { _branchCode.text = code; });
                      }
                    },
                    child: const Text('Scan Branch QR'),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () async {
                      await AppConfig().setBaseUrl(_baseUrl.text);
                      await AppConfig().setBranchCode(_branchCode.text);
                      if (!mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
                    },
                    child: const Text('Save'),
                  ),
                ],
              ),
            ),
    );
  }
}
