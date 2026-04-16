import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Context object with all resolved variables for a fixture.
 * Keys match the {variable} placeholders in question templates.
 */
export interface MatchContext {
  home_team: string;
  away_team: string;
  // Lineup-sourced fields — null when the fixture's lineup isn't cached.
  // Callers (MatchScenarioEngine) filter lineup-dependent templates up-front
  // so null values never reach the creation path; if they do, strict
  // resolveText throws and the question is skipped rather than persisted
  // with synthesised "{team} striker" garbage. See lineup-dependency.ts.
  home_striker: string | null;
  away_striker: string | null;
  home_midfielder: string | null;
  away_midfielder: string | null;
  home_keeper: string | null;
  away_keeper: string | null;
  risky_player_home: string | null;
  risky_player_away: string | null;
  home_sub_striker: string | null;
  away_sub_striker: string | null;
  sub_midfielder: string | null;
  leading_team: string;
  trailing_team: string;
  home_score: string;
  away_score: string;
  minute: string;
  score_option_1: string;
  score_option_2: string;
  score_option_3: string;
  [key: string]: string | null;
}

interface CachedLineup {
  home?: { strikers?: string[]; midfielders?: string[]; goalkeeper?: string };
  away?: { strikers?: string[]; midfielders?: string[]; goalkeeper?: string };
}

@Injectable()
export class VariableResolverService {
  private readonly logger = new Logger(VariableResolverService.name);

  constructor(private redis: RedisService) {}

  /**
   * Build a full MatchContext for a given fixture by pulling cached data from Redis.
   */
  async buildMatchContext(
    fixtureId: number,
    teams: { home: string; away: string },
    elapsed?: number,
    score?: { home: number; away: number },
  ): Promise<MatchContext> {
    // Try to fetch cached lineup data
    const lineup = await this.redis.getJson<CachedLineup>(
      `fixture:${fixtureId}:lineup`,
    );

    const homeScore = score?.home ?? 0;
    const awayScore = score?.away ?? 0;

    // Build score prediction options based on current score
    const scoreOptions = this.buildScoreOptions(homeScore, awayScore);

    const hasLineup = !!(lineup?.home?.strikers?.length || lineup?.away?.strikers?.length);

    // Lineup-sourced fields are `null` when the fixture has no cached lineup,
    // rather than fabricated strings like "Mutondo Stars striker". The
    // MatchScenarioEngine's lineup-dependency filter (lineup-dependency.ts)
    // already refuses lineup-dependent templates up-front; if any slips
    // through (e.g. a new placeholder added without updating the constant
    // list), strict resolveText throws and the question is skipped.
    const ctx: MatchContext = {
      _hasLineup: hasLineup ? 'true' : 'false',
      home_team: teams.home,
      away_team: teams.away,
      home_striker: lineup?.home?.strikers?.[0] ?? null,
      away_striker: lineup?.away?.strikers?.[0] ?? null,
      home_midfielder: lineup?.home?.midfielders?.[0] ?? null,
      away_midfielder: lineup?.away?.midfielders?.[0] ?? null,
      home_keeper: lineup?.home?.goalkeeper ?? null,
      away_keeper: lineup?.away?.goalkeeper ?? null,
      risky_player_home: lineup?.home?.midfielders?.[1] ?? null,
      risky_player_away: lineup?.away?.midfielders?.[1] ?? null,
      home_sub_striker: lineup?.home?.strikers?.[1] ?? null,
      away_sub_striker: lineup?.away?.strikers?.[1] ?? null,
      sub_midfielder: lineup?.home?.midfielders?.[2] ?? null,
      leading_team: homeScore > awayScore ? teams.home : (awayScore > homeScore ? teams.away : teams.home),
      trailing_team: homeScore < awayScore ? teams.home : (awayScore < homeScore ? teams.away : teams.away),
      home_score: String(homeScore),
      away_score: String(awayScore),
      minute: String(elapsed ?? 0),
      score_option_1: scoreOptions[0],
      score_option_2: scoreOptions[1],
      score_option_3: scoreOptions[2],
    };

    return ctx;
  }

  /**
   * Replace all {variable} placeholders in a template string with context values.
   */
  /**
   * Replace every `{variable}` in [template] with the matching context value.
   *
   * When `opts.strict` is true (used by the question-creation path), an
   * unresolved variable THROWS instead of quietly leaving the raw `{key}` in
   * the output — the Mutondo Stars "striker" bug slipped past review partly
   * because this function silently produced broken strings that got
   * persisted. The non-strict mode is preserved for read/feed paths where a
   * missing variable shouldn't halt business logic (e.g., localized feed
   * messages whose template evolved between deploys).
   */
  resolveText(template: string, context: MatchContext, opts: { strict?: boolean } = {}): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      const value = context[key];
      if (value === undefined || value === null) {
        if (opts.strict) {
          throw new Error(
            `resolveText: unresolved variable "${key}" in "${template}"`,
          );
        }
        this.logger.warn(`Unresolved variable: ${match}`);
        return match; // Keep placeholder if no value (legacy, non-persisted paths)
      }
      return value;
    });
  }

  /**
   * Resolve all option name templates for a given language.
   * Returns resolved option objects with name, emoji, and computed multiplier.
   */
  resolveOptions(
    optionTemplates: Array<{ nameVi: string; nameEn: string; emoji: string; defaultPct: number }>,
    context: MatchContext,
    lang: 'vi' | 'en' = 'vi',
    opts: { strict?: boolean } = {},
  ): Array<{ name: string; emoji: string; info?: string; multiplier: number }> {
    const resolved = optionTemplates.map((opt) => {
      const rawName = lang === 'vi' ? opt.nameVi : opt.nameEn;
      const name = this.resolveText(rawName, context, opts);
      // Compute multiplier from defaultPct: higher pct = lower multiplier
      const multiplier = opt.defaultPct > 0
        ? Math.max(1.1, Math.round((100 / opt.defaultPct) * 10) / 10)
        : 2.0;

      return {
        name,
        emoji: opt.emoji,
        multiplier,
      };
    });

    // Deduplicate: keep first occurrence of each name
    const seen = new Set<string>();
    return resolved.filter((opt) => {
      const key = opt.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Build 3 likely score prediction options based on current score.
   */
  private buildScoreOptions(homeScore: number, awayScore: number): [string, string, string] {
    // Predict most likely final scores from current state
    return [
      `${homeScore + 1}–${awayScore}`,
      `${homeScore}–${awayScore}`,
      `${homeScore}–${awayScore + 1}`,
    ];
  }
}
