import { Injectable, Logger } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { MatchScenarioEngine, MatchEvent, MatchTeams } from './scenario/match-scenario.engine';

@Injectable()
export class QuestionGeneratorService {
  private readonly logger = new Logger(QuestionGeneratorService.name);

  constructor(
    private questionsService: QuestionsService,
    private scenarioEngine: MatchScenarioEngine,
  ) {}

  async openQuestion(questionId: string) {
    return this.questionsService.openQuestion(questionId);
  }

  /**
   * Generate question(s) from a live match event.
   * Delegates to MatchScenarioEngine for template-based generation.
   */
  async generateFromEvent(
    fixtureId: number,
    event: MatchEvent,
    teams: MatchTeams,
    score?: { home: number; away: number },
  ) {
    return this.scenarioEngine.onMatchEvent(fixtureId, event, teams, score);
  }

  /**
   * Called when the match phase changes.
   * Generates scheduled questions for the new phase.
   */
  async generateForPhase(
    fixtureId: number,
    elapsed: number,
    teams: MatchTeams,
    score?: { home: number; away: number },
    period?: string,
  ) {
    const phase = this.scenarioEngine.determinePhase(elapsed, period);
    return this.scenarioEngine.onPhaseChange(fixtureId, phase, teams, elapsed, score);
  }

  /**
   * Map elapsed minutes to internal phase (EARLY_H1, MID_H1, etc.).
   */
  determinePhase(elapsed: number, period?: string): string {
    return this.scenarioEngine.determinePhase(elapsed, period);
  }

  /**
   * Catch-up generation for matches discovered mid-game.
   * Generates for the previous phase + current phase so the user
   * gets a reasonable question pipeline instead of just 2 questions.
   */
  async generateCatchUp(
    fixtureId: number,
    elapsed: number,
    teams: { home: string; away: string },
    score?: { home: number; away: number },
    period?: string,
  ) {
    const PHASE_ORDER = [
      'PRE_MATCH', 'EARLY_H1', 'MID_H1', 'LATE_H1',
      'HALF_TIME', 'EARLY_H2', 'MID_H2', 'LATE_H2',
    ];
    const currentPhase = this.scenarioEngine.determinePhase(elapsed, period);
    const currentIdx = PHASE_ORDER.indexOf(currentPhase);
    const results = [];

    // Generate for 1 previous phase (catch-up) — the Redis guard prevents duplicates
    if (currentIdx > 0) {
      const prevPhase = PHASE_ORDER[currentIdx - 1];
      const prev = await this.scenarioEngine.onPhaseChange(
        fixtureId, prevPhase as any, teams, elapsed, score,
      );
      results.push(...prev);
    }

    // Generate for current phase
    const current = await this.scenarioEngine.onPhaseChange(
      fixtureId, currentPhase as any, teams, elapsed, score,
    );
    results.push(...current);

    return results;
  }

  /**
   * Cleanup scenario state when a fixture ends.
   */
  async cleanupFixture(fixtureId: number) {
    return this.scenarioEngine.cleanup(fixtureId);
  }
}
