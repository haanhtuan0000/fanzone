import 'package:flutter/material.dart';
import '../../app/constants.dart';

class ErrorRetry extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const ErrorRetry({
    super.key,
    this.message = 'Da xay ra loi',
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, color: AppColors.red, size: 48),
          const SizedBox(height: 16),
          Text(
            message,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Thu lai'),
          ),
        ],
      ),
    );
  }
}
