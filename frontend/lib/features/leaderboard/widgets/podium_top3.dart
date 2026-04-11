import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/models/leaderboard_entry.dart';

class PodiumTop3 extends StatelessWidget {
  final List<LeaderboardEntry> entries;
  const PodiumTop3({super.key, required this.entries});

  @override
  Widget build(BuildContext context) {
    if (entries.length < 3) return const SizedBox();

    return SizedBox(
      height: s(context, 300),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // #2 - Left
          Expanded(child: _PodiumSlot(entry: entries[1], height: 120, color: AppColors.silver, rank: 2)),
          const SizedBox(width: 8),
          // #1 - Center (tallest, with crown)
          Expanded(child: _PodiumSlot(entry: entries[0], height: 160, color: AppColors.gold, rank: 1)),
          const SizedBox(width: 8),
          // #3 - Right
          Expanded(child: _PodiumSlot(entry: entries[2], height: 100, color: AppColors.bronze, rank: 3)),
        ],
      ),
    );
  }
}

class _PodiumSlot extends StatelessWidget {
  final LeaderboardEntry entry;
  final double height;
  final Color color;
  final int rank;

  const _PodiumSlot({
    required this.entry,
    required this.height,
    required this.color,
    required this.rank,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        // Crown for #1
        if (rank == 1)
          Text('👑', style: TextStyle(fontSize: sf(context, 20)))
        else
          SizedBox(height: s(context, 20)),
        const SizedBox(height: 4),
        // Country code circle
        Container(
          width: rank == 1 ? s(context, 56) : s(context, 48),
          height: rank == 1 ? s(context, 56) : s(context, 48),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.cardSurfaceLight,
            border: Border.all(color: color, width: 2),
          ),
          child: Center(
            child: Text(
              entry.countryCode ?? '??',
              style: TextStyle(
                fontFamily: AppFonts.bebasNeue,
                fontSize: rank == 1 ? sf(context, 18) : sf(context, 16),
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        // Name
        Text(
          entry.displayName,
          style: TextStyle(
            color: AppColors.textPrimary,
            fontSize: sf(context, 13),
            fontWeight: FontWeight.w600,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        // Coins
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${entry.coins}',
              style: TextStyle(
                color: AppColors.textSecondary,
                fontSize: sf(context, 12),
              ),
            ),
            const SizedBox(width: 2),
            Text('🪙', style: TextStyle(fontSize: sf(context, 10))),
          ],
        ),
        const SizedBox(height: 6),
        // Podium bar
        Container(
          height: s(context, height),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [color.withOpacity(0.8), color.withOpacity(0.3)],
            ),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
          ),
          child: Center(
            child: Text(
              '$rank',
              style: TextStyle(
                fontFamily: AppFonts.bebasNeue,
                fontSize: sf(context, 28),
                color: AppColors.background,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
