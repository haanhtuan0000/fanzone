/// Stable notification-id helpers.
///
/// Android requires each pending notification to have a unique int32 ID.
/// We hand out disjoint ranges so different event families never collide
/// and so cancellation of one family (e.g. kickoff) can't accidentally
/// touch another (e.g. FT summary scheduled for the same fixture).
///
/// Max API-Football fixtureId is ~3 × 10^7, so every range below fits
/// safely inside int32 (≤ 2.14 × 10^9).
library;

/// 15-minutes-before-kickoff reminder. [0 … ~30M]
int matchReminderId(int fixtureId) => fixtureId;

/// At-kickoff notification. [100M … 130M]
int matchKickoffId(int fixtureId) => 100000000 + fixtureId;

/// End-of-match summary, scheduled at `kickoff + 115 min`. [200M … 230M]
int ftSummaryId(int fixtureId) => 200000000 + fixtureId;

/// Favourite-team reminder, scheduled at `kickoff - 2h`. [300M … 330M]
int favoriteTeamId(int fixtureId) => 300000000 + fixtureId;

/// Streak-at-risk daily reminder at 23:00 local time. Not fixture-scoped,
/// so a single fixed ID is enough — re-scheduling the same ID cleanly
/// overwrites the previous alarm.
int streakAtRiskId() => 999999001;
