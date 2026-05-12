import 'package:flutter/foundation.dart';

class AppConfig {
  static const _apiFromEnv = String.fromEnvironment('API_BASE_URL');
  static const _socketFromEnv = String.fromEnvironment('SOCKET_URL');

  static String get apiBaseUrl =>
      _apiFromEnv.isNotEmpty ? _apiFromEnv : _localhostBaseUrl;
  static String get socketUrl =>
      _socketFromEnv.isNotEmpty ? _socketFromEnv : apiBaseUrl;

  static String get _localhostBaseUrl {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }

    return 'http://localhost:3000';
  }
}
