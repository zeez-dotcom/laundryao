import 'package:flutter/material.dart';

class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Laundry Mobile')),
      body: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          ElevatedButton(onPressed: () => Navigator.of(context).pushReplacementNamed('/login'), child: const Text('Customer')),
          const SizedBox(height: 8),
          ElevatedButton(onPressed: () => Navigator.of(context).pushReplacementNamed('/staff-login'), child: const Text('Staff')),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: () => Navigator.of(context).pushNamed('/settings'), child: const Text('Settings')),
        ]),
      ),
    );
  }
}

