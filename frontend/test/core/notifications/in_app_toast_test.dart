import 'package:flutter_test/flutter_test.dart';
import 'package:fanzone/app/constants.dart';
import 'package:fanzone/core/notifications/in_app_toast.dart';

/// Pin the visual mapping from ToastType → colour+emoji so drift from
/// spec §9.2 Table 32 fails loudly rather than silently. The actual
/// SnackBar render is not tested here (it needs a ScaffoldMessenger);
/// the pure helper carries the whole style decision.
void main() {
  group('styleFor', () {
    test('newQuestion → amber · ⚡', () {
      final s = styleFor(ToastType.newQuestion);
      expect(s.background, AppColors.amber);
      expect(s.emoji, '⚡');
    });

    test('correct → neon green · 🎯', () {
      final s = styleFor(ToastType.correct);
      expect(s.background, AppColors.neonGreen);
      expect(s.emoji, '🎯');
    });

    test('wrong → red · ❌', () {
      final s = styleFor(ToastType.wrong);
      expect(s.background, AppColors.red);
      expect(s.emoji, '❌');
    });

    test('timeout → amber · ⏰ (distinct from newQuestion emoji)', () {
      final s = styleFor(ToastType.timeout);
      expect(s.background, AppColors.amber);
      expect(s.emoji, '⏰');
      // Regression: timeout and newQuestion share a colour but MUST NOT
      // share an emoji — otherwise users can't tell them apart at a glance.
      expect(s.emoji, isNot(styleFor(ToastType.newQuestion).emoji));
    });
  });
}
