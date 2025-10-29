import 'package:flutter/material.dart';
import '../../api/auth_api.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _pinController = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      await AuthApi().customerLogin(_phoneController.text.trim(), _pinController.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed('/dashboard');
    } catch (e) {
      setState(() { _error = '$e'; });
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Customer Login')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(controller: _phoneController, decoration: const InputDecoration(labelText: 'Phone Number')), 
            TextField(controller: _pinController, decoration: const InputDecoration(labelText: 'PIN'), obscureText: true),
            const SizedBox(height: 16),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _loading ? null : _login, child: _loading ? const CircularProgressIndicator() : const Text('Login')),
            const SizedBox(height: 8),
            TextButton(onPressed: () => Navigator.of(context).pushReplacementNamed('/staff-login'), child: const Text('I am staff')),
          ],
        ),
      ),
    );
  }
}

