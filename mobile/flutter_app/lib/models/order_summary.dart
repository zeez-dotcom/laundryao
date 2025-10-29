class OrderSummary {
  final String id;
  final String orderNumber;
  final DateTime createdAt;
  final String status;
  final double subtotal;
  final double paid;
  final double remaining;

  OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.createdAt,
    required this.status,
    required this.subtotal,
    required this.paid,
    required this.remaining,
  });

  factory OrderSummary.fromJson(Map<String, dynamic> json) => OrderSummary(
        id: json['id'] as String,
        orderNumber: '${json['orderNumber']}',
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
        status: (json['status'] ?? '') as String,
        subtotal: double.tryParse('${json['subtotal'] ?? 0}') ?? 0,
        paid: double.tryParse('${json['paid'] ?? 0}') ?? 0,
        remaining: double.tryParse('${json['remaining'] ?? 0}') ?? 0,
      );
}

