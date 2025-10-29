import 'package:dio/dio.dart';
import '../models/delivery_summary.dart';
import 'dio_client.dart';

class DeliveriesApi {
  final Dio _dio = ApiClient().dio;

  Future<List<DeliverySummary>> listCustomerDeliveries() async {
    final res = await _dio.get('/customer/deliveries');
    if (res.statusCode == 200) {
      return (res.data as List)
          .map((e) => DeliverySummary.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    throw Exception('Failed to fetch deliveries');
  }
}

