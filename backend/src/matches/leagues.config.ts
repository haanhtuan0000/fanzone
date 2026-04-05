/** Accept all leagues — filtering is done by MAX_LIVE_MATCHES cap */
export const TRACKED_LEAGUE_IDS = { has: (_id: number) => true } as Set<number>;

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
