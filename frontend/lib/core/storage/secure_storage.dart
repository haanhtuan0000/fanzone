import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
});

class SecureStorageService {
  final _storage = const FlutterSecureStorage();

  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _onboardedKey = 'onboarded';
  static const _tutorialCompleteKey = 'tutorial_complete';

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
    ]);
  }

  Future<String?> getAccessToken() async {
    return _storage.read(key: _accessTokenKey);
  }

  Future<String?> getRefreshToken() async {
    return _storage.read(key: _refreshTokenKey);
  }

  Future<void> clearTokens() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
    ]);
  }

  Future<void> setOnboarded() async {
    await _storage.write(key: _onboardedKey, value: 'true');
  }

  Future<bool> isOnboarded() async {
    final value = await _storage.read(key: _onboardedKey);
    return value == 'true';
  }

  Future<void> setTutorialComplete() async {
    await _storage.write(key: _tutorialCompleteKey, value: 'true');
  }

  Future<bool> isTutorialComplete() async {
    final value = await _storage.read(key: _tutorialCompleteKey);
    return value == 'true';
  }
}
