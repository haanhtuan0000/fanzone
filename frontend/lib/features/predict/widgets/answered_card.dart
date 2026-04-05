import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/question.dart';
import '../providers/predict_provider.dart';

String _localized(String text) {
  final parts = text.split('|');
  if (parts.length == 2) {
    return identical(AppStrings.current, AppStrings.en) ? parts[0].trim() : parts[1].trim();
  }
  return text;
}

class AnsweredCard extends StatelessWidget {
  final AnsweredQuestion answered;
  final int index;

  const AnsweredCard({super.key, required this.answered, required this.index});

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    final q = answered.question;
    final status = answered.status;
    final isSkip = status == 'skip';
    final isVoided = status == 'voided';

    return Opacity(
      opacity: isSkip ? 0.5 : 0.85,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: _borderColor(status),
            width: 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: _headerBgColor(status),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
                border: Border(bottom: BorderSide(color: _headerBorderColor(status))),
              ),
              child: Row(
                children: [
                  _buildNumberBadge(index, status),
                  const SizedBox(width: 8),
                  Text(
                    _categoryLabel(q.category),
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 10,
                      color: AppColors.textSecondary,
                      letterSpacing: 1.5,
                    ),
                  ),
                  const Spacer(),
                  _buildStatusChip(status),
                ],
              ),
            ),
            // Body
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _localized(q.text),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 7),
                  // Show user's pick
                  if (answered.myPickOptionId != null) ...[
                    _buildOptionRow(q, answered.myPickOptionId!, status, true),
                  ],
                  // Show correct answer if wrong
                  if (status == 'wrong' && q.correctOptionId != null &&
                      q.correctOptionId != answered.myPickOptionId)
                    _buildOptionRow(q, q.correctOptionId!, 'answer', false),
                  // Show correct answer for skipped
                  if (isSkip && q.correctOptionId != null)
                    _buildOptionRow(q, q.correctOptionId!, 'answer', false),
                  // Lock message
                  if (status == 'pending')
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        s.lockedMessage,
                        style: TextStyle(fontSize: 10, color: AppColors.textSecondary),
                      ),
                    ),
                  if (isVoided)
                    Container(
                      margin: const EdgeInsets.only(top: 5),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      alignment: Alignment.centerRight,
                      decoration: BoxDecoration(
                        color: AppColors.blue.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'VOIDED',
                        style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 11, color: AppColors.blue),
                      ),
                    ),
                  if (isSkip)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        s.skippedMessage,
                        style: TextStyle(fontSize: 10, color: AppColors.textSecondary),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNumberBadge(int num, String status) {
    Color bg, fg, border;
    switch (status) {
      case 'correct':
        bg = AppColors.neonGreen.withOpacity(0.12);
        fg = AppColors.neonGreen;
        border = AppColors.neonGreen.withOpacity(0.3);
        break;
      case 'wrong':
        bg = AppColors.red.withOpacity(0.12);
        fg = AppColors.red;
        border = AppColors.red.withOpacity(0.3);
        break;
      case 'pending':
        bg = AppColors.amber.withOpacity(0.12);
        fg = AppColors.amber;
        border = AppColors.amber.withOpacity(0.3);
        break;
      case 'voided':
        bg = AppColors.blue.withOpacity(0.12);
        fg = AppColors.blue;
        border = AppColors.blue.withOpacity(0.3);
        break;
      default:
        bg = AppColors.textSecondary.withOpacity(0.07);
        fg = AppColors.textSecondary;
        border = AppColors.divider;
    }
    return Container(
      width: 20, height: 20,
      decoration: BoxDecoration(
        shape: BoxShape.circle, color: bg,
        border: Border.all(color: border),
      ),
      alignment: Alignment.center,
      child: Text('$num', style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 10, color: fg)),
    );
  }

  Widget _buildStatusChip(String status) {
    final s = AppStrings.current;
    String text;
    Color color;
    switch (status) {
      case 'correct':
        text = '${s.correctStatus} +10 XP';
        color = AppColors.neonGreen;
        break;
      case 'wrong':
        text = '${s.wrongStatus} +2 XP';
        color = AppColors.red;
        break;
      case 'pending':
        text = s.pendingStatus;
        color = AppColors.amber;
        break;
      case 'voided':
        text = 'VOIDED';
        color = AppColors.blue;
        break;
      default:
        text = s.skippedStatus;
        color = AppColors.textSecondary;
    }
    return Text(
      text,
      style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 10, color: color, letterSpacing: 1),
    );
  }

  Widget _buildOptionRow(Question q, String optionId, String status, bool isMyPick) {
    final option = q.options.firstWhere((o) => o.id == optionId, orElse: () => q.options.first);
    Color borderColor, bgColor;

    if (isMyPick && status == 'correct') {
      borderColor = AppColors.neonGreen.withOpacity(0.4);
      bgColor = AppColors.neonGreen.withOpacity(0.04);
    } else if (isMyPick && status == 'wrong') {
      borderColor = AppColors.red.withOpacity(0.35);
      bgColor = AppColors.red.withOpacity(0.04);
    } else if (isMyPick && status == 'pending') {
      borderColor = AppColors.amber.withOpacity(0.3);
      bgColor = AppColors.amber.withOpacity(0.04);
    } else if (status == 'answer') {
      borderColor = AppColors.neonGreen.withOpacity(0.25);
      bgColor = AppColors.neonGreen.withOpacity(0.03);
    } else {
      borderColor = AppColors.divider;
      bgColor = Colors.white.withOpacity(0.02);
    }

    // Fill bar color
    Color fillColor;
    if (status == 'answer' || (isMyPick && status == 'correct')) {
      fillColor = AppColors.neonGreen;
    } else if (isMyPick && status == 'wrong') {
      fillColor = AppColors.red;
    } else if (isMyPick && status == 'pending') {
      fillColor = AppColors.amber;
    } else {
      fillColor = AppColors.textSecondary;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: borderColor),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: Stack(
          children: [
            // Fill bar background
            Positioned.fill(
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: (option.fanPct / 100).clamp(0.0, 1.0),
                child: Container(color: fillColor.withOpacity(0.15)),
              ),
            ),
            // Content
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                children: [
                  if (option.emoji != null) Text(option.emoji!, style: const TextStyle(fontSize: 14)),
                  if (option.emoji != null) const SizedBox(width: 8),
                  Expanded(
                    child: Text(_localized(option.name), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                  ),
                  Text('${option.fanPct}%', style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 12, color: AppColors.textSecondary)),
                  const SizedBox(width: 6),
                  if (isMyPick) _buildTag(status == 'pending' ? AppStrings.current.myPick : (status == 'correct' ? AppStrings.current.correctPick : AppStrings.current.wrongPick), status),
                  if (!isMyPick && status == 'answer') _buildTag(AppStrings.current.answerTag, 'answer'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTag(String text, String status) {
    Color bg, fg;
    switch (status) {
      case 'correct': bg = AppColors.neonGreen.withOpacity(0.2); fg = AppColors.neonGreen; break;
      case 'wrong': bg = AppColors.red.withOpacity(0.18); fg = AppColors.red; break;
      case 'pending': bg = AppColors.amber.withOpacity(0.2); fg = AppColors.amber; break;
      default: bg = AppColors.neonGreen.withOpacity(0.15); fg = AppColors.neonGreen;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(4)),
      child: Text(text, style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 9, color: fg, letterSpacing: 0.5)),
    );
  }

  Widget _buildCoinsResult(int coins, String status) {
    final s = AppStrings.current;
    final isWin = status == 'correct';
    return Container(
      margin: const EdgeInsets.only(top: 5),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      alignment: Alignment.centerRight,
      decoration: BoxDecoration(
        color: isWin ? AppColors.neonGreen.withOpacity(0.1) : AppColors.red.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        isWin ? s.correctBonus(coins) : '$coins',
        style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 11, color: isWin ? AppColors.neonGreen : AppColors.red),
      ),
    );
  }

  Color _borderColor(String status) {
    switch (status) {
      case 'correct': return AppColors.neonGreen.withOpacity(0.2);
      case 'wrong': return AppColors.red.withOpacity(0.2);
      case 'pending': return AppColors.amber.withOpacity(0.15);
      case 'voided': return AppColors.blue.withOpacity(0.2);
      default: return AppColors.divider;
    }
  }

  Color _headerBgColor(String status) {
    switch (status) {
      case 'correct': return AppColors.neonGreen.withOpacity(0.05);
      case 'wrong': return AppColors.red.withOpacity(0.05);
      case 'pending': return AppColors.amber.withOpacity(0.05);
      case 'voided': return AppColors.blue.withOpacity(0.05);
      default: return Colors.transparent;
    }
  }

  Color _headerBorderColor(String status) {
    switch (status) {
      case 'correct': return AppColors.neonGreen.withOpacity(0.12);
      case 'wrong': return AppColors.red.withOpacity(0.12);
      case 'pending': return AppColors.amber.withOpacity(0.12);
      case 'voided': return AppColors.blue.withOpacity(0.12);
      default: return AppColors.divider;
    }
  }

  String _categoryLabel(String category) {
    final s = AppStrings.current;
    switch (category) {
      case 'GOAL': return s.categoryGoal;
      case 'CARD': return s.categoryCard;
      case 'CORNER': return s.categoryCorner;
      case 'VAR': return s.categoryVar;
      case 'SUB': return s.categorySub;
      case 'TIME': return s.categoryTime;
      case 'STAT': return s.categoryStat;
      case 'MOMENTUM': return s.categoryMomentum;
      default: return category;
    }
  }
}
