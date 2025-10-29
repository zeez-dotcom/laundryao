class Customer {
  final String id;
  final String name;
  final double balanceDue;

  Customer({required this.id, required this.name, required this.balanceDue});

  factory Customer.fromJson(Map<String, dynamic> json) => Customer(
        id: json['id'] as String,
        name: (json['name'] ?? json['username'] ?? '') as String,
        balanceDue: double.tryParse('${json['balanceDue'] ?? json['financials']?['balanceDue'] ?? 0}') ?? 0,
      );
}

