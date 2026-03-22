import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Context object with all resolved variables for a fixture.
 * Keys match the {variable} placeholders in question templates.
 */
export interface MatchContext {
  home_team: string;
  away_team: string;
  home_striker: string;
  away_striker: string;
  home_midfielder: string;
  home_keeper: string;
  away_keeper: string;
  risky_player_home: string;
  risky_player_away: string;
  home_score: string;
  away_score: string;
  minute: string;
  score_option_1: string;
  score_option_2: string;
  score_option_3: string;
  [key: string]: string;
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

    const ctx: MatchContext = {
      home_team: teams.home,
      away_team: teams.away,
      home_striker: lineup?.home?.strikers?.[0] ?? teams.home,
      away_striker: lineup?.away?.strikers?.[0] ?? teams.away,
      home_midfielder: lineup?.home?.midfielders?.[0] ?? teams.home,
      home_keeper: lineup?.home?.goalkeeper ?? teams.home,
      away_keeper: lineup?.away?.goalkeeper ?? teams.away,
      risky_player_home: lineup?.home?.midfielders?.[1] ?? teams.home,
      risky_player_away: lineup?.away?.midfielders?.[1] ?? teams.away,
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
  resolveText(template: string, context: MatchContext): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      const value = context[key];
      if (value === undefined || value === null) {
        this.logger.warn(`Unresolved variable: ${match}`);
        return match; // Keep placeholder if no value
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
  ): Array<{ name: string; emoji: string; info?: string; multiplier: number }> {
    return optionTemplates.map((opt) => {
      const rawName = lang === 'vi' ? opt.nameVi : opt.nameEn;
      const name = this.resolveText(rawName, context);
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
