String timeAgo(DateTime dateTime) {
  final now = DateTime.now();
  final diff = now.difference(dateTime);

  if (diff.inSeconds < 30) return 'Vua xong';
  if (diff.inMinutes < 1) return '${diff.inSeconds}s truoc';
  if (diff.inMinutes < 60) return '${diff.inMinutes} phut truoc';
  if (diff.inHours < 24) return '${diff.inHours} gio truoc';
  if (diff.inDays < 7) return '${diff.inDays} ngay truoc';
  return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
}
