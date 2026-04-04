import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../shared/utils/country_utils.dart';

class MiniProfileModal extends StatelessWidget {
  final String displayName;
  final String avatarEmoji;
  final int level;
  final String title;
  final int accuracy;
  final int totalPredictions;
  final String? countryCode;
  final int streakDays;

  const MiniProfileModal({
    super.key,
    required this.displayName,
    required this.avatarEmoji,
    required this.level,
    required this.title,
    required this.accuracy,
    required this.totalPredictions,
    this.countryCode,
    this.streakDays = 0,
  });

  static void show(BuildContext context, {
    required String displayName,
    required String avatarEmoji,
    int level = 1,
    String title = 'Fan',
    int accuracy = 0,
    int totalPredictions = 0,
    String? countryCode,
    int streakDays = 0,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.cardSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => MiniProfileModal(
        displayName: displayName,
        avatarEmoji: avatarEmoji,
        level: level,
        title: title,
        accuracy: accuracy,
        totalPredictions: totalPredictions,
        countryCode: countryCode,
        streakDays: streakDays,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.divider,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 24),
          Text(avatarEmoji, style: const TextStyle(fontSize: 48)),
          const SizedBox(height: 12),
          Text(
            displayName,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          Text(
            'Lv.$level - $title',
            style: const TextStyle(color: AppColors.amber, fontSize: 14),
          ),
          if (countryCode != null) ...[
            const SizedBox(height: 4),
            Text(
              '${countryFlag(countryCode)} ${countryName(countryCode)}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _MiniStat(label: 'Accuracy', value: '$accuracy%'),
              _MiniStat(label: 'Predictions', value: '$totalPredictions'),
              _MiniStat(label: 'Streak', value: '$streakDays'),
            ],
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: 24,
            color: AppColors.textPrimary,
          ),
        ),
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
      ],
    );
  }
}
