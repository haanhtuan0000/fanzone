import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class ProfileHero extends StatelessWidget {
  final String avatarEmoji;
  final String displayName;
  final String title;
  final int level;

  const ProfileHero({
    super.key,
    required this.avatarEmoji,
    required this.displayName,
    required this.title,
    required this.level,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Avatar with gradient border
        Stack(
          alignment: Alignment.bottomRight,
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  colors: [AppColors.neonGreen, AppColors.blue],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.neonGreen.withOpacity(0.3),
                    blurRadius: 20,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: Container(
                margin: const EdgeInsets.all(3),
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.cardSurface,
                ),
                child: Center(
                  child: Text(avatarEmoji, style: const TextStyle(fontSize: 44)),
                ),
              ),
            ),
            // Level badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.neonGreen,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'Lv.$level',
                style: const TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: 14,
                  color: AppColors.background,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          displayName,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: const TextStyle(
            color: AppColors.amber,
            fontSize: 14,
            fontWeight: FontWeight.w600,
            letterSpacing: 1,
          ),
        ),
      ],
    );
  }
}
