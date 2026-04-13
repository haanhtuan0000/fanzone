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
   * Generates for ALL phases from EARLY_H1 up to and including current phase.
   * Skips PRE_MATCH (only relevant before kickoff).
   * The Redis guard in onPhaseChange prevents duplicate generation per phase.
   *
   * Example: match discovered at minute 70 (MID_H2):
   *   → generates EARLY_H1, MID_H1, LATE_H1, HALF_TIME, EARLY_H2, MID_H2
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

    // For PRE_MATCH only (before kickoff): just current phase
    if (currentIdx === 0) {
      const current = await this.scenarioEngine.onPhaseChange(
        fixtureId, currentPhase as any, teams, elapsed, score,
      );
      results.push(...current);
      return results;
    }

    // Match has started: generate for ALL phases from EARLY_H1 (idx 1) to current (inclusive)
    for (let i = 1; i <= currentIdx; i++) {
      const phase = PHASE_ORDER[i];
      const generated = await this.scenarioEngine.onPhaseChange(
        fixtureId, phase as any, teams, elapsed, score,
      );
      results.push(...generated);
    }

    return results;
  }

  /**
   * Cleanup scenario state when a fixture ends.
   */
  async cleanupFixture(fixtureId: number) {
    return this.scenarioEngine.cleanup(fixtureId);
  }
}
