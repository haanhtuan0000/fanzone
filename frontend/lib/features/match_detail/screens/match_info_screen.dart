import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/match.dart';
import '../providers/fan_vote_provider.dart';

class MatchInfoScreen extends ConsumerStatefulWidget {
  final int fixtureId;
  final MatchData? match;

  const MatchInfoScreen({super.key, required this.fixtureId, this.match});

  @override
  ConsumerState<MatchInfoScreen> createState() => _MatchInfoScreenState();
}

class _MatchInfoScreenState extends ConsumerState<MatchInfoScreen> {
  Timer? _countdownTimer;
  Duration _remaining = Duration.zero;
  bool _reminderSet = false;

  @override
  void initState() {
    super.initState();
    _updateCountdown();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) => _updateCountdown());
    // Load fan votes
    Future.microtask(() {
      ref.read(fanVoteProvider.notifier).load(widget.fixtureId);
    });
  }

  void _updateCountdown() {
    final kickoff = widget.match?.kickoffTime;
    if (kickoff == null) return;
    final diff = kickoff.difference(DateTime.now());
    setState(() => _remaining = diff.isNegative ? Duration.zero : diff);
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final str = AppStrings.current;
    final m = widget.match;
    final voteState = ref.watch(fanVoteProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(str.matchInfo),
        actions: [
          if (m?.kickoffTime != null)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Container(
                padding: sp(context, h: 10, v: 4),
                decoration: BoxDecoration(
                  color: AppColors.amber.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppColors.amber.withOpacity(0.22)),
                ),
                child: Text(
                  _formatTime(m!.kickoffTime!),
                  style: TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: sf(context, 10),
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: AppColors.amber,
                  ),
                ),
              ),
            ),
        ],
      ),
      body: m == null
          ? const Center(child: Text('No match data', style: TextStyle(color: AppColors.textSecondary)))
          : SingleChildScrollView(
              padding: sa(context, 14),
              child: Column(
                children: [
                  // Teams card
                  _teamsCard(context, m, str),
                  SizedBox(height: s(context, 12)),

                  // Countdown to kickoff
                  if (m.kickoffTime != null && _remaining.inSeconds > 0)
                    _countdownWidget(context),
                  if (m.kickoffTime != null && _remaining.inSeconds > 0)
                    SizedBox(height: s(context, 12)),

                  // Reminder button
                  _reminderButton(context, str),
                  SizedBox(height: s(context, 12)),

                  // Fan vote card
                  _fanVoteCard(context, m, voteState, str),
                  SizedBox(height: s(context, 12)),

                  // H2H row
                  _h2hRow(context, m, str),
                  SizedBox(height: s(context, 24)),
                ],
              ),
            ),
    );
  }

  // ─── Teams Card ───

  Widget _teamsCard(BuildContext context, MatchData m, dynamic str) {
    return Container(
      padding: sa(context, 18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment(-1, -0.5),
          end: Alignment(1, 1),
          colors: [Color(0xFF0a1220), Color(0xFF08081a)],
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: _teamCol(context, m.homeLogoUrl, m.homeTeam)),
              Text('VS',
                style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 36),
                  letterSpacing: 3, color: AppColors.textSecondary)),
              Expanded(child: _teamCol(context, m.awayLogoUrl, m.awayTeam)),
            ],
          ),
          SizedBox(height: s(context, 10)),
          // League info
          Text(
            [m.league, m.leagueRound].where((e) => e != null).join(' \u00b7 '),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: sf(context, 10), letterSpacing: 0.5,
              color: AppColors.textSecondary.withOpacity(0.4),
              fontFamily: AppFonts.barlowCondensed),
          ),
        ],
      ),
    );
  }

  Widget _teamCol(BuildContext context, String? logoUrl, String name) {
    return Column(
      children: [
        if (logoUrl != null)
          CachedNetworkImage(imageUrl: logoUrl, width: s(context, 48), height: s(context, 48),
            errorWidget: (_, __, ___) => Text('⚽', style: TextStyle(fontSize: sf(context, 32))))
        else
          Text('⚽', style: TextStyle(fontSize: sf(context, 32))),
        const SizedBox(height: 5),
        Text(name,
          textAlign: TextAlign.center,
          overflow: TextOverflow.ellipsis,
          maxLines: 2,
          style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 14),
            fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
      ],
    );
  }

  // ─── Countdown ───

  Widget _countdownWidget(BuildContext context) {
    final h = _remaining.inHours.toString().padLeft(2, '0');
    final m = (_remaining.inMinutes % 60).toString().padLeft(2, '0');
    final sec = (_remaining.inSeconds % 60).toString().padLeft(2, '0');

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _cdUnit(context, h, AppStrings.current.hours),
        Padding(
          padding: sp(context, h: 6),
          child: Text(':', style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 28), color: AppColors.amber)),
        ),
        _cdUnit(context, m, AppStrings.current.minutes),
        Padding(
          padding: sp(context, h: 6),
          child: Text(':', style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 28), color: AppColors.amber)),
        ),
        _cdUnit(context, sec, AppStrings.current.seconds),
      ],
    );
  }

  Widget _cdUnit(BuildContext context, String value, String label) {
    return Container(
      padding: sp(context, h: 14, v: 8),
      decoration: BoxDecoration(
        color: AppColors.amber.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.amber.withOpacity(0.15)),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 28), color: AppColors.amber)),
          Text(label, style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 9),
            fontWeight: FontWeight.w600, letterSpacing: 0.5, color: AppColors.textSecondary.withOpacity(0.5))),
        ],
      ),
    );
  }

  // ─── Reminder ───

  Widget _reminderButton(BuildContext context, dynamic str) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: () {
          setState(() => _reminderSet = !_reminderSet);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(_reminderSet ? '🔔 ${str.reminderSet}' : '🔕 Reminder cancelled'),
              backgroundColor: AppColors.amber.withOpacity(0.9),
              duration: const Duration(seconds: 2),
            ),
          );
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: _reminderSet ? Colors.transparent : AppColors.amber,
          foregroundColor: _reminderSet ? AppColors.amber : Colors.black,
          padding: sp(context, v: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(11),
            side: _reminderSet ? BorderSide(color: AppColors.amber.withOpacity(0.3)) : BorderSide.none,
          ),
          elevation: 0,
          textStyle: TextStyle(
            fontFamily: AppFonts.barlowCondensed,
            fontSize: sf(context, 14),
            fontWeight: FontWeight.w900,
            letterSpacing: 1,
          ),
        ),
        child: Text(_reminderSet ? '✅ ${str.reminderSet} — tap to cancel' : '🔔 ${str.setReminder}'),
      ),
    );
  }

  // ─── Fan Vote Card ───

  Widget _fanVoteCard(BuildContext context, MatchData m, FanVoteState vote, dynamic str) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          // Header
          Padding(
            padding: sLTRB(context, 15, 11, 15, 11),
            child: Row(
              children: [
                Text('📊 ${str.fansPredicting}',
                  style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 11),
                    fontWeight: FontWeight.w700, letterSpacing: 2, color: AppColors.textSecondary)),
                const Spacer(),
                Container(
                  width: 5, height: 5,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.neonGreen),
                ),
                const SizedBox(width: 5),
                Text('${vote.total} fan',
                  style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 11),
                    fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Container(height: 1, color: AppColors.divider),

          // Vote buttons
          Padding(
            padding: sa(context, 14),
            child: Row(
              children: [
                Expanded(child: _voteButton(context, m, vote, 'home', m.homeTeam, AppColors.neonGreen)),
                SizedBox(width: s(context, 8)),
                Expanded(child: _voteButton(context, m, vote, 'draw', str.draw, AppColors.textSecondary)),
                SizedBox(width: s(context, 8)),
                Expanded(child: _voteButton(context, m, vote, 'away', m.awayTeam, AppColors.amber)),
              ],
            ),
          ),

          // Fan summary bar
          Padding(
            padding: sLTRB(context, 14, 0, 14, 14),
            child: Container(
              padding: sa(context, 10),
              decoration: BoxDecoration(
                color: AppColors.cardSurfaceLight.withOpacity(0.3),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.divider),
              ),
              child: Row(
                children: [
                  Container(
                    width: 5, height: 5,
                    decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.neonGreen),
                  ),
                  SizedBox(width: s(context, 10)),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${vote.total} ${str.fansPredictingMatch}',
                          style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 12),
                            fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                        SizedBox(height: s(context, 6)),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: Container(
                            height: 4,
                            decoration: BoxDecoration(
                              color: AppColors.divider.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(2),
                            ),
                            child: vote.total > 0
                              ? Row(
                                  children: [
                                    if (vote.home > 0) Flexible(flex: vote.home, child: Container(color: AppColors.neonGreen)),
                                    if (vote.draw > 0) Flexible(flex: vote.draw, child: Container(color: AppColors.blue)),
                                    if (vote.away > 0) Flexible(flex: vote.away, child: Container(color: AppColors.amber)),
                                  ],
                                )
                              : const SizedBox.expand(),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _voteButton(BuildContext context, MatchData m, FanVoteState vote, String choice, String label, Color color) {
    final isSelected = vote.myVote == choice;
    final pct = vote.pct(choice);
    final pctColor = isSelected ? AppColors.neonGreen : color;

    return GestureDetector(
      onTap: () => ref.read(fanVoteProvider.notifier).vote(widget.fixtureId, choice),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: sp(context, v: 12, h: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.neonGreen.withOpacity(0.1) : AppColors.cardSurfaceLight.withOpacity(0.3),
          borderRadius: BorderRadius.circular(11),
          border: Border.all(
            color: isSelected ? AppColors.neonGreen.withOpacity(0.45) : AppColors.divider,
          ),
        ),
        child: Column(
          children: [
            Text('${pct}%',
              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 26),
                color: pctColor, height: 1)),
            SizedBox(height: s(context, 4)),
            Text(choice == 'draw' ? label : '${label.length > 10 ? label.substring(0, 10) : label} wins',
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
              style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 10),
                fontWeight: FontWeight.w700, letterSpacing: 0.4, color: AppColors.textSecondary)),
            SizedBox(height: s(context, 7)),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: Container(
                height: 3,
                decoration: BoxDecoration(
                  color: AppColors.divider.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
                child: FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: pct / 100,
                  child: Container(
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.neonGreen : color.withOpacity(0.5),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── H2H ───

  Widget _h2hRow(BuildContext context, MatchData m, dynamic str) {
    return Row(
      children: [
        _h2hItem(context, str.wins(m.homeTeam), '-', AppColors.neonGreen),
        SizedBox(width: s(context, 7)),
        _h2hItem(context, str.draws, '-', AppColors.textSecondary),
        SizedBox(width: s(context, 7)),
        _h2hItem(context, str.wins(m.awayTeam), '-', AppColors.amber),
      ],
    );
  }

  Widget _h2hItem(BuildContext context, String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: sp(context, v: 10, h: 8),
        decoration: BoxDecoration(
          color: AppColors.cardSurfaceLight.withOpacity(0.3),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: AppColors.divider),
        ),
        child: Column(
          children: [
            Text(value,
              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 20), color: color)),
            Text(label,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
              style: TextStyle(fontSize: sf(context, 9), letterSpacing: 0.4,
                color: AppColors.textSecondary.withOpacity(0.4))),
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
