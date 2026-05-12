import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  static const Duration _timeout = Duration(seconds: 12);
  static const int _maxRetries = 1;

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', token);
  }

  Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
  }

  Future<Map<String, dynamic>> login(
    String email,
    String senha, {
    String? twoFactorCode,
    String? deviceId,
    String? deviceName,
  }) async {
    final data = await post('/auth/login', {
      'email': email,
      'senha': senha,
      if (twoFactorCode != null && twoFactorCode.isNotEmpty)
        'twoFactorCode': twoFactorCode,
      if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
      if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
    }, authenticated: false);

    final token = data['token'] as String?;
    if (token != null && token.isNotEmpty) {
      await saveToken(token);
    }

    return data;
  }

  Future<Map<String, dynamic>> setup2fa() {
    return post('/auth/2fa/setup', {});
  }

  Future<Map<String, dynamic>> confirmar2fa(String code) {
    return post('/auth/2fa/confirm', {'code': code});
  }

  Future<Map<String, dynamic>> desativar2fa() {
    return post('/auth/2fa/disable', {});
  }

  Future<Map<String, dynamic>> me() {
    return get('/auth/me');
  }

  Future<Map<String, dynamic>?> votacaoAtiva() async {
    try {
      final response = await _request('GET', '/votacoes/ativa');
      if (response.body == 'null') {
        return null;
      }

      final data = _decodeMap(response);
      if (data.isEmpty || data['id'] == null) {
        return null;
      }

      return data;
    } on ApiException catch (error) {
      if (error.statusCode == 404) {
        return null;
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> confirmarPresenca(String sessaoId) {
    return post('/presencas/$sessaoId/confirmar', {});
  }

  Future<Map<String, dynamic>> quorum(String sessaoId) {
    return get('/presencas/$sessaoId/quorum');
  }

  Future<List<dynamic>> presencas(String sessaoId) async {
    final response = await _request('GET', '/presencas/$sessaoId');
    return _decodeList(response);
  }

  Future<Map<String, dynamic>> votar(String votacaoId, String voto) {
    return post('/votacoes/$votacaoId/votar', {'voto': voto});
  }

  Future<List<Map<String, dynamic>>> pautas() async {
    final response = await _request('GET', '/pautas');
    final data = _decodeList(response);
    return data
        .whereType<Map>()
        .map((item) => item.map((k, v) => MapEntry(k.toString(), v)))
        .toList();
  }

  Future<Map<String, dynamic>> abrirVotacao(String pautaId) {
    return post('/votacoes/abrir/$pautaId', {});
  }

  Future<Map<String, dynamic>> encerrarVotacao(String votacaoId) {
    return patch('/votacoes/$votacaoId/encerrar', {});
  }

  Future<List<Map<String, dynamic>>> votacoesEncerradas() async {
    final response = await _request('GET', '/votacoes');
    final data = _decodeList(response);
    final normalized = data
        .whereType<Map>()
        .map((item) => item.map((k, v) => MapEntry(k.toString(), v)))
        .toList();

    final encerradas =
        normalized.where((item) => item['status']?.toString() == 'ENCERRADA').toList();

    encerradas.sort((a, b) {
      final aDate = DateTime.tryParse(a['encerrada_em']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0);
      final bDate = DateTime.tryParse(b['encerrada_em']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0);
      return bDate.compareTo(aDate);
    });

    return encerradas;
  }

  Future<Map<String, dynamic>> ataVotacao(String votacaoId) {
    return get('/atas/votacao/$votacaoId');
  }

  Future<List<Map<String, dynamic>>> relatorioSessoes() async {
    final response = await _request('GET', '/relatorios/sessoes');
    final data = _decodeList(response);
    return data
        .whereType<Map>()
        .map((item) => item.map((k, v) => MapEntry(k.toString(), v)))
        .toList();
  }

  Future<Map<String, dynamic>> relatorioSessao(String sessaoId) {
    return get('/relatorios/sessoes/$sessaoId');
  }

  Future<Map<String, dynamic>> uploadMinhaFoto(String userId, String filePath) async {
    final token = await getToken();
    if (token == null || token.isEmpty) {
      throw ApiException('Token nao encontrado.');
    }

    final uri = Uri.parse('${AppConfig.apiBaseUrl}/usuarios/$userId/foto');
    final request = http.MultipartRequest('POST', uri)
      ..headers['Authorization'] = 'Bearer $token'
      ..files.add(await http.MultipartFile.fromPath('foto', filePath));

    _log('POST', '/usuarios/$userId/foto (multipart)');
    final streamed = await request.send().timeout(_timeout);
    final response = await http.Response.fromStream(streamed);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return _decodeMap(response);
    }
    throw ApiException(_errorMessage(response), statusCode: response.statusCode);
  }

  Future<Map<String, dynamic>> removerMinhaFoto(String userId) async {
    final response = await _request('DELETE', '/usuarios/$userId/foto');
    return _decodeMap(response);
  }

  String ataPdfUrl(String votacaoId) {
    return '${AppConfig.apiBaseUrl}/atas/votacao/$votacaoId/pdf';
  }

  Future<Map<String, dynamic>> get(String path) async {
    final response = await _request('GET', path);
    return _decodeMap(response);
  }

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    bool authenticated = true,
  }) async {
    final response = await _request(
      'POST',
      path,
      body: body,
      authenticated: authenticated,
    );
    return _decodeMap(response);
  }

  Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> body, {
    bool authenticated = true,
  }) async {
    final response = await _request(
      'PATCH',
      path,
      body: body,
      authenticated: authenticated,
    );
    return _decodeMap(response);
  }

  Future<http.Response> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
    final token = await getToken();
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (authenticated && token != null) 'Authorization': 'Bearer $token',
    };

    Object? lastError;
    for (var attempt = 0; attempt <= _maxRetries; attempt++) {
      try {
        _log(method, '$path (tentativa ${attempt + 1})');
        final response = await switch (method) {
          'GET' => _client.get(uri, headers: headers).timeout(_timeout),
          'POST' => _client
              .post(
                uri,
                headers: headers,
                body: jsonEncode(body ?? {}),
              )
              .timeout(_timeout),
          'DELETE' => _client.delete(uri, headers: headers).timeout(_timeout),
          'PATCH' => _client
              .patch(
                uri,
                headers: headers,
                body: jsonEncode(body ?? {}),
              )
              .timeout(_timeout),
          _ => throw ApiException('Metodo nao suportado: $method'),
        };

        if (response.statusCode >= 200 && response.statusCode < 300) {
          return response;
        }

        if (_isRetryableStatus(response.statusCode) && attempt < _maxRetries) {
          await Future.delayed(Duration(milliseconds: 350 * (attempt + 1)));
          continue;
        }

        throw ApiException(
          _errorMessage(response),
          statusCode: response.statusCode,
        );
      } on TimeoutException {
        lastError = ApiException('Tempo de resposta excedido ao falar com o servidor.');
      } on SocketException {
        lastError = ApiException('Falha de rede. Verifique sua conexao.');
      } catch (error) {
        lastError = error;
      }

      if (attempt < _maxRetries) {
        await Future.delayed(Duration(milliseconds: 350 * (attempt + 1)));
      }
    }

    if (lastError is ApiException) {
      throw lastError;
    }
    throw ApiException('Falha inesperada na comunicacao com o servidor.');
  }

  bool _isRetryableStatus(int statusCode) {
    return statusCode == 408 || statusCode == 429 || statusCode >= 500;
  }

  Map<String, dynamic> _decodeMap(http.Response response) {
    if (response.body.isEmpty || response.body == 'null') {
      return {};
    }
    final data = jsonDecode(response.body);
    if (data is Map<String, dynamic>) return data;
    throw ApiException('Resposta inesperada do servidor.');
  }

  List<dynamic> _decodeList(http.Response response) {
    if (response.body.isEmpty) return [];
    final data = jsonDecode(response.body);
    if (data is List<dynamic>) return data;
    throw ApiException('Resposta inesperada do servidor.');
  }

  String _errorMessage(http.Response response) {
    try {
      final data = jsonDecode(response.body);
      if (data is Map && data['message'] != null) {
        return data['message'].toString();
      }
    } catch (_) {}
    return 'Erro ${response.statusCode} ao falar com o servidor.';
  }

  void _log(String method, String path) {
    debugPrint('[ApiClient] $method $path');
  }
}
