import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../live/providers/live_provider.dart';
import '../providers/feed_provider.dart';
import '../widgets/online_counter.dart';
import '../widgets/feed_card_correct.dart';
import '../widgets/feed_card_wrong.dart';
import '../widgets/feed_card_rank.dart';
import '../../../core/l10n/app_strings.dart';
import '../widgets/feed_card_system.dart';
import '../../leaderboard/widgets/mini_profile_modal.dart';

class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final _scrollController = ScrollController();
  int _newEventCount = 0;
  bool _isAtTop = true;
  int _lastEventCount = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    final atTop = _scrollController.offset < 50;
    if (atTop != _isAtTop) {
      setState(() {
        _isAtTop = atTop;
        if (atTop) _newEventCount = 0;
      });
    }
  }

  void _scrollToTop() {
    _scrollController.animateTo(0,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
    setState(() => _newEventCount = 0);
  }

  @override
  Widget build(BuildContext context) {
    final str = AppStrings.current;
    final feedState = ref.watch(feedStateProvider);
    final liveState = ref.watch(liveStateProvider);

    // Track new events arriving while scrolled down
    if (feedState.events.length > _lastEventCount && !_isAtTop && _lastEventCount > 0) {
      _newEventCount += feedState.events.length - _lastEventCount;
    }
    _lastEventCount = feedState.events.length;

    // Auto-scroll if at top
    if (_isAtTop && feedState.events.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients && _scrollController.offset < 10) {
          _scrollController.jumpTo(0);
        }
      });
    }

    return Scaffold(
      appBar: AppBar(title: Text(str.activity)),
      body: Stack(
        children: [
          Column(
            children: [
              if (liveState.liveMatches.isNotEmpty)
                OnlineCounter(count: liveState.liveMatches.length),
              Expanded(
                child: feedState.isLoading && feedState.events.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : feedState.events.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.local_fire_department, size: s(context, 64),
                                    color: AppColors.textSecondary.withOpacity(0.5)),
                                SizedBox(height: s(context, 16)),
                                Text(
                                  str.noActivity,
                                  style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 16)),
                                ),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: () async {
                              final match = liveState.activeMatch;
                              if (match != null) {
                                await ref.read(feedStateProvider.notifier).loadFeed(match.fixtureId);
                              }
                            },
                            child: ListView.builder(
                              controller: _scrollController,
                              padding: sa(context, 16),
                              itemCount: feedState.events.length,
                              itemBuilder: (context, index) {
                                final event = feedState.events[index];
                                switch (event.type) {
                                  case 'CORRECT':
                                    return GestureDetector(
                                      onTap: () => _onTapUserCard(event.userId, event.userDisplayName, event.userAvatarEmoji),
                                      child: FeedCardCorrect(event: event),
                                    );
                                  case 'WRONG':
                                    return GestureDetector(
                                      onTap: () => _onTapUserCard(event.userId, event.userDisplayName, event.userAvatarEmoji),
                                      child: FeedCardWrong(event: event),
                                    );
                                  case 'RANK_CHANGE':
                                    return GestureDetector(
                                      onTap: () => context.go('/leaderboard'),
                                      child: FeedCardRank(event: event),
                                    );
                                  case 'SYSTEM':
                                  default:
                                    return GestureDetector(
                                      onTap: () => context.go('/predict'),
                                      child: FeedCardSystem(event: event),
                                    );
                                }
                              },
                            ),
                          ),
              ),
            ],
          ),
          // "New events" banner
          if (_newEventCount > 0 && !_isAtTop)
            Positioned(
              top: liveState.liveMatches.isNotEmpty ? 52 : 0,
              left: 0, right: 0,
              child: GestureDetector(
                onTap: _scrollToTop,
                child: Container(
                  margin: sp(context, h: 48),
                  padding: sp(context, h: 16, v: 8),
                  decoration: BoxDecoration(
                    color: AppColors.neonGreen,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [BoxShadow(color: AppColors.neonGreen.withOpacity(0.3), blurRadius: 8)],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.arrow_upward, color: AppColors.background, size: 16),
                      const SizedBox(width: 6),
                      Text(
                        '$_newEventCount new events',
                        style: TextStyle(color: AppColors.background, fontWeight: FontWeight.w600, fontSize: sf(context, 13)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _onTapUserCard(String? userId, String? displayName, String? avatarEmoji) {
    if (displayName == null) return;
    MiniProfileModal.show(
      context,
      displayName: displayName,
      avatarEmoji: avatarEmoji ?? '⚽',
    );
  }
}
