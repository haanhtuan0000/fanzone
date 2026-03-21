import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../providers/auth_provider.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  int _step = 0;
  String _selectedEmoji = '⚽';
  final _nameController = TextEditingController();

  final _avatarEmojis = ['⚽', '🦁', '🐯', '🦅', '🐺', '🔥', '⭐', '👑', '🎯', '💎', '🏆', '⚡'];

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _nextStep() {
    if (_step < 2) {
      setState(() => _step++);
    } else {
      ref.read(authStateProvider.notifier).completeOnboarding();
      context.go('/live');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              // Progress indicator
              Row(
                children: List.generate(3, (i) {
                  return Expanded(
                    child: Container(
                      height: 4,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        color: i <= _step ? AppColors.neonGreen : AppColors.cardSurface,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 48),
              Expanded(
                child: AnimatedSwitcher(
                  duration: AppDurations.normal,
                  child: _buildStep(),
                ),
              ),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _nextStep,
                  child: Text(
                    _step < 2 ? 'TIEP TUC' : 'BAT DAU CHOI',
                    style: const TextStyle(letterSpacing: 2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStep() {
    switch (_step) {
      case 0:
        return _buildAvatarStep();
      case 1:
        return _buildNameStep();
      case 2:
        return _buildTutorialStep();
      default:
        return const SizedBox();
    }
  }

  Widget _buildAvatarStep() {
    return Column(
      key: const ValueKey(0),
      children: [
        const Text(
          'CHON AVATAR',
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: 36,
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Chon bieu tuong dai dien cho ban',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 16),
        ),
        const SizedBox(height: 32),
        // Selected avatar large
        Container(
          width: 100,
          height: 100,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.neonGreen, width: 3),
            boxShadow: [
              BoxShadow(
                color: AppColors.neonGreen.withOpacity(0.3),
                blurRadius: 20,
              ),
            ],
            color: AppColors.cardSurface,
          ),
          child: Center(
            child: Text(_selectedEmoji, style: const TextStyle(fontSize: 48)),
          ),
        ),
        const SizedBox(height: 32),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          alignment: WrapAlignment.center,
          children: _avatarEmojis.map((emoji) {
            final isSelected = emoji == _selectedEmoji;
            return GestureDetector(
              onTap: () => setState(() => _selectedEmoji = emoji),
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isSelected ? AppColors.neonGreen.withOpacity(0.2) : AppColors.cardSurface,
                  border: Border.all(
                    color: isSelected ? AppColors.neonGreen : AppColors.divider,
                    width: isSelected ? 2 : 1,
                  ),
                ),
                child: Center(
                  child: Text(emoji, style: const TextStyle(fontSize: 28)),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildNameStep() {
    return Column(
      key: const ValueKey(1),
      children: [
        const Text(
          'TEN CUA BAN',
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: 36,
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Ten se hien thi tren bang xep hang',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 16),
        ),
        const SizedBox(height: 32),
        TextFormField(
          controller: _nameController,
          decoration: const InputDecoration(
            hintText: 'Nhap ten hien thi',
            prefixIcon: Icon(Icons.edit, color: AppColors.textSecondary),
          ),
          style: const TextStyle(color: AppColors.textPrimary, fontSize: 18),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildTutorialStep() {
    return Column(
      key: const ValueKey(2),
      children: [
        const Text(
          'CACH CHOI',
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: 36,
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 32),
        _buildTutorialItem(
          Icons.sports_soccer,
          AppColors.neonGreen,
          'Du doan su kien',
          'Tra loi cau hoi ve cac su kien trong tran dau',
        ),
        const SizedBox(height: 24),
        _buildTutorialItem(
          Icons.monetization_on,
          AppColors.amber,
          'Nhan coins',
          'Du doan dung de nhan coins va tang hang',
        ),
        const SizedBox(height: 24),
        _buildTutorialItem(
          Icons.emoji_events,
          AppColors.blue,
          'Leo bang xep hang',
          'Canh tranh voi fan khac tren toan cau',
        ),
      ],
    );
  }

  Widget _buildTutorialItem(IconData icon, Color color, String title, String desc) {
    return Row(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: color.withOpacity(0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color, size: 28),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                desc,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
