import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../network/api_client.dart';
import '../network/api_endpoints.dart';
import 'in_app_toast.dart';

/// Thin wrapper around [FirebaseMessaging.instance] that keeps the
/// platform-channel surface small and mockable. Stage 1 only exposes
/// what the auth-registration + deep-link + foreground-log flows need;
/// richer typed dispatch (in-app toasts, per-route handlers) is added
/// by later stages.
class FcmService {
  FcmService._();
  static final FcmService instance = FcmService._();

  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  StreamSubscription<RemoteMessage>? _tapSub;

  /// Ask the OS for notification permission. On Android 12 and below this
  /// is a no-op that resolves true; on Android 13+ it prompts the user.
  /// iOS behaviour is analogous.
  Future<bool> requestPermission() async {
    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return settings.authorizationStatus == AuthorizationStatus.authorized
        || settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  /// Current device token, or null if FCM is uninitialised or the device
  /// has no Google Play Services.
  Future<String?> getToken() async {
    try {
      return await FirebaseMessaging.instance.getToken();
    } catch (e) {
      debugPrint('[FcmService] getToken failed: $e');
      return null;
    }
  }

  /// Stream of new tokens issued during the app's lifetime (token rotates
  /// on reinstall, app-data clear, or server-side invalidation).
  Stream<String> tokenRefreshes() => FirebaseMessaging.instance.onTokenRefresh;

  /// Hook foreground messages (app is open). FCM suppresses the tray
  /// entry while the app is foreground, so we render an in-app toast
  /// based on `data.type`. A malformed payload is logged and ignored —
  /// a future backend type we don't recognise must never crash the app.
  void startListening() {
    _foregroundSub ??= FirebaseMessaging.onMessage.listen(_handleForeground);

    // App opened from a background-state notification tap
    _tapSub ??= FirebaseMessaging.onMessageOpenedApp.listen(_handleTap);

    // App opened from a terminated-state notification tap (must be polled once)
    FirebaseMessaging.instance.getInitialMessage().then((m) {
      if (m != null) _handleTap(m);
    });
  }

  void _handleForeground(RemoteMessage msg) {
    final data = msg.data;
    final type = data['type'];
    try {
      switch (type) {
        case 'new_question':
          InAppToast.newQuestion(
            questionText: data['questionText'] ?? '',
            seconds: int.tryParse(data['seconds'] ?? '') ?? 0,
            reward: int.tryParse(data['rewardCoins'] ?? '') ?? 0,
          );
          break;
        case 'correct':
          InAppToast.correct(
            questionText: data['questionText'] ?? '',
            coins: int.tryParse(data['coins'] ?? '') ?? 0,
            dailyTotal: int.tryParse(data['dailyTotal'] ?? '') ?? 0,
          );
          break;
        case 'wrong':
          InAppToast.wrong(
            questionText: data['questionText'] ?? '',
            coins: int.tryParse(data['coins'] ?? '') ?? 0,
          );
          break;
        case 'timeout':
          InAppToast.timeout(questionText: data['questionText'] ?? '');
          break;
        default:
          debugPrint('[FCM] foreground: unknown type=$type data=$data');
      }
    } catch (e) {
      debugPrint('[FCM] foreground dispatch failed for type=$type: $e');
    }
  }

  void stopListening() {
    _foregroundSub?.cancel();
    _foregroundSub = null;
    _tapSub?.cancel();
    _tapSub = null;
  }

  void _handleTap(RemoteMessage msg) {
    final route = msg.data['route'] as String?;
    if (route == null || route.isEmpty) return;
    final ctx = rootNavigatorKey.currentContext;
    if (ctx == null) {
      debugPrint('[FCM] tap but no nav context yet — route=$route');
      return;
    }
    try {
      ctx.go(route);
    } catch (e) {
      debugPrint('[FCM] tap navigation failed for route=$route: $e');
    }
  }

  /// Register this device's FCM token with the backend so the server can
  /// target push messages to this user. Safe to call multiple times —
  /// backend upserts on the (userId, fcmToken) unique key.
  Future<void> registerWithBackend(ApiClient api) async {
    final token = await getToken();
    if (token == null) return;
    await _postToken(api, token);

    _tokenRefreshSub?.cancel();
    _tokenRefreshSub = tokenRefreshes().listen((newToken) {
      _postToken(api, newToken);
    });
  }

  Future<void> unregisterRefreshSubscription() async {
    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = null;
  }

  Future<void> _postToken(ApiClient api, String token) async {
    try {
      await api.post(
        ApiEndpoints.registerDevice,
        data: {
          'fcmToken': token,
          'platform': 'ANDROID',
          'locale': _currentLocale(),
        },
      );
      debugPrint('[FcmService] registered device with backend');
    } catch (e) {
      debugPrint('[FcmService] device registration failed: $e');
    }
  }

  /// Two-valued locale for push rendering. Mirrors the VI/EN branches
  /// the server-side template bank supports; any device whose system
  /// language isn't Vietnamese gets the English body (safer than a
  /// third language the server would silently fall back to VI on).
  String _currentLocale() {
    try {
      final code = WidgetsBinding.instance.platformDispatcher.locale.languageCode;
      return code == 'vi' ? 'vi' : 'en';
    } catch (_) {
      return 'vi';
    }
  }
}

/// App-wide singleton accessor. Kept as a Provider so tests can override
/// it with a fake and so consumers can `ref.read(fcmServiceProvider)`
/// without importing the singleton directly.
final fcmServiceProvider = Provider<FcmService>((ref) => FcmService.instance);
