import 'package:dio/dio.dart';
import '../models/customer.dart';
import 'dio_client.dart';

class AuthApi {
  final Dio _dio = ApiClient().dio;

  Future<Customer> customerLogin(String phone, String password) async {
    final res = await _dio.post('/customer/login', data: {
      'phoneNumber': phone,
      'password': password,
    });
    if (res.statusCode == 200) {
      return Customer.fromJson(res.data as Map<String, dynamic>);
    }
    throw Exception(res.data is Map && (res.data as Map)['message'] != null
        ? (res.data as Map)['message']
        : 'Login failed');
  }

  Future<Response> staffLogin(String username, String password) async {
    final res = await _dio.post('/auth/login', data: {
      'username': username,
      'password': password,
    });
    if ((res.statusCode ?? 500) >= 400) {
      throw Exception('Staff login failed');
    }
    return res;
  }

  Future<Customer> me() async {
    final res = await _dio.get('/customer/me');
    if (res.statusCode == 200) return Customer.fromJson(res.data as Map<String, dynamic>);
    throw Exception('Not authenticated');
  }
}

