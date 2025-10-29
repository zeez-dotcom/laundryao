import 'dart:async';
import 'package:flutter/material.dart';
import 'chat_service.dart';
import 'package:intl/intl.dart';

class CustomerChatScreen extends StatefulWidget {
  final String baseWsUrl;
  final String branchCode;
  const CustomerChatScreen({super.key, required this.baseWsUrl, required this.branchCode});

  @override
  State<CustomerChatScreen> createState() => _CustomerChatScreenState();
}

class _CustomerChatScreenState extends State<CustomerChatScreen> {
  late final ChatService _service;
  final _controller = TextEditingController();
  final _messages = <Map<String, dynamic>>[];
  StreamSubscription<Map<String, dynamic>>? _sub;

  @override
  void initState() {
    super.initState();
    _service = ChatService(baseWsUrl: widget.baseWsUrl, branchCode: widget.branchCode);
    _sub = _service.connect().listen((event) {
      if ((event['eventType'] as String?) == 'chat:message') {
        setState(() { _messages.add(event); });
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _service.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _service.send(text);
    setState(() { _messages.add({ 'sender': 'customer', 'text': text, 'timestamp': DateTime.now().toIso8601String() }); });
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: Navigator.of(context).canPop() ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()) : null,
        title: const Text('Chat with cashier'),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              reverse: false,
              itemCount: _messages.length,
              itemBuilder: (context, idx) {
                final m = _messages[idx];
                final isMe = m['sender'] == 'customer';
                return Align(
                  alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isMe ? Colors.blue.shade100 : Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${m['text']}'),
                        const SizedBox(height:4),
                        Text(DateFormat('MMM d, h:mm a').format(DateTime.tryParse('${m['timestamp']}') ?? DateTime.now()), style: const TextStyle(fontSize: 11, color: Colors.black54))
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              children: [
                Expanded(child: TextField(controller: _controller, decoration: const InputDecoration(hintText: 'Type a message…'))),
                IconButton(onPressed: _send, icon: const Icon(Icons.send))
              ],
            ),
          )
        ],
      ),
    );
  }
}
