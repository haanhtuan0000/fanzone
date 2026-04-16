import '../../core/l10n/app_strings.dart';

String timeAgo(DateTime dateTime) {
  final s = AppStrings.current;
  final now = DateTime.now();
  final diff = now.difference(dateTime);

  if (diff.inSeconds < 30) return s.justNow;
  if (diff.inMinutes < 1) return s.secondsAgo(diff.inSeconds);
  if (diff.inMinutes < 60) return s.minutesAgo(diff.inMinutes);
  if (diff.inHours < 24) return s.hoursAgo(diff.inHours);
  if (diff.inDays < 7) return s.daysAgo(diff.inDays);
  final local = dateTime.toLocal();
  return '${local.day}/${local.month}/${local.year}';
}
