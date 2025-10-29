import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import '../config/config.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  static const _defineBase = String.fromEnvironment('API_BASE_URL', defaultValue: '');
  late final Dio dio = Dio(BaseOptions(
    baseUrl: _defineBase,
    headers: { 'Accept': 'application/json' },
    // Cookies: rely on native cookie jar or platform; for web, server must be same-origin
    followRedirects: false,
    validateStatus: (status) => status != null && status < 500,
  ));

  final CookieJar cookieJar = CookieJar();

  ApiClient._internal() {
    dio.interceptors.add(CookieManager(cookieJar));
    // Dynamically reflect AppConfig base URL
    final cfg = AppConfig();
    // Load once; callers should await AppConfig().load() in app bootstrap
    if (!cfg.isLoaded) {
      cfg.load().then((_) {
        if (cfg.baseUrl.isNotEmpty) {
          dio.options.baseUrl = cfg.baseUrl;
        } else if (_defineBase.isNotEmpty) {
          dio.options.baseUrl = _defineBase;
        }
      });
    } else if (cfg.baseUrl.isNotEmpty) {
      dio.options.baseUrl = cfg.baseUrl;
    } else if (_defineBase.isNotEmpty) {
      dio.options.baseUrl = _defineBase;
    }
    cfg.addListener(() {
      if (cfg.baseUrl.isNotEmpty) {
        dio.options.baseUrl = cfg.baseUrl;
      }
    });
  }
}
