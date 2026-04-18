import 'package:flutter/material.dart';

import '../../app/constants.dart';
import '../../app/router.dart';

/// Toast kind drives the colour + emoji chosen by [styleFor]. Kept as a
/// plain enum (not pulled from the FCM `data.type` string) so the client
/// never trusts a server-controlled string to drive UI code paths.
enum ToastType {
  newQuestion,
  correct,
  wrong,
  timeout,
  rankMilestone,
  achievement,
  levelUp,
  streakMilestone,
}

class ToastStyle {
  final Color background;
  final String emoji;
  const ToastStyle({required this.background, required this.emoji});
}

/// Pure style map — tested in isolation so future changes to colour/emoji
/// can't drift silently away from spec §9.2–§9.4.
ToastStyle styleFor(ToastType type) {
  switch (type) {
    case ToastType.newQuestion:
      return const ToastStyle(background: AppColors.amber, emoji: '⚡');
    case ToastType.correct:
      return const ToastStyle(background: AppColors.neonGreen, emoji: '🎯');
    case ToastType.wrong:
      return const ToastStyle(background: AppColors.red, emoji: '❌');
    case ToastType.timeout:
      return const ToastStyle(background: AppColors.amber, emoji: '⏰');
    case ToastType.rankMilestone:
      return const ToastStyle(background: AppColors.gold, emoji: '🏆');
    case ToastType.achievement:
      return const ToastStyle(background: AppColors.purple, emoji: '🏅');
    case ToastType.levelUp:
      return const ToastStyle(background: AppColors.blue, emoji: '⬆️');
    case ToastType.streakMilestone:
      return const ToastStyle(background: AppColors.amber, emoji: '🔥');
  }
}

/// In-app toast dispatch for foreground-delivered pushes. FCM suppresses
/// the tray entry for foreground messages, so the client renders this
/// SnackBar instead. The navigator key keeps this callable from outside
/// the widget tree (FcmService.onMessage runs in a background isolate
/// callback).
class InAppToast {
  static void newQuestion({
    required String questionText,
    required int seconds,
    required int reward,
  }) {
    _show(
      ToastType.newQuestion,
      'Câu hỏi mới: $questionText · ${seconds}s · +$reward🪙',
    );
  }

  static void correct({
    required String questionText,
    required int coins,
    required int dailyTotal,
  }) {
    _show(
      ToastType.correct,
      'Chính xác! $questionText · +$coins🪙 · Tổng: $dailyTotal🪙',
    );
  }

  static void wrong({
    required String questionText,
    required int coins,
  }) {
    _show(
      ToastType.wrong,
      'Tiếc quá! $questionText · −$coins🪙',
    );
  }

  static void timeout({required String questionText}) {
    _show(
      ToastType.timeout,
      'Đã hết giờ: $questionText · Câu tiếp đang chờ!',
    );
  }

  static void rankMilestone({required int position}) {
    _show(
      ToastType.rankMilestone,
      'Bạn vừa lọt vào Top $position! Hạng #$position',
    );
  }

  static void achievement({required String name, required int rewardXp}) {
    _show(
      ToastType.achievement,
      'Mở khóa: $name · +$rewardXp XP',
    );
  }

  static void levelUp({required int level}) {
    _show(
      ToastType.levelUp,
      'Lên cấp! Level $level',
    );
  }

  static void streakMilestone({required int days}) {
    _show(
      ToastType.streakMilestone,
      'Streak $days ngày! Tiếp tục dự đoán.',
    );
  }

  static void _show(ToastType type, String body) {
    final ctx = rootNavigatorKey.currentContext;
    if (ctx == null) return;
    final style = styleFor(type);
    ScaffoldMessenger.of(ctx).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Text(style.emoji, style: const TextStyle(fontSize: 16)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                body,
                style: const TextStyle(
                  color: Colors.black,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: style.background,
        duration: const Duration(seconds: 4),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
