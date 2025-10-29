import 'package:dio/dio.dart';
import 'dio_client.dart';

class AddressesApi {
  final Dio _dio = ApiClient().dio;

  Future<List<Map<String, dynamic>>> list() async {
    final res = await _dio.get('/customer/addresses');
    if ((res.statusCode ?? 500) >= 400) throw Exception('Failed to fetch addresses');
    return (res.data as List).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> create({
    required String label,
    required String address,
    String? cityId,
    String? governorateId,
    double? lat,
    double? lng,
  }) async {
    final res = await _dio.post('/customer/addresses', data: {
      'label': label,
      'address': address,
      if (cityId != null) 'cityId': cityId,
      if (governorateId != null) 'governorateId': governorateId,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    });
    if ((res.statusCode ?? 500) >= 400) throw Exception('Failed to create address');
    return (res.data as Map<String, dynamic>);
  }
}

