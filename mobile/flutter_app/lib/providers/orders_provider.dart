import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/orders_api.dart';
import '../models/order_summary.dart';

final ordersProvider = FutureProvider<List<OrderSummary>>((ref) async {
  return OrdersApi().listCustomerOrders();
});

