import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app/router.dart';
import 'app/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Allow Google Fonts to fetch over HTTP (needed for Android)
  GoogleFonts.config.allowRuntimeFetching = true;
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
