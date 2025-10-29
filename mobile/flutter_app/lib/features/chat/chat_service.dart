import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class ChatService {
  final String baseWsUrl; // e.g., wss://host
  final String branchCode;
  WebSocketChannel? _channel;

  ChatService({required this.baseWsUrl, required this.branchCode});

  Stream<Map<String, dynamic>> connect() {
    final uri = Uri.parse('$baseWsUrl/ws/customer-chat?branchCode=$branchCode');
    _channel = WebSocketChannel.connect(uri);
    return _channel!.stream.map((event) {
      try { return jsonDecode(event as String) as Map<String, dynamic>; } catch (_) { return <String, dynamic>{}; }
    });
  }

  void send(String text) {
    _channel?.sink.add(jsonEncode({ 'type': 'chat', 'text': text }));
  }

  void dispose() {
    _channel?.sink.close();
    _channel = null;
  }
}

