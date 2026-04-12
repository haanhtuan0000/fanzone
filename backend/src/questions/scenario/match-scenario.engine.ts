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
  kickoffTime: number | null; // epoch ms, set once on first phase — never recalculated
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
    const state = this.getOrCreateState(fixtureId, newPhase, elapsed);

    // Prevent generating for the same phase twice — persisted in Redis to survive restarts
    const phaseKey = `phase:${fixtureId}:last-generated`;
    const cachedPhase = await this.redis.get(phaseKey);
    if (cachedPhase === newPhase) {
      this.logger.debug(`[${fixtureId}] Already generated for ${newPhase} (Redis) — skipping`);
      return [];
    }

    this.logger.log(`[${fixtureId}] Phase change → ${newPhase}`);
    state.currentPhase = newPhase;
    await this.redis.set(phaseKey, newPhase, 14400); // 4 hour TTL (covers full match + ET)

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

    // Safety: enforce count limit in case template service returns more
    templates = templates.slice(0, count);

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
    const kickoffTime = new Date(state.kickoffTime ?? (Date.now() - currentElapsed * 60_000));
    // If this is the first batch for this fixture, open first question immediately
    const isFirstBatch = state.questionsGenerated === 0;
    const scheduledTimes = this.calculateSpacedTimes(newPhase, templates.length, kickoffTime, currentElapsed, isFirstBatch);

    const created = [];
    for (let i = 0; i < templates.length; i++) {
      const tpl = templates[i];
      const scheduledOpensAt = scheduledTimes[i];
      // 85' cutoff may remove slots — skip templates without a scheduled time
      if (!scheduledOpensAt) break;
      // Only auto-open if: no existing OPEN question, this is the first in batch, AND it's due now
      const isDueNow = scheduledOpensAt.getTime() <= Date.now();
      const shouldOpen = !existingOpen && created.length === 0 && isDueNow;

      const question = await this.createFromTemplate(
        fixtureId, tpl, context, newPhase, elapsed, undefined, shouldOpen, scheduledOpensAt, kickoffTime,
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

    const state = this.getOrCreateState(fixtureId, undefined, event.time?.elapsed);

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

    // Skip event-triggered question if there's an OPEN or PENDING question
    // (phase-scheduled questions already cover this period — don't stack)
    const hasOpen = await this.questionsService.hasOpenQuestion(fixtureId);
    const hasPending = await this.questionsService.hasPendingQuestion(fixtureId);
    if (hasOpen || hasPending) {
      this.logger.debug(`[${fixtureId}] Active/pending questions exist, skipping event ${eventType}`);
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
    await this.redis.del(`phase:${fixtureId}:last-generated`);
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
    firstQuestionNow: boolean = false,
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
    // Add random jitter (±30% of interval) so different matches feel unique
    const intervalMin = phaseDuration / (count + 1);
    const jitterRange = intervalMin * 0.3; // ±30%
    const times: Date[] = [];

    for (let i = 0; i < count; i++) {
      const jitter = (Math.random() * 2 - 1) * jitterRange;
      const targetMinute = timing.start + intervalMin * (i + 1) + jitter;
      // Clamp within phase boundaries (with 30s padding from edges)
      const clampedMinute = Math.max(timing.start + 0.5, Math.min(timing.end - 0.5, targetMinute));
      const targetTime = new Date(kickoffTime.getTime() + clampedMinute * 60_000);

      // If target is in the past, or first question of first batch → open now
      if (targetTime.getTime() <= Date.now() || (firstQuestionNow && i === 0)) {
        times.push(new Date(Date.now() + (i === 0 ? 0 : 30_000)));
      } else {
        times.push(targetTime);
      }
    }

    // Ensure times are in order (jitter could swap them)
    times.sort((a, b) => a.getTime() - b.getTime());

    // Don't schedule questions in the last 5 minutes of the match (after 85')
    const cutoffTime = new Date(kickoffTime.getTime() + 85 * 60_000);
    return times.filter(t => t.getTime() <= cutoffTime.getTime());
  }

  // ──────────────────────────────────────────────
  //  Internal helpers
  // ──────────────────────────────────────────────

  private getOrCreateState(fixtureId: number, phase?: MatchPhase, elapsed?: number): FixtureState {
    let state = this.fixtureStates.get(fixtureId);
    if (!state) {
      state = {
        currentPhase: phase ?? 'PRE_MATCH',
        questionsGenerated: 0,
        lastQuestionTime: 0,
        kickoffTime: (elapsed != null && elapsed > 0) ? Date.now() - elapsed * 60_000 : null,
      };
      this.fixtureStates.set(fixtureId, state);
    }
    // If kickoffTime was never set and now we have elapsed, set it once
    if (state.kickoffTime == null && elapsed != null && elapsed > 0) {
      state.kickoffTime = Date.now() - elapsed * 60_000;
    }
    return state;
  }

  /**
   * Create a question from a resolved template.
   * @param scheduledOpensAt - When the question should open. Defaults to now.
   * @param kickoffTime - Estimated kickoff time, used to derive matchMinute from opensAt.
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
    kickoffTime?: Date,
  ) {
    try {
      // Player-specific templates use fallback names (e.g. "Spokane Velocity ST")
      // when lineup data is not available — no longer skipped

      // Resolve text (default to Vietnamese)
      // Resolve text in both languages, store as JSON in metadata
      const textVi = this.variableResolver.resolveText(tpl.textVi, context);
      const textEn = this.variableResolver.resolveText(tpl.textEn, context);
      const text = textEn; // Default to English as stored text
      const optionsEn = this.variableResolver.resolveOptions(tpl.options as any, context, 'en');
      const optionsVi = this.variableResolver.resolveOptions(tpl.options as any, context, 'vi');
      let options = optionsEn;
      // Store translations in metadata for server-side language selection
      const translations = {
        en: { text: textEn, options: optionsEn.map(o => o.name) },
        vi: { text: textVi, options: optionsVi.map(o => o.name) },
      };

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

      // Derive matchMinute from opensAt relative to kickoff so each question
      // shows the minute it will actually open (not the batch-generation minute)
      const targetMinute = kickoffTime && scheduledOpensAt
        ? Math.round((opensAt.getTime() - kickoffTime.getTime()) / 60_000)
        : (elapsed ?? 0);

      const question = await this.questionsService.createQuestion({
        fixtureId,
        category: tpl.category,
        difficulty: tpl.difficulty,
        matchPhase: phase,
        matchMinute: targetMinute,
        templateId: tpl.id,
        triggeredByEvent,
        text,
        rewardCoins: tpl.rewardCoins,
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
        resolvesAt,
        metadata: { translations },
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
