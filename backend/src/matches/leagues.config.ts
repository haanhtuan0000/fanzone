/** Tracked leagues — top European + Americas + popular */
// TESTING: commented out to accept all leagues. Uncomment to restore filtering.
// export const TRACKED_LEAGUE_IDS = new Set([
//   // Top 5 European
//   39,  // England — Premier League
//   140, // Spain — La Liga
//   135, // Italy — Serie A
//   78,  // Germany — Bundesliga
//   61,  // France — Ligue 1
//   // Other major European
//   88,  // Netherlands — Eredivisie
//   94,  // Portugal — Primeira Liga
//   40,  // England — Championship
//   144, // Belgium — Pro League
//   203, // Turkey — Süper Lig
//   // Americas
//   253, // USA — MLS
//   128, // Argentina — Liga Profesional
//   71,  // Brazil — Serie A
//   262, // Mexico — Liga MX
//   // International cups
//   2,   // UEFA Champions League
//   3,   // UEFA Europa League
//   848, // UEFA Conference League
// ]);
// Narrowed to the single method all callers use (`.has`) so the testing shim
// is type-checked honestly — casting `{has}` to full `Set<number>` fails under
// stricter TS overlap rules, and hides breakage if someone later calls `.size`
// or iterates this. Re-widen to `Set<number>` once the real Set above is
// uncommented.
export const TRACKED_LEAGUE_IDS: Pick<Set<number>, 'has'> = { has: () => true };

/** Maximum live matches to process simultaneously (API budget constraint) */
export const MAX_LIVE_MATCHES = 8;

/** Priority leagues — these matches are processed first when over the cap */
export const PRIORITY_LEAGUE_IDS = new Set([
  // Big 5 leagues
  39,  // England — Premier League
  140, // Spain — La Liga
  135, // Italy — Serie A
  78,  // Germany — Bundesliga
  61,  // France — Ligue 1
  // UEFA
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  848, // UEFA Conference League
  // Domestic cups
  45,  // England — FA Cup
  48,  // England — League Cup (Carabao)
  143, // Spain — Copa del Rey
  137, // Italy — Coppa Italia
  81,  // Germany — DFB Pokal
  66,  // France — Coupe de France
  // International
  1,   // FIFA World Cup
  4,   // UEFA Euro
  5,   // UEFA Nations League
]);

export const TRACKED_LEAGUES = [
  { id: 39, season: 2025 },  // Premier League
  { id: 140, season: 2025 }, // La Liga
  { id: 135, season: 2025 }, // Serie A
  { id: 78, season: 2025 },  // Bundesliga
  { id: 61, season: 2025 },  // Ligue 1
];
