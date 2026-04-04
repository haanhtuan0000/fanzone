import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../providers/auth_provider.dart';

const _avatarEmojis = ['⚽', '🦁', '🐯', '🦅', '🐺', '🔥', '⭐', '👑', '🎯', '💎', '🏆', '⚡'];

const _popularTeams = [
  {'id': 50, 'name': 'Man City', 'emoji': '🔵'},
  {'id': 33, 'name': 'Man United', 'emoji': '🔴'},
  {'id': 40, 'name': 'Liverpool', 'emoji': '🔴'},
  {'id': 42, 'name': 'Arsenal', 'emoji': '🔴'},
  {'id': 49, 'name': 'Chelsea', 'emoji': '🔵'},
  {'id': 157, 'name': 'Bayern', 'emoji': '🔴'},
  {'id': 529, 'name': 'Barcelona', 'emoji': '🔵'},
  {'id': 541, 'name': 'Real Madrid', 'emoji': '⚪'},
  {'id': 489, 'name': 'AC Milan', 'emoji': '🔴'},
  {'id': 496, 'name': 'Juventus', 'emoji': '⚪'},
  {'id': 85, 'name': 'PSG', 'emoji': '🔵'},
  {'id': 505, 'name': 'Inter', 'emoji': '🔵'},
];

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  static const _totalSteps = 4;
  int _step = 0;
  String _selectedEmoji = '⚽';
  int? _selectedTeamId;
  final _nameController = TextEditingController();
  bool _isSaving = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _nextStep() async {
    if (_step < _totalSteps - 1) {
      setState(() => _step++);
    } else {
      // Final step — persist profile and complete onboarding
      setState(() => _isSaving = true);
      try {
        final apiClient = ref.read(apiClientProvider);
        final data = <String, dynamic>{
          'avatarEmoji': _selectedEmoji,
        };
        if (_nameController.text.trim().isNotEmpty) {
          data['displayName'] = _nameController.text.trim();
        }
        if (_selectedTeamId != null) {
          data['favoriteTeamId'] = _selectedTeamId;
        }
        await apiClient.put(ApiEndpoints.profileMe, data: data);
      } catch (_) {
        // Best-effort — don't block onboarding
      }
      setState(() => _isSaving = false);
      ref.read(authStateProvider.notifier).completeOnboarding();
      if (mounted) context.go('/live');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              // Progress indicator
              Row(
                children: List.generate(_totalSteps, (i) {
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
                  onPressed: _isSaving ? null : _nextStep,
                  child: _isSaving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.background),
                        )
                      : Text(
                          _step < _totalSteps - 1 ? s.continueBtn : s.letsGo,
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
        return _buildTeamStep();
      case 1:
        return _buildAvatarStep();
      case 2:
        return _buildNameStep();
      case 3:
        return _buildTutorialStep();
      default:
        return const SizedBox();
    }
  }

  // Step 0: Choose favorite team
  Widget _buildTeamStep() {
    final s = AppStrings.current;
    return Column(
      key: const ValueKey('team'),
      children: [
        Text(
          s.chooseTeam,
          style: const TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: 36,
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          s.chooseTeamDesc,
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
        ),
        const SizedBox(height: 32),
        Expanded(
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1,
            ),
            itemCount: _popularTeams.length,
            itemBuilder: (context, index) {
              final team = _popularTeams[index];
              final teamId = team['id'] as int;
              final isSelected = _selectedTeamId == teamId;

              return GestureDetector(
                onTap: () => setState(() => _selectedTeamId = teamId),
                child: Container(
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.neonGreen.withOpacity(0.15) : AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(12),
                    border: isSelected
                        ? Border.all(color: AppColors.neonGreen, width: 2)
                        : Border.all(color: AppColors.divider, width: 1),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        team['emoji'] as String,
                        style: const TextStyle(fontSize: 28),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        team['name'] as String,
                        style: TextStyle(
                          color: isSelected ? AppColors.neonGreen : AppColors.textPrimary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // Step 1: Choose avatar
  Widget _buildAvatarStep() {
    final s = AppStrings.current;
    return Column(
      key: const ValueKey('avatar'),
      children: [
        Text(
          s.chooseAvatar,
          style: const TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: 36,
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          s.chooseAvatarDesc,
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
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

  // Step 2: Set display name
  Widget _buildNameStep() {
    final s = AppStrings.current;
    return Column(
      key: const ValueKey('name'),
      children: [
        Text(
          s.yourName,
          style: const TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: 36,
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          s.nameOnLeaderboard,
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
        ),
        const SizedBox(height: 32),
        TextFormField(
          controller: _nameController,
          decoration: InputDecoration(
            hintText: s.enterDisplayName,
            prefixIcon: const Icon(Icons.edit, color: AppColors.textSecondary),
          ),
          style: const TextStyle(color: AppColors.textPrimary, fontSize: 18),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  // Step 3: Tutorial preview
  Widget _buildTutorialStep() {
    final s = AppStrings.current;
    return Column(
      key: const ValueKey('tutorial'),
      children: [
        Text(
          s.howToPlay,
          style: const TextStyle(
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
          s.tutStep1,
          s.tutStep1Desc,
        ),
        const SizedBox(height: 24),
        _buildTutorialItem(
          Icons.touch_app,
          AppColors.amber,
          s.tutStep2,
          s.tutStep2Desc,
        ),
        const SizedBox(height: 24),
        _buildTutorialItem(
          Icons.emoji_events,
          AppColors.blue,
          s.tutStep3,
          s.tutStep3Desc,
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
