// TESTING: accept all leagues. Revert to top-5 for production.
// export const TRACKED_LEAGUE_IDS = new Set([
//   39,  // England — Premier League
//   140, // Spain — La Liga
//   135, // Italy — Serie A
//   78,  // Germany — Bundesliga
//   61,  // France — Ligue 1
// ]);

/** Pass-through set that accepts any league ID */
export const TRACKED_LEAGUE_IDS = { has: (_id: number) => true } as Set<number>;

export const TRACKED_LEAGUES = [
  { id: 39, season: 2025 },  // Premier League
  { id: 140, season: 2025 }, // La Liga
  { id: 135, season: 2025 }, // Serie A
  { id: 78, season: 2025 },  // Bundesliga
  { id: 61, season: 2025 },  // Ligue 1
];
