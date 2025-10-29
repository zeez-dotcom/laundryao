import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Laundry Mobile')),
      body: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          ElevatedButton(onPressed: () => context.go('/login'), child: const Text('Customer')),
          const SizedBox(height: 8),
          ElevatedButton(onPressed: () => context.go('/staff-login'), child: const Text('Staff')),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: () => context.push('/settings'), child: const Text('Settings')),
        ]),
      ),
    );
  }
}
