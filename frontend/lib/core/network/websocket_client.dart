import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api_endpoints.dart';

final websocketClientProvider = Provider<WebSocketClient>((ref) {
  return WebSocketClient();
});

class WebSocketClient {
  io.Socket? _socket;
  bool _connected = false;

  bool get isConnected => _connected;

  void connect({String? token}) {
    _socket = io.io(
      ApiEndpoints.baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setExtraHeaders(token != null ? {'Authorization': 'Bearer $token'} : {})
          .build(),
    );

    _socket!.onConnect((_) {
      _connected = true;
    });

    _socket!.onDisconnect((_) {
      _connected = false;
    });

    _socket!.onReconnect((_) {
      _connected = true;
    });
  }

  void joinMatch(int fixtureId, {String? userId}) {
    _socket?.emit('join_match', {'fixtureId': fixtureId, 'userId': userId});
  }

  void leaveMatch(int fixtureId) {
    _socket?.emit('leave_match', {'fixtureId': fixtureId});
  }

  void on(String event, Function(dynamic) callback) {
    _socket?.on(event, callback);
  }

  void off(String event) {
    _socket?.off(event);
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connected = false;
  }
}
