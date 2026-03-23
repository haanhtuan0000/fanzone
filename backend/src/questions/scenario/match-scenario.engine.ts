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
 * Question distribution per phase (from FanZone_Question_Bank.docx).
 * Each phase has: count, difficulty, and preferred categories (in priority order).
 */
const PHASE_CONFIG: Record<MatchPhase, {
  count: number;
  difficulty: QuestionDifficulty;
  categories: string[]; // Preferred categories in order
}> = {
  PRE_MATCH:  { count: 0, difficulty: 'EASY',   categories: [] }, // Not used — matches detected after kickoff
  EARLY_H1:   { count: 2, difficulty: 'EASY',   categories: ['GOAL', 'CARD', 'STAT'] },
  MID_H1:     { count: 2, difficulty: 'MEDIUM', categories: ['VAR', 'SUB'] },
  LATE_H1:    { count: 1, difficulty: 'MEDIUM', categories: ['GOAL', 'CORNER'] },
  HALF_TIME:  { count: 2, difficulty: 'MEDIUM', categories: ['MOMENTUM', 'GOAL'] },
  EARLY_H2:   { count: 2, difficulty: 'MEDIUM', categories: ['SUB', 'VAR'] },
  MID_H2:     { count: 2, difficulty: 'HARD',   categories: ['CARD', 'GOAL'] },
  LATE_H2:    { count: 2, difficulty: 'HARD',   categories: ['TIME', 'GOAL'] },
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

/** Redis sliding window size — last N template IDs to avoid repetition */
const WINDOW_SIZE = 10;

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
   * Generates 1-2 scheduled questions for the new phase.
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

    const created = [];
    for (let i = 0; i < templates.length; i++) {
      const tpl = templates[i];
      // Only open the first question if no OPEN question exists; rest stay PENDING
      const shouldOpen = !existingOpen && created.length === 0;
      const question = await this.createFromTemplate(fixtureId, tpl, context, newPhase, elapsed, undefined, shouldOpen);
      if (question) {
        created.push(question);
        await this.recordUsedTemplate(fixtureId, tpl.id);
        state.questionsGenerated++;
        state.lastQuestionTime = Date.now();
      }
    }

    this.logger.log(
      `[${fixtureId}] Generated ${created.length} questions for phase ${newPhase}`,
    );

    return created;
  }

  /**
   * Called when a live match event arrives (goal, card, corner, VAR, sub).
   * May generate a trigger-based question if appropriate.
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
   * Create a question from a resolved template, auto-open it, and return it.
   */
  private async createFromTemplate(
    fixtureId: number,
    tpl: any,
    context: MatchContext,
    phase: MatchPhase,
    elapsed?: number,
    triggeredByEvent?: string,
    autoOpen: boolean = true,
  ) {
    try {
      // Resolve text (default to Vietnamese)
      const text = this.variableResolver.resolveText(tpl.textVi, context);
      const options = this.variableResolver.resolveOptions(tpl.options as any, context, 'vi');

      const now = new Date();
      const closesAt = new Date(now.getTime() + tpl.answerWindowSec * 1000);

      // For TIMEOUT_DEFAULT questions, compute when to auto-resolve
      const timeoutWindowMin = tpl.timeoutWindowMin as number | undefined;
      const resolvesAt = timeoutWindowMin
        ? new Date(now.getTime() + timeoutWindowMin * 60_000).toISOString()
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
        opensAt: now.toISOString(),
        closesAt: closesAt.toISOString(),
        resolvesAt,
        options: options.map((opt) => ({
          name: opt.name,
          emoji: opt.emoji,
          multiplier: opt.multiplier,
        })),
      });

      // Only open if autoOpen and no other OPEN question exists
      if (autoOpen) {
        await this.questionsService.openQuestion(question.id);
      }

      this.logger.log(
        `[${fixtureId}] Created question [${tpl.code}]: "${text}" (${phase}, ${autoOpen ? 'OPEN' : 'PENDING'})`,
      );

      return question;
    } catch (err) {
      this.logger.error(`[${fixtureId}] Failed to create question from template ${tpl.code}: ${err}`);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  //  Redis sliding window for template dedup
  // ──────────────────────────────────────────────

  private windowKey(fixtureId: number): string {
    return `window:fixture:${fixtureId}:templates`;
  }

  /**
   * Get ALL template IDs already used for this fixture from the DB.
   * This replaces the Redis sliding window — DB is the source of truth
   * and survives server restarts.
   */
  private async getUsedTemplateIds(fixtureId: number): Promise<string[]> {
    const questions = await this.questionsService.getTemplateIdsForFixture(fixtureId);
    return questions;
  }

  /**
   * Record a template ID as used (no-op now — DB is the source of truth).
   */
  private async recordUsedTemplate(_fixtureId: number, _templateId: string): Promise<void> {
    // Template ID is stored on the question record via createQuestion({ templateId })
    // No separate tracking needed
  }
}
