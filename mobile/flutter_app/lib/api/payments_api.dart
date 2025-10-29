import 'package:dio/dio.dart';
import 'dio_client.dart';

class PaymentsApi {
  final Dio _dio = ApiClient().dio;

  Future<List<Map<String, dynamic>>> history(String customerId) async {
    final res = await _dio.get('/api/customers/$customerId/payments');
    if ((res.statusCode ?? 500) >= 400) throw Exception('Failed');
    return (res.data as List).cast<Map<String, dynamic>>();
  }

  Future<void> record(String customerId, {required String amount, required String paymentMethod, String? notes}) async {
    final res = await _dio.post('/api/customers/$customerId/payments', data: {
      'amount': amount,
      'paymentMethod': paymentMethod,
      if (notes != null) 'notes': notes,
    });
    if ((res.statusCode ?? 500) >= 400) throw Exception('Failed to record');
  }
}

