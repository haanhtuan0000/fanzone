import '../../core/models/match.dart';

/// How long after the scheduled kickoff a `NS`/`TBD` fixture is considered
/// stale and should be dropped from the Live/Today list. A full match with
/// extra time and penalties runs ~2h 45min; 3h gives comfortable slack.
const _graceBuffer = Duration(hours: 3);

/// True when [m] should be filtered out of the Live/Today display because
/// the feed has gone stale.
///
/// Triggered in real data: a match is postponed or cancelled, API-Football
/// keeps it at `status: NS, elapsed: null` with its original kickoff time,
/// and hours later the client still lists it as "upcoming". Without this
/// filter the user taps in expecting pre-match info and sees a (misleading)
/// "Match in progress" banner or an empty pre-match screen.
///
/// Three invariants this encodes:
///   1. Live matches (1H/2H/HT/ET/P/LIVE) are NEVER filtered — elapsed-clock
///      drift must not hide a match the user is actively watching.
///   2. Finished matches (FT/AET/PEN) are NEVER filtered here — they still
///      belong in today's schedule view until the date boundary rolls over.
///   3. Matches with no kickoff time can't be evaluated, so they're kept.
bool isStaleScheduledMatch(MatchData m, {required DateTime now}) {
  if (m.kickoffTime == null) return false;
  if (m.status != 'NS' && m.status != 'TBD') return false;
  return now.isAfter(m.kickoffTime!.add(_graceBuffer));
}
