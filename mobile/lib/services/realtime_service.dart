import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';

class RealtimeService {
  io.Socket? _socket;
  bool get isConnected => _socket?.connected == true;

  void connect({
    required void Function(dynamic data) onVotacaoAtualizada,
    required void Function(dynamic data) onVotacaoEncerrada,
    required void Function(dynamic data) onVotoRegistrado,
    required void Function(dynamic data) onPresencaAtualizada,
    required void Function(bool connected) onConnectionChanged,
  }) {
    disconnect();

    _socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setPath('/socket.io')
          .setTransports(kIsWeb ? ['websocket'] : ['websocket', 'polling'])
          .enableReconnection()
          .setReconnectionAttempts(999999)
          .setReconnectionDelay(1200)
          .setReconnectionDelayMax(5000)
          .disableAutoConnect()
          .build(),
    );

    _socket!
      ..onConnect((_) {
        debugPrint('[Realtime] conectado em ${AppConfig.socketUrl}');
        onConnectionChanged(true);
      })
      ..onDisconnect((reason) {
        debugPrint('[Realtime] desconectado: $reason');
        onConnectionChanged(false);
      })
      ..onConnectError((error) {
        debugPrint('[Realtime] connect_error: $error');
        onConnectionChanged(false);
      })
      ..onError((error) {
        debugPrint('[Realtime] erro: $error');
      })
      ..on('votacao_atualizada', onVotacaoAtualizada)
      ..on('votacao_encerrada', onVotacaoEncerrada)
      ..on('voto_registrado', onVotoRegistrado)
      ..on('presenca_atualizada', onPresencaAtualizada)
      ..connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }
}
