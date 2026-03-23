import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

class NoQuestionBanner extends StatelessWidget {
  final int pendingCount;

  const NoQuestionBanner({super.key, this.pendingCount = 0});

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.amber.withOpacity(0.06),
        border: Border.all(color: AppColors.amber.withOpacity(0.2)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Text('⏳', style: TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  s.waitingForMatch,
                  style: TextStyle(
                    fontFamily: AppFonts.bebasNeue,
                    fontSize: 14,
                    color: AppColors.amber,
                    letterSpacing: 0.5,
                  ),
                ),
                if (pendingCount > 0)
                  Text(
                    s.waitingForResults(pendingCount),
                    style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
