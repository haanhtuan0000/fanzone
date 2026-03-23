import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/question.dart';

class QuestionQueue extends StatelessWidget {
  final List<Question> questions;
  const QuestionQueue({super.key, required this.questions});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          AppStrings.current.upcoming,
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: 16,
            color: AppColors.textSecondary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        ...questions.take(3).map((q) {
          return Opacity(
            opacity: 0.5,
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.cardSurface,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    q.category == 'GOAL' ? Icons.sports_soccer
                        : q.category == 'CARD' ? Icons.square
                        : q.category == 'VAR' ? Icons.videocam
                        : Icons.flag,
                    color: AppColors.textSecondary,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      q.text,
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    '${q.rewardCoins}',
                    style: const TextStyle(
                      color: AppColors.amber,
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}
