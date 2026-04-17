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

// Ranges reserved for later stages — documented here so no one picks
// the same one by accident. These are not functions yet because Stage 2
// doesn't need them; stages that add them should promote the comment
// into a helper.
//
//   FT summary (Stage 4)         = 200_000_000 + fixtureId
//   Favourite team 2h (Stage 4)  = 300_000_000 + fixtureId
//   Streak-at-risk daily         = 999_999_001
