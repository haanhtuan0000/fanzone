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
 * Question distribution per phase.
 * Defines how many scheduled questions to generate and the preferred difficulty.
 */
const PHASE_CONFIG: Record<MatchPhase, { count: number; difficulty: QuestionDifficulty }> = {
  PRE_MATCH: { count: 1, difficulty: 'EASY' },
  EARLY_H1: { count: 2, difficulty: 'EASY' },
  MID_H1: { count: 2, difficulty: 'MEDIUM' },
  LATE_H1: { count: 1, difficulty: 'MEDIUM' },
  HALF_TIME: { count: 2, difficulty: 'MEDIUM' },
  EARLY_H2: { count: 2, difficulty: 'MEDIUM' },
  MID_H2: { count: 2, difficulty: 'HARD' },
  LATE_H2: { count: 1, difficulty: 'HARD' },
};

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

    const config = PHASE_CONFIG[newPhase];
    const excludeIds = await this.getUsedTemplateIds(fixtureId);

    const templates = await this.templateService.selectForPhase(
      newPhase,
      excludeIds,
      config.difficulty,
      config.count,
    );

    const context = await this.variableResolver.buildMatchContext(
      fixtureId,
      teams,
      elapsed,
      score,
    );

    const created = [];
    for (const tpl of templates) {
      const question = await this.createFromTemplate(fixtureId, tpl, context, newPhase, elapsed);
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
  ) {
    try {
      // Resolve text (default to Vietnamese)
      const text = this.variableResolver.resolveText(tpl.textVi, context);
      const options = this.variableResolver.resolveOptions(tpl.options as any, context, 'vi');

      const now = new Date();
      const closesAt = new Date(now.getTime() + tpl.answerWindowSec * 1000);

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
        options: options.map((opt) => ({
          name: opt.name,
          emoji: opt.emoji,
          multiplier: opt.multiplier,
        })),
      });

      // Auto-open the question immediately
      await this.questionsService.openQuestion(question.id);

      this.logger.log(
        `[${fixtureId}] Created & opened question [${tpl.code}]: "${text}" (${phase}, ${tpl.difficulty})`,
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
   * Get the list of recently used template IDs for this fixture.
   */
  private async getUsedTemplateIds(fixtureId: number): Promise<string[]> {
    const client = this.redis.getClient();
    const ids = await client.lrange(this.windowKey(fixtureId), 0, -1);
    return ids;
  }

  /**
   * Record a template ID as used, maintaining a sliding window.
   */
  private async recordUsedTemplate(fixtureId: number, templateId: string): Promise<void> {
    const key = this.windowKey(fixtureId);
    const client = this.redis.getClient();
    await client.lpush(key, templateId);
    await client.ltrim(key, 0, WINDOW_SIZE - 1);
    await client.expire(key, WINDOW_TTL_SEC);
  }
}
