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

    test('Stage 4 variants pin colour + emoji (regression against §9.3/§9.4 drift)', () {
      expect(styleFor(ToastType.rankMilestone).background, AppColors.gold);
      expect(styleFor(ToastType.rankMilestone).emoji, '🏆');

      expect(styleFor(ToastType.achievement).background, AppColors.purple);
      expect(styleFor(ToastType.achievement).emoji, '🏅');

      expect(styleFor(ToastType.levelUp).background, AppColors.blue);
      expect(styleFor(ToastType.levelUp).emoji, '⬆️');

      expect(styleFor(ToastType.streakMilestone).background, AppColors.amber);
      expect(styleFor(ToastType.streakMilestone).emoji, '🔥');
    });

    test('every ToastType has a unique emoji (users must tell them apart)', () {
      final emojis = ToastType.values.map((t) => styleFor(t).emoji).toSet();
      expect(emojis.length, ToastType.values.length);
    });
  });
}
