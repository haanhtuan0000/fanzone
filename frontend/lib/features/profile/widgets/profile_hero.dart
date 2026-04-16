import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
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
                width: s(context, 100),
                height: s(context, 100),
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
                    child: Text(avatarEmoji, style: TextStyle(fontSize: sf(context, 44))),
                  ),
                ),
              ),
              // Level badge
              Container(
                padding: sp(context, h: 8, v: 2),
                decoration: BoxDecoration(
                  color: AppColors.neonGreen,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'Lv.$level',
                  style: TextStyle(
                    fontFamily: AppFonts.bebasNeue,
                    fontSize: sf(context, 14),
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
        SizedBox(height: s(context, 12)),
        Text(
          displayName,
          style: TextStyle(
            fontSize: sf(context, 22),
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: TextStyle(
            color: AppColors.amber,
            fontSize: sf(context, 14),
            fontWeight: FontWeight.w600,
            letterSpacing: 1,
          ),
        ),
        // Join date
        if (joinDate != null) ...[
          const SizedBox(height: 4),
          Text(
            AppStrings.current.memberSince(joinDate!.toLocal().month, joinDate!.toLocal().year),
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: sf(context, 12),
            ),
          ),
        ],
      ],
    );
  }
}
