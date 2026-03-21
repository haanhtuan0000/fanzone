import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/leaderboard_entry.dart';

class PodiumTop3 extends StatelessWidget {
  final List<LeaderboardEntry> entries;
  const PodiumTop3({super.key, required this.entries});

  @override
  Widget build(BuildContext context) {
    if (entries.length < 3) return const SizedBox();

    return SizedBox(
      height: 200,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // #2 - Left
          Expanded(child: _PodiumSlot(entry: entries[1], height: 140, color: AppColors.silver, rank: 2)),
          const SizedBox(width: 8),
          // #1 - Center (tallest)
          Expanded(child: _PodiumSlot(entry: entries[0], height: 180, color: AppColors.gold, rank: 1)),
          const SizedBox(width: 8),
          // #3 - Right
          Expanded(child: _PodiumSlot(entry: entries[2], height: 110, color: AppColors.bronze, rank: 3)),
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
        Text(entry.avatarEmoji, style: const TextStyle(fontSize: 32)),
        const SizedBox(height: 4),
        Text(
          entry.displayName,
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 8),
        Container(
          height: height,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [color.withOpacity(0.8), color.withOpacity(0.3)],
            ),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
          ),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '#$rank',
                  style: TextStyle(
                    fontFamily: AppFonts.bebasNeue,
                    fontSize: 24,
                    color: AppColors.background,
                  ),
                ),
                Text(
                  '${entry.coins}',
                  style: TextStyle(
                    fontFamily: AppFonts.bebasNeue,
                    fontSize: 18,
                    color: AppColors.background,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
