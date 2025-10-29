import 'package:flutter/material.dart';
import '../../api/auth_api.dart';
import 'package:go_router/go_router.dart';

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
      // go_router navigation
      context.go('/dashboard');
    } catch (e) {
      setState(() { _error = '$e'; });
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: Navigator.of(context).canPop() ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()) : null,
        title: const Text('Customer Login'),
      ),
      body: Center(
        child: Card(
          elevation: 2,
          margin: const EdgeInsets.all(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(controller: _phoneController, decoration: const InputDecoration(labelText: 'Phone Number', border: OutlineInputBorder())), 
                  const SizedBox(height: 12),
                  TextField(controller: _pinController, decoration: const InputDecoration(labelText: 'PIN', border: OutlineInputBorder()), obscureText: true),
                  const SizedBox(height: 12),
                  if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 12),
                  ElevatedButton(onPressed: _loading ? null : _login, child: _loading ? const SizedBox(height:18,width:18,child: CircularProgressIndicator(strokeWidth:2)) : const Text('Login')),
                  const SizedBox(height: 8),
                  TextButton(onPressed: () => context.go('/staff-login'), child: const Text('I am staff')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
