import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
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
    final str = AppStrings.current;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: sa(context, 24),
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
              SizedBox(height: s(context, 48)),
              Expanded(
                child: AnimatedSwitcher(
                  duration: AppDurations.normal,
                  child: _buildStep(),
                ),
              ),
              SizedBox(
                width: double.infinity,
                height: s(context, 52),
                child: ElevatedButton(
                  onPressed: _isSaving ? null : _nextStep,
                  child: _isSaving
                      ? SizedBox(
                          height: s(context, 20),
                          width: s(context, 20),
                          child: const CircularProgressIndicator(strokeWidth: 2, color: AppColors.background),
                        )
                      : Text(
                          _step < _totalSteps - 1 ? str.continueBtn : str.letsGo,
                          style: const TextStyle(letterSpacing: 2),
                        ),
                ),
              ),
              SizedBox(height: s(context, 16)),
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
    final str = AppStrings.current;
    return Column(
      key: const ValueKey('team'),
      children: [
        Text(
          str.chooseTeam,
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: sf(context, 36),
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          str.chooseTeamDesc,
          style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 16)),
        ),
        SizedBox(height: s(context, 32)),
        Expanded(
          child: GridView.builder(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: s(context, 12),
              crossAxisSpacing: s(context, 12),
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
                        style: TextStyle(fontSize: sf(context, 28)),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        team['name'] as String,
                        style: TextStyle(
                          color: isSelected ? AppColors.neonGreen : AppColors.textPrimary,
                          fontSize: sf(context, 12),
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
    final str = AppStrings.current;
    return Column(
      key: const ValueKey('avatar'),
      children: [
        Text(
          str.chooseAvatar,
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: sf(context, 36),
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          str.chooseAvatarDesc,
          style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 16)),
        ),
        SizedBox(height: s(context, 32)),
        // Selected avatar large
        Container(
          width: s(context, 100),
          height: s(context, 100),
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
            child: Text(_selectedEmoji, style: TextStyle(fontSize: sf(context, 48))),
          ),
        ),
        SizedBox(height: s(context, 32)),
        Wrap(
          spacing: s(context, 12),
          runSpacing: s(context, 12),
          alignment: WrapAlignment.center,
          children: _avatarEmojis.map((emoji) {
            final isSelected = emoji == _selectedEmoji;
            return GestureDetector(
              onTap: () => setState(() => _selectedEmoji = emoji),
              child: Container(
                width: s(context, 56),
                height: s(context, 56),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isSelected ? AppColors.neonGreen.withOpacity(0.2) : AppColors.cardSurface,
                  border: Border.all(
                    color: isSelected ? AppColors.neonGreen : AppColors.divider,
                    width: isSelected ? 2 : 1,
                  ),
                ),
                child: Center(
                  child: Text(emoji, style: TextStyle(fontSize: sf(context, 28))),
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
    final str = AppStrings.current;
    return Column(
      key: const ValueKey('name'),
      children: [
        Text(
          str.yourName,
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: sf(context, 36),
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          str.nameOnLeaderboard,
          style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 16)),
        ),
        SizedBox(height: s(context, 32)),
        TextFormField(
          controller: _nameController,
          decoration: InputDecoration(
            hintText: str.enterDisplayName,
            prefixIcon: const Icon(Icons.edit, color: AppColors.textSecondary),
          ),
          style: TextStyle(color: AppColors.textPrimary, fontSize: sf(context, 18)),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  // Step 3: Tutorial preview
  Widget _buildTutorialStep() {
    final str = AppStrings.current;
    return Column(
      key: const ValueKey('tutorial'),
      children: [
        Text(
          str.howToPlay,
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: sf(context, 36),
            color: AppColors.textPrimary,
            letterSpacing: 2,
          ),
        ),
        SizedBox(height: s(context, 32)),
        _buildTutorialItem(
          Icons.sports_soccer,
          AppColors.neonGreen,
          str.tutStep1,
          str.tutStep1Desc,
        ),
        SizedBox(height: s(context, 24)),
        _buildTutorialItem(
          Icons.touch_app,
          AppColors.amber,
          str.tutStep2,
          str.tutStep2Desc,
        ),
        SizedBox(height: s(context, 24)),
        _buildTutorialItem(
          Icons.emoji_events,
          AppColors.blue,
          str.tutStep3,
          str.tutStep3Desc,
        ),
      ],
    );
  }

  Widget _buildTutorialItem(IconData icon, Color color, String title, String desc) {
    return Row(
      children: [
        Container(
          width: s(context, 56),
          height: s(context, 56),
          decoration: BoxDecoration(
            color: color.withOpacity(0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color, size: s(context, 28)),
        ),
        SizedBox(width: s(context, 16)),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: sf(context, 18),
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                desc,
                style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 14)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
