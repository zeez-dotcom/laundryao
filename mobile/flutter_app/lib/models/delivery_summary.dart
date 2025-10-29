class DeliverySummary {
  final String id;
  final String orderId;
  final String orderNumber;
  final DateTime createdAt;
  final String status;
  final String deliveryStatus;
  final DateTime? scheduledDeliveryTime;

  DeliverySummary({
    required this.id,
    required this.orderId,
    required this.orderNumber,
    required this.createdAt,
    required this.status,
    required this.deliveryStatus,
    this.scheduledDeliveryTime,
  });

  factory DeliverySummary.fromJson(Map<String, dynamic> json) => DeliverySummary(
        id: json['id'] as String,
        orderId: '${json['orderId']}',
        orderNumber: '${json['orderNumber']}',
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
        status: (json['status'] ?? '') as String,
        deliveryStatus: (json['deliveryStatus'] ?? '') as String,
        scheduledDeliveryTime: json['scheduledDeliveryTime'] != null
            ? DateTime.tryParse('${json['scheduledDeliveryTime']}')
            : null,
      );
}

