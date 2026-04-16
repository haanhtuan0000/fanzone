import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../app/constants.dart';
import '../../app/responsive.dart';
import '../../core/l10n/app_strings.dart';

class ScaffoldWithNav extends StatelessWidget {
  final Widget child;
  const ScaffoldWithNav({super.key, required this.child});

  int _getCurrentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    switch (location) {
      case '/live': return 0;
      case '/predict': return 1;
      case '/leaderboard': return 2;
      case '/feed': return 3;
      case '/profile': return 4;
      default: return 0;
    }
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0: context.go('/live');
      case 1: context.go('/predict');
      case 2: context.go('/leaderboard');
      case 3: context.go('/feed');
      case 4: context.go('/profile');
    }
  }

  @override
  Widget build(BuildContext context) {
    final str = AppStrings.current;
    final currentIndex = _getCurrentIndex(context);

    return BackButtonListener(
      onBackButtonPressed: () async {
        if (currentIndex != 0) {
          context.go('/live');
          return true; // handled, don't pop
        }
        return false; // let system handle (exit app)
      },
      child: Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.cardSurface,
          border: Border(top: BorderSide(color: AppColors.divider, width: 0.5)),
        ),
        child: SafeArea(
          child: SizedBox(
            height: AppSizes.bottomNavHeight,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _NavItem(
                  activeSvg: 'assets/svg/tabs/live_active.svg',
                  inactiveSvg: 'assets/svg/tabs/live_inactive.svg',
                  label: str.navLive,
                  isActive: currentIndex == 0,
                  onTap: () => _onTap(context, 0),
                ),
                _NavItem(
                  activeSvg: 'assets/svg/tabs/predict_active.svg',
                  inactiveSvg: 'assets/svg/tabs/predict_inactive.svg',
                  label: str.navPredict,
                  isActive: currentIndex == 1,
                  onTap: () => _onTap(context, 1),
                ),
                _NavItem(
                  activeSvg: 'assets/svg/tabs/leaderboard_active.svg',
                  inactiveSvg: 'assets/svg/tabs/leaderboard_inactive.svg',
                  label: str.navLeaderboard,
                  isActive: currentIndex == 2,
                  onTap: () => _onTap(context, 2),
                ),
                _NavItem(
                  activeSvg: 'assets/svg/tabs/feed_active.svg',
                  inactiveSvg: 'assets/svg/tabs/feed_inactive.svg',
                  label: str.navFeed,
                  isActive: currentIndex == 3,
                  onTap: () => _onTap(context, 3),
                ),
                _NavItem(
                  activeSvg: 'assets/svg/tabs/profile_active.svg',
                  inactiveSvg: 'assets/svg/tabs/profile_inactive.svg',
                  label: str.navProfile,
                  isActive: currentIndex == 4,
                  onTap: () => _onTap(context, 4),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final String activeSvg;
  final String inactiveSvg;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _NavItem({
    required this.activeSvg,
    required this.inactiveSvg,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: s(context, 64),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SvgPicture.asset(
              isActive ? activeSvg : inactiveSvg,
              width: s(context, 24),
              height: s(context, 24),
              colorFilter: ColorFilter.mode(
                isActive ? AppColors.neonGreen : AppColors.textSecondary,
                BlendMode.srcIn,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: sf(context, 11),
                color: isActive ? AppColors.neonGreen : AppColors.textSecondary,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
