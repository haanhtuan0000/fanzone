import '../../core/models/match.dart';

/// The three genuinely distinct post-countdown states a match can be in.
///
/// The original match info screen rendered a single "Match in progress"
/// banner whenever `kickoffTime < now`, which gave a "Watch live" link to
/// matches that had already finished or that had been postponed/cancelled
/// (API-Football keeps their status at `NS` with a stale kickoff time). That
/// bug was observed on fixture 1540481 (Leones Negros vs Celaya) 22h past
/// its scheduled kickoff — the match never actually started but the app
/// invited the user to "watch live".
enum PostKickoffBannerKind {
  /// Countdown hasn't finished yet — or the match has no kickoff time.
  /// Caller should render nothing.
  none,

  /// Match is actually being played right now (status in 1H/2H/HT/ET/P/LIVE).
  /// Only this state should link to the Live tab.
  liveInProgress,

  /// Match has completed (FT / AET / PEN). No "watch live" link.
  finished,

  /// Past scheduled kickoff but the feed still reports it as not-started
  /// (NS / TBD / PST / CANC / SUSP). Show a neutral "kickoff time passed"
  /// message — never "in progress".
  notYetStarted,
}

/// Pure decision function used by `MatchInfoScreen` to pick which
/// post-countdown banner (if any) to render. Kept free of Flutter imports so
/// it can be unit-tested without a widget tester.
PostKickoffBannerKind postKickoffBannerFor(MatchData? m, Duration remaining) {
  if (m == null || m.kickoffTime == null) return PostKickoffBannerKind.none;
  if (remaining.inSeconds > 0) return PostKickoffBannerKind.none;
  if (m.isLive) return PostKickoffBannerKind.liveInProgress;
  const finished = {'FT', 'AET', 'PEN'};
  if (finished.contains(m.status)) return PostKickoffBannerKind.finished;
  // Everything else past kickoff — NS, TBD, PST, CANC, SUSP — is a match
  // that hasn't begun (or won't), not a live one.
  return PostKickoffBannerKind.notYetStarted;
}
