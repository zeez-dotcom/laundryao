import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:intl/intl.dart';

class StaffChatScreen extends StatefulWidget {
  final String baseWsUrl;
  final String branchCode;
  const StaffChatScreen({super.key, required this.baseWsUrl, required this.branchCode});

  @override
  State<StaffChatScreen> createState() => _StaffChatScreenState();
}

class _StaffChatScreenState extends State<StaffChatScreen> {
  WebSocketChannel? _ch;
  StreamSubscription? _sub;
  String? _selectedCid;
  final Map<String, List<Map<String, dynamic>>> _threads = {};
  final _input = TextEditingController();

  @override
  void initState() {
    super.initState();
    final uri = Uri.parse('${widget.baseWsUrl}/ws/customer-chat?branchCode=${Uri.encodeComponent(widget.branchCode)}');
    _ch = WebSocketChannel.connect(uri);
    _sub = _ch!.stream.listen((msg) {
      try {
        final data = jsonDecode(msg as String) as Map<String, dynamic>;
        if (data['eventType'] == 'chat:message') {
          final cid = (data['customerId'] ?? '__anon__') as String;
          setState(() { (_threads[cid] ??= []).add(data); _selectedCid ??= cid; });
        } else if (data['eventType'] == 'chat:presence' && data['actorType'] == 'customer') {
          final cid = (data['customerId'] ?? '__anon__') as String;
          setState(() { _threads.putIfAbsent(cid, () => []); _selectedCid ??= cid; });
        }
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _ch?.sink.close();
    super.dispose();
  }

  void _send() {
    final text = _input.text.trim();
    final cid = _selectedCid;
    if (text.isEmpty || cid == null) return;
    _ch?.sink.add(jsonEncode({ 'type': 'chat', 'text': text, 'customerId': cid == '__anon__' ? null : cid }));
    _input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final customers = _threads.keys.toList();
    final messages = _selectedCid != null ? (_threads[_selectedCid] ?? []) : [];
    return Scaffold(
      appBar: AppBar(title: const Text('Staff Chat')),
      body: Row(
        children: [
          Container(
            width: 220,
            decoration: const BoxDecoration(border: Border(right: BorderSide(color: Colors.black12))),
            child: ListView.builder(
              itemCount: customers.length,
              itemBuilder: (context, idx) {
                final cid = customers[idx];
                return ListTile(
                  selected: cid == _selectedCid,
                  title: Text(cid),
                  onTap: () => setState(() { _selectedCid = cid; }),
                );
              },
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Expanded(
                  child: ListView.builder(
                    itemCount: messages.length,
                    itemBuilder: (context, idx) {
                      final m = messages[idx];
                      final isStaff = m['sender'] == 'staff';
                      return Align(
                        alignment: isStaff ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isStaff ? Colors.blue.shade100 : Colors.grey.shade200,
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
                  child: Row(children: [
                    Expanded(child: TextField(controller: _input, decoration: const InputDecoration(hintText: 'Type a message…'), onSubmitted: (_) => _send())),
                    IconButton(onPressed: _send, icon: const Icon(Icons.send))
                  ]),
                )
              ],
            ),
          )
        ],
      ),
    );
  }
}
