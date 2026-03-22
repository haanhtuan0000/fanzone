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
   * Cleanup scenario state when a fixture ends.
   */
  async cleanupFixture(fixtureId: number) {
    return this.scenarioEngine.cleanup(fixtureId);
  }
}
