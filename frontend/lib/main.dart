import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'app/router.dart';
import 'app/theme.dart';
import 'core/notifications/fcm_service.dart';
import 'core/notifications/notification_service.dart';

@pragma('vm:entry-point')
Future<void> _firebaseBgHandler(RemoteMessage message) async {
  // Runs in a separate isolate when a data/notification message arrives
  // while the app is backgrounded or terminated. For Stage 1 we only
  // need this function to exist so firebase_messaging can spin up the
  // engine — the OS displays the notification tray entry automatically
  // for messages that contain a `notification` payload.
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseBgHandler);
    FcmService.instance.startListening();
  } catch (e) {
    debugPrint('[main] Firebase init failed, push disabled: $e');
  }
  GoogleFonts.config.allowRuntimeFetching = true;
  NotificationService.init();
  runApp(const ProviderScope(child: FanZoneApp()));
}

class FanZoneApp extends ConsumerWidget {
  const FanZoneApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'FanZone',
      theme: fanZoneTheme,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
