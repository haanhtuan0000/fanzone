import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/question.dart';
import '../../../shared/utils/haptics.dart';

String _localized(String text) {
  final parts = text.split('|');
  if (parts.length == 2) {
    return identical(AppStrings.current, AppStrings.en) ? parts[0].trim() : parts[1].trim();
  }
  return text;
}

class OptionButton extends StatelessWidget {
  final QuestionOption option;
  final bool isSelected;
  final bool isLocked;
  final VoidCallback onTap;

  const OptionButton({
    super.key,
    required this.option,
    this.isSelected = false,
    this.isLocked = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        if (!isLocked) {
          Haptics.selection();
          onTap();
        }
      },
      child: AnimatedContainer(
        duration: AppDurations.quick,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.neonGreen.withOpacity(0.1)
              : AppColors.cardSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? AppColors.neonGreen : AppColors.divider,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            // Emoji
            if (option.emoji != null)
              Text(option.emoji!, style: const TextStyle(fontSize: 28)),
            if (option.emoji != null) const SizedBox(width: 12),
            // Name + info
            Expanded(
              child: Text(
                _localized(option.name),
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: isLocked && !isSelected
                      ? AppColors.textSecondary
                      : AppColors.textPrimary,
                ),
              ),
            ),
            // Fan % bar
            if (option.fanPct > 0) ...[
              SizedBox(
                width: 40,
                child: Column(
                  children: [
                    Text(
                      '${option.fanPct}%',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: LinearProgressIndicator(
                        value: option.fanPct / 100,
                        minHeight: 3,
                        backgroundColor: AppColors.divider,
                        valueColor: const AlwaysStoppedAnimation(AppColors.blue),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
            ],
            // Multiplier badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.amber.withOpacity(0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                'x${option.multiplier.toStringAsFixed(1)}',
                style: const TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  color: AppColors.amber,
                  fontSize: 16,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
