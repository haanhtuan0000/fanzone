import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class ActivityHistory extends StatelessWidget {
  final List<dynamic> activity;

  const ActivityHistory({super.key, this.activity = const []});

  String _typeIcon(String type) {
    switch (type) {
      case 'PREDICTION_WIN': return '✅';
      case 'PREDICTION_LOSS': return '❌';
      case 'ACHIEVEMENT': return '🏆';
      case 'LEVEL_UP': return '⬆️';
      default: return '📋';
    }
  }

  @override
  Widget build(BuildContext context) {
    if (activity.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: Text(
            'Chua co hoat dong nao',
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ),
      );
    }

    return Column(
      children: activity.take(10).map((item) {
        final map = item as Map<String, dynamic>;
        final type = map['type'] as String? ?? '';
        final amount = map['amount'] as int? ?? 0;
        final isPositive = amount >= 0;

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.cardSurface,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Text(_typeIcon(type), style: const TextStyle(fontSize: 20)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  type.replaceAll('_', ' '),
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                ),
              ),
              Text(
                '${isPositive ? "+" : ""}$amount',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: 18,
                  color: isPositive ? AppColors.neonGreen : AppColors.red,
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
