import 'package:dio/dio.dart';
import '../models/order_summary.dart';
import 'dio_client.dart';

class OrdersApi {
  final Dio _dio = ApiClient().dio;

  Future<List<OrderSummary>> listCustomerOrders() async {
    final res = await _dio.get('/customer/orders');
    if (res.statusCode == 200) {
      return (res.data as List).map((e) => OrderSummary.fromJson(e as Map<String, dynamic>)).toList();
    }
    throw Exception('Failed to fetch orders');
  }
}

