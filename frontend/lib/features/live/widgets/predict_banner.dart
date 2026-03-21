import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

class PredictBanner extends StatelessWidget {
  const PredictBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    return GestureDetector(
      onTap: () => context.go('/predict'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.neonGreen.withOpacity(0.2),
              AppColors.neonGreen.withOpacity(0.05),
            ],
          ),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.neonGreen.withOpacity(0.5)),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.neonGreen.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.bolt, color: AppColors.neonGreen, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.predictNow,
                    style: const TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 18,
                      color: AppColors.neonGreen,
                      letterSpacing: 1,
                    ),
                  ),
                  Text(
                    s.newQuestionAvailable,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios, color: AppColors.neonGreen, size: 16),
          ],
        ),
      ),
    );
  }
}
