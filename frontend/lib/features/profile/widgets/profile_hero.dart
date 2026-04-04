import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

class ProfileHero extends StatelessWidget {
  final String avatarEmoji;
  final String displayName;
  final String title;
  final int level;
  final DateTime? joinDate;
  final VoidCallback? onTap;

  const ProfileHero({
    super.key,
    required this.avatarEmoji,
    required this.displayName,
    required this.title,
    required this.level,
    this.joinDate,
    this.onTap,
  });

  List<Color> _gradientForLevel(int level) {
    if (level >= 21) return [AppColors.gold, AppColors.red];
    if (level >= 11) return [AppColors.purple, AppColors.blue];
    if (level >= 6) return [AppColors.amber, AppColors.neonGreen];
    return [AppColors.neonGreen, AppColors.blue];
  }

  @override
  Widget build(BuildContext context) {
    final colors = _gradientForLevel(level);

    return Column(
      children: [
        // Avatar with gradient border — tap to edit
        GestureDetector(
          onTap: onTap,
          child: Stack(
            alignment: Alignment.bottomRight,
            children: [
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: colors,
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: colors.first.withOpacity(0.3),
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
              // Edit icon overlay (top-right)
              if (onTap != null)
                Positioned(
                  top: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.cardSurfaceLight,
                    ),
                    child: const Icon(Icons.edit, size: 14, color: AppColors.textSecondary),
                  ),
                ),
            ],
          ),
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
        // Join date
        if (joinDate != null) ...[
          const SizedBox(height: 4),
          Text(
            AppStrings.current.memberSince(joinDate!.month, joinDate!.year),
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
            ),
          ),
        ],
      ],
    );
  }
}
