import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppConfig extends ChangeNotifier {
  static final AppConfig _instance = AppConfig._internal();
  factory AppConfig() => _instance;
  AppConfig._internal();

  String _baseUrl = '';
  String _branchCode = '';
  bool _loaded = false;

  String get baseUrl => _baseUrl;
  String get branchCode => _branchCode;
  bool get isLoaded => _loaded;
  String get wsBaseUrl {
    if (_baseUrl.startsWith('https://')) {
      return _baseUrl.replaceFirst('https://', 'wss://');
    }
    if (_baseUrl.startsWith('http://')) {
      return _baseUrl.replaceFirst('http://', 'ws://');
    }
    return _baseUrl; // If user puts ws directly
  }

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString('api_base_url') ?? '';
    _branchCode = prefs.getString('branch_code') ?? '';
    _loaded = true;
    notifyListeners();
  }

  Future<void> setBaseUrl(String url) async {
    _baseUrl = url.trim();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api_base_url', _baseUrl);
    notifyListeners();
  }

  Future<void> setBranchCode(String code) async {
    _branchCode = code.trim();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('branch_code', _branchCode);
    notifyListeners();
  }
}

