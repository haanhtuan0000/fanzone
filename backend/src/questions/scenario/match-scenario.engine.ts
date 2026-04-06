import { Injectable, Logger } from '@nestjs/common';
import { MatchPhase, QuestionDifficulty } from '@prisma/client';
import { RedisService } from '../../common/redis/redis.service';
import { QuestionsService } from '../questions.service';
import { TemplateService } from '../templates/template.service';
import { VariableResolverService, MatchContext } from '../templates/variable-resolver.service';

/** Match event from the live feed / API-Football */
export interface MatchEvent {
  type: string;
  detail?: string;
  player?: { name: string };
  team?: { name: string; id?: number };
  time?: { elapsed: number };
}

/** Teams info passed to the engine */
export interface MatchTeams {
  home: string;
  away: string;
}

/** Per-fixture scenario state kept in memory */
interface FixtureState {
  currentPhase: MatchPhase;
  questionsGenerated: number;
  lastQuestionTime: number;
}

/**
 * Question distribution per phase (from FanZone_Question_Bank_v2_3.docx).
 * 55 questions, 17 EASY, sliding window 12, pool available = 43/match.
 */
const PHASE_CONFIG: Record<MatchPhase, {
  count: number;
  difficulty: QuestionDifficulty;
  categories: string[];
}> = {
  PRE_MATCH:  { count: 2, difficulty: 'EASY',   categories: ['GOAL', 'STAT'] },
  EARLY_H1:   { count: 2, difficulty: 'EASY',   categories: ['GOAL', 'CARD', 'CORNER', 'STAT', 'MOMENTUM'] },
  MID_H1:     { count: 2, difficulty: 'MEDIUM', categories: ['VAR', 'GOAL', 'CORNER'] },
  LATE_H1:    { count: 1, difficulty: 'MEDIUM', categories: ['GOAL', 'TIME'] },
  HALF_TIME:  { count: 2, difficulty: 'MEDIUM', categories: ['MOMENTUM', 'GOAL', 'SUB'] },
  EARLY_H2:   { count: 2, difficulty: 'MEDIUM', categories: ['SUB', 'VAR', 'GOAL'] },
  MID_H2:     { count: 2, difficulty: 'HARD',   categories: ['CARD', 'GOAL', 'MOMENTUM'] },
  LATE_H2:    { count: 2, difficulty: 'HARD',   categories: ['TIME', 'GOAL', 'MOMENTUM'] },
};

/**
 * Phase timing boundaries (minutes).
 * Used to space questions evenly within each phase.
 */
const PHASE_TIMING: Record<MatchPhase, { start: number; end: number }> = {
  PRE_MATCH:  { start: -5, end: 0 },
  EARLY_H1:   { start: 0,  end: 15 },
  MID_H1:     { start: 15, end: 35 },
  LATE_H1:    { start: 35, end: 45 },
  HALF_TIME:  { start: 45, end: 47 },
  EARLY_H2:   { start: 46, end: 60 },
  MID_H2:     { start: 60, end: 75 },
  LATE_H2:    { start: 75, end: 90 },
};

/** Maximum scheduled questions per match (doc says 13-15) */
const MAX_QUESTIONS_PER_MATCH = 15;

/** Map event types to template trigger names */
const EVENT_TRIGGER_MAP: Record<string, string> = {
  goal: 'EVENT_GOAL',
  card: 'EVENT_CARD',
  corner: 'EVENT_CORNER',
  var: 'EVENT_VAR',
  subst: 'EVENT_SUB',
};

/** Minimum cooldown between questions per fixture (ms) */
const COOLDOWN_MS = 45_000;

/** Redis sliding window size — last N template IDs to avoid repetition (doc v2.3: 12) */
const WINDOW_SIZE = 12;

/** TTL for the Redis sliding window key (4 hours, covers a full match) */
const WINDOW_TTL_SEC = 4 * 3600;

@Injectable()
export class MatchScenarioEngine {
  private readonly logger = new Logger(MatchScenarioEngine.name);

  /** In-memory state per fixture */
  private fixtureStates = new Map<number, FixtureState>();

  constructor(
    private redis: RedisService,
    private questionsService: QuestionsService,
    private templateService: TemplateService,
    private variableResolver: VariableResolverService,
  ) {}

  // ──────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────

  /**
   * Called when the match transitions to a new phase.
   * Generates 1-2 scheduled questions for the new phase,
   * spaced evenly within the phase duration.
   */
  async onPhaseChange(
    fixtureId: number,
    newPhase: MatchPhase,
    teams: MatchTeams,
    elapsed?: number,
    score?: { home: number; away: number },
  ) {
    this.logger.log(`[${fixtureId}] Phase change → ${newPhase}`);

    const state = this.getOrCreateState(fixtureId, newPhase);
    state.currentPhase = newPhase;

    // Enforce max questions per match
    if (state.questionsGenerated >= MAX_QUESTIONS_PER_MATCH) {
      this.logger.log(`[${fixtureId}] Max ${MAX_QUESTIONS_PER_MATCH} questions reached, skipping`);
      return [];
    }

    const config = PHASE_CONFIG[newPhase];
    const remaining = MAX_QUESTIONS_PER_MATCH - state.questionsGenerated;
    const count = Math.min(config.count, remaining);
    const excludeIds = await this.getUsedTemplateIds(fixtureId);

    // Select templates with category preference
    let templates = await this.templateService.selectForPhaseWithCategories(
      newPhase,
      excludeIds,
      config.difficulty,
      config.categories,
      count,
    );

    // Fallback: if no templates found with preferred categories, try any category
    if (templates.length === 0) {
      templates = await this.templateService.selectForPhase(
        newPhase,
        excludeIds,
        config.difficulty,
        count,
      );
    }

    // If all templates are used for this fixture, don't generate duplicates — skip
    if (templates.length === 0 && excludeIds.length > 0) {
      this.logger.log(`[${fixtureId}] All templates used for ${newPhase} — no new questions`);
    }

    const context = await this.variableResolver.buildMatchContext(
      fixtureId,
      teams,
      elapsed,
      score,
    );

    // Check if there's already an OPEN question for this fixture
    const existingOpen = await this.questionsService.hasOpenQuestion(fixtureId);

    // Calculate spaced opensAt timestamps within the phase
    const currentElapsed = elapsed ?? 0;
    const kickoffTime = new Date(Date.now() - currentElapsed * 60_000);
    const scheduledTimes = this.calculateSpacedTimes(newPhase, templates.length, kickoffTime, currentElapsed);

    const created = [];
    for (let i = 0; i < templates.length; i++) {
      const tpl = templates[i];
      const scheduledOpensAt = scheduledTimes[i];
      // Only auto-open if: no existing OPEN question, this is the first in batch, AND it's due now
      const isDueNow = scheduledOpensAt.getTime() <= Date.now();
      const shouldOpen = !existingOpen && created.length === 0 && isDueNow;

      const question = await this.createFromTemplate(
        fixtureId, tpl, context, newPhase, elapsed, undefined, shouldOpen, scheduledOpensAt,
      );
      if (question) {
        created.push(question);
        await this.recordUsedTemplate(fixtureId, tpl.id);
        state.questionsGenerated++;
        state.lastQuestionTime = Date.now();
      }
    }

    this.logger.log(
      `[${fixtureId}] Generated ${created.length} questions for phase ${newPhase}` +
      (scheduledTimes.length > 0
        ? ` (scheduled at minutes: ${scheduledTimes.map((t) => Math.round((t.getTime() - kickoffTime.getTime()) / 60_000)).join(', ')})`
        : ''),
    );

    return created;
  }

  /**
   * Called when a live match event arrives (goal, card, corner, VAR, sub).
   * May generate a trigger-based question if appropriate.
   * Event-triggered questions open immediately (no spacing).
   */
  async onMatchEvent(
    fixtureId: number,
    event: MatchEvent,
    teams: MatchTeams,
    score?: { home: number; away: number },
  ) {
    const eventType = event.type?.toLowerCase();
    const trigger = EVENT_TRIGGER_MAP[eventType];
    if (!trigger) return null;

    const state = this.getOrCreateState(fixtureId);

    // Max questions cap
    if (state.questionsGenerated >= MAX_QUESTIONS_PER_MATCH) {
      this.logger.debug(`[${fixtureId}] Max questions reached, skipping event ${eventType}`);
      return null;
    }

    // Cooldown check
    if (Date.now() - state.lastQuestionTime < COOLDOWN_MS) {
      this.logger.debug(`[${fixtureId}] Cooldown active, skipping event ${eventType}`);
      return null;
    }

    const elapsed = event.time?.elapsed ?? 0;
    const phase = this.determinePhase(elapsed);
    const excludeIds = await this.getUsedTemplateIds(fixtureId);

    const tpl = await this.templateService.selectForEvent(trigger, phase, excludeIds);
    if (!tpl) {
      this.logger.debug(`[${fixtureId}] No template for trigger=${trigger} phase=${phase}`);
      return null;
    }

    const context = await this.variableResolver.buildMatchContext(
      fixtureId,
      teams,
      elapsed,
      score,
    );

    // Event-triggered questions open immediately — no spacing
    const question = await this.createFromTemplate(
      fixtureId,
      tpl,
      context,
      phase,
      elapsed,
      trigger,
    );

    if (question) {
      await this.recordUsedTemplate(fixtureId, tpl.id);
      state.questionsGenerated++;
      state.lastQuestionTime = Date.now();
    }

    return question;
  }

  /**
   * Map elapsed minutes + period info to a MatchPhase.
   */
  determinePhase(elapsed: number, period?: string): MatchPhase {
    if (period === 'HT' || (elapsed >= 45 && elapsed <= 46)) return 'HALF_TIME';

    if (elapsed <= 0) return 'PRE_MATCH';
    if (elapsed <= 15) return 'EARLY_H1';
    if (elapsed <= 35) return 'MID_H1';
    if (elapsed <= 45) return 'LATE_H1';
    if (elapsed <= 60) return 'EARLY_H2';
    if (elapsed <= 75) return 'MID_H2';
    return 'LATE_H2';
  }

  /**
   * Cleanup state when a fixture ends.
   */
  async cleanup(fixtureId: number) {
    this.fixtureStates.delete(fixtureId);
    await this.redis.del(this.windowKey(fixtureId));
    this.logger.log(`[${fixtureId}] Scenario state cleaned up`);
  }

  // ──────────────────────────────────────────────
  //  Question spacing
  // ──────────────────────────────────────────────

  /**
   * Calculate evenly spaced opensAt timestamps within a phase.
   *
   * Example: EARLY_H1 (0-15 min), 2 questions:
   *   interval = 15 / (2+1) = 5 min
   *   Q1 opensAt = kickoff + 5 min
   *   Q2 opensAt = kickoff + 10 min
   *
   * If the calculated time is already in the past (match joined mid-phase),
   * the question gets opensAt = now.
   */
  private calculateSpacedTimes(
    phase: MatchPhase,
    count: number,
    kickoffTime: Date,
    currentElapsed: number,
  ): Date[] {
    if (count === 0) return [];

    const timing = PHASE_TIMING[phase];
    const phaseDuration = timing.end - timing.start; // minutes

    // For very short phases (HALF_TIME: 2 min), use minimal gap (30s)
    if (phaseDuration <= 3) {
      const times: Date[] = [];
      for (let i = 0; i < count; i++) {
        const offsetMs = i * 30_000; // 30s between questions
        const opensAt = new Date(Date.now() + offsetMs);
        times.push(opensAt);
      }
      return times;
    }

    // Space evenly: interval = duration / (count + 1)
    const intervalMin = phaseDuration / (count + 1);
    const times: Date[] = [];

    for (let i = 0; i < count; i++) {
      const targetMinute = timing.start + intervalMin * (i + 1);
      const targetTime = new Date(kickoffTime.getTime() + targetMinute * 60_000);

      // If target is in the past, use now (+ small offset to avoid race)
      if (targetTime.getTime() <= Date.now()) {
        times.push(new Date(Date.now() + i * 1000)); // stagger by 1s
      } else {
        times.push(targetTime);
      }
    }

    return times;
  }

  // ──────────────────────────────────────────────
  //  Internal helpers
  // ──────────────────────────────────────────────

  private getOrCreateState(fixtureId: number, phase?: MatchPhase): FixtureState {
    let state = this.fixtureStates.get(fixtureId);
    if (!state) {
      state = {
        currentPhase: phase ?? 'PRE_MATCH',
        questionsGenerated: 0,
        lastQuestionTime: 0,
      };
      this.fixtureStates.set(fixtureId, state);
    }
    return state;
  }

  /**
   * Create a question from a resolved template.
   * @param scheduledOpensAt - When the question should open. Defaults to now.
   */
  private async createFromTemplate(
    fixtureId: number,
    tpl: any,
    context: MatchContext,
    phase: MatchPhase,
    elapsed?: number,
    triggeredByEvent?: string,
    autoOpen: boolean = true,
    scheduledOpensAt?: Date,
  ) {
    try {
      // Skip player-specific templates when lineup data is not available
      const tplStr = JSON.stringify(tpl.options ?? []) + (tpl.textVi ?? '') + (tpl.textEn ?? '');
      const usesPlayerVars = /\{(home_striker|away_striker|home_midfielder|away_midfielder|home_keeper|away_keeper|risky_player_home|risky_player_away|home_sub_striker|away_sub_striker|sub_midfielder)\}/.test(tplStr);
      if (usesPlayerVars && context._hasLineup !== 'true') {
        this.logger.debug(`[${fixtureId}] Template ${tpl.code} requires lineup data — skipping (no lineup cached)`);
        return null;
      }

      // Resolve text (default to Vietnamese)
      const text = this.variableResolver.resolveText(tpl.textVi, context);
      let options = this.variableResolver.resolveOptions(tpl.options as any, context, 'vi');

      // Filter out time-range options that are already in the past
      options = this.filterPastTimeOptions(options, elapsed ?? 0);

      // Skip if too few options after dedup/filtering
      if (options.length < 2) {
        this.logger.warn(`[${fixtureId}] Template ${tpl.code} has < 2 valid options at minute ${elapsed} — skipping`);
        return null;
      }

      // Q007 no longer needs tied-score guard — v2.3 uses simple Yes/No options

      // v2.3 #7: Q054 only triggers when first goal is after minute 15
      if (tpl.code === 'Q054' && (elapsed ?? 0) <= 15) {
        this.logger.debug(`[${fixtureId}] Q054 skipped — first goal too early (minute ${elapsed})`);
        return null;
      }

      // v2.3 #5: Q048 only when score is tied (extra time only possible in cups when drawn)
      if (tpl.code === 'Q048') {
        const homeScore = parseInt(context.home_score) || 0;
        const awayScore = parseInt(context.away_score) || 0;
        if (homeScore !== awayScore) {
          this.logger.debug(`[${fixtureId}] Q048 skipped — score not tied (${homeScore}-${awayScore})`);
          return null;
        }
      }

      const opensAt = scheduledOpensAt ?? new Date();
      const closesAt = new Date(opensAt.getTime() + tpl.answerWindowSec * 1000);

      // For TIMEOUT_DEFAULT questions, compute when to auto-resolve
      const timeoutWindowMin = tpl.timeoutWindowMin as number | undefined;
      const resolvesAt = timeoutWindowMin
        ? new Date(opensAt.getTime() + timeoutWindowMin * 60_000).toISOString()
        : undefined;

      const question = await this.questionsService.createQuestion({
        fixtureId,
        category: tpl.category,
        difficulty: tpl.difficulty,
        matchPhase: phase,
        matchMinute: elapsed,
        templateId: tpl.id,
        triggeredByEvent,
        text,
        rewardCoins: tpl.rewardCoins,
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
        resolvesAt,
        options: options.map((opt) => ({
          name: opt.name,
          emoji: opt.emoji,
          multiplier: opt.multiplier,
        })),
      });

      // Only open if autoOpen, opensAt is now or past, and no other OPEN question exists
      if (autoOpen && opensAt.getTime() <= Date.now()) {
        await this.questionsService.openQuestion(question.id);
      }

      this.logger.log(
        `[${fixtureId}] Created question [${tpl.code}]: "${text}" (${phase}, ${autoOpen && opensAt.getTime() <= Date.now() ? 'OPEN' : 'PENDING'}, opensAt=${opensAt.toISOString()})`,
      );

      return question;
    } catch (err) {
      this.logger.error(`[${fixtureId}] Failed to create question from template ${tpl.code}: ${err}`);
      return null;
    }
  }

  /**
   * Remove time-range options that are already in the past based on elapsed minutes.
   * E.g., "Before minute 60" is impossible at minute 66.
   */
  private filterPastTimeOptions(
    options: Array<{ name: string; emoji: string; multiplier: number }>,
    elapsed: number,
  ): Array<{ name: string; emoji: string; multiplier: number }> {
    if (!elapsed || elapsed <= 0) return options;

    return options.filter((opt) => {
      const name = opt.name.toLowerCase();

      // "Before minute X" / "Trước phút X"
      const beforeMatch = name.match(/(?:before|trước)\s*(?:minute|phút)?\s*(\d+)/i);
      if (beforeMatch && elapsed >= parseInt(beforeMatch[1])) return false;

      // "Minute X–Y" / "Phút X–Y" — remove if elapsed > Y (range fully passed)
      const rangeMatch = name.match(/(?:minute|phút)?\s*(\d+)\s*[-–]\s*(\d+)/);
      if (rangeMatch && elapsed > parseInt(rangeMatch[2])) return false;

      return true;
    });
  }

  // ──────────────────────────────────────────────
  //  Redis sliding window for template dedup
  // ──────────────────────────────────────────────

  private windowKey(fixtureId: number): string {
    return `window:fixture:${fixtureId}:templates`;
  }

  /**
   * Get template IDs in the sliding window (last 12 used).
   * Falls back to DB if Redis is empty (e.g., after restart).
   */
  private async getUsedTemplateIds(fixtureId: number): Promise<string[]> {
    const cached = await this.redis.get(this.windowKey(fixtureId));
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }
    // Fallback: load from DB and seed the window
    const dbIds = await this.questionsService.getTemplateIdsForFixture(fixtureId);
    const window = dbIds.slice(-WINDOW_SIZE);
    if (window.length > 0) {
      await this.redis.set(this.windowKey(fixtureId), JSON.stringify(window), WINDOW_TTL_SEC);
    }
    return window;
  }

  /**
   * Record a template ID in the sliding window (Redis, last 12).
   */
  private async recordUsedTemplate(fixtureId: number, templateId: string): Promise<void> {
    const key = this.windowKey(fixtureId);
    const cached = await this.redis.get(key);
    const list: string[] = cached ? (JSON.parse(cached) ?? []) : [];
    list.push(templateId);
    if (list.length > WINDOW_SIZE) list.shift(); // Keep last 12
    await this.redis.set(key, JSON.stringify(list), WINDOW_TTL_SEC);
  }
}
