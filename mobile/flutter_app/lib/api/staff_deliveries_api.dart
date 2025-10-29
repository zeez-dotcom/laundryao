import 'package:dio/dio.dart';
import 'dio_client.dart';

class StaffDeliveriesApi {
  final Dio _dio = ApiClient().dio;

  Future<List<Map<String, dynamic>>> listDeliveries({String? status}) async {
    final res = await _dio.get('/api/delivery-orders', queryParameters: status != null ? { 'status': status } : null);
    if ((res.statusCode ?? 500) >= 400) throw Exception('Failed to fetch');
    return (res.data as List).cast<Map<String, dynamic>>();
  }

  Future<void> updateStatus(String orderId, String status) async {
    final res = await _dio.patch('/api/delivery-orders/$orderId/status', data: { 'status': status });
    if ((res.statusCode ?? 500) >= 400) throw Exception('Failed to update');
  }
}

