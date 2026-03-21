import { Injectable, Logger } from '@nestjs/common';
import { QuestionsService } from './questions.service';

interface MatchEvent {
  type: string;
  detail?: string;
  player?: { name: string };
  team?: { name: string };
  time?: { elapsed: number };
}

@Injectable()
export class QuestionGeneratorService {
  private readonly logger = new Logger(QuestionGeneratorService.name);
  private lastQuestionTime: Map<number, number> = new Map();
  private readonly COOLDOWN_MS = 60000; // 60 seconds between questions

  constructor(private questionsService: QuestionsService) {}

  async openQuestion(questionId: string) {
    return this.questionsService.openQuestion(questionId);
  }

  async generateFromEvent(fixtureId: number, event: MatchEvent, teams: { home: string; away: string }) {
    const now = Date.now();
    const lastTime = this.lastQuestionTime.get(fixtureId) || 0;
    if (now - lastTime < this.COOLDOWN_MS) {
      this.logger.debug(`Cooldown active for fixture ${fixtureId}, skipping`);
      return null;
    }

    const questionData = this.mapEventToQuestion(fixtureId, event, teams);
    if (!questionData) return null;

    this.lastQuestionTime.set(fixtureId, now);
    return this.questionsService.createQuestion(questionData);
  }

  private mapEventToQuestion(
    fixtureId: number,
    event: MatchEvent,
    teams: { home: string; away: string },
  ) {
    const opensAt = new Date();
    const closesAt = new Date(Date.now() + 30000); // 30 seconds to answer

    switch (event.type?.toLowerCase()) {
      case 'goal':
        return {
          fixtureId,
          category: 'GOAL',
          text: 'Ai ghi ban tiep theo?',
          rewardCoins: 50,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          options: [
            { name: teams.home, emoji: '\u26BD' },
            { name: teams.away, emoji: '\u26BD' },
            { name: 'Khong co ban nao', emoji: '\uD83D\uDEAB' },
          ],
        };

      case 'card':
        if (event.detail === 'Yellow Card') {
          return {
            fixtureId,
            category: 'CARD',
            text: 'Cau thu nao bi the do tiep?',
            rewardCoins: 75,
            opensAt: opensAt.toISOString(),
            closesAt: closesAt.toISOString(),
            options: [
              { name: teams.home + ' player', emoji: '\uD83D\uDFE5' },
              { name: teams.away + ' player', emoji: '\uD83D\uDFE5' },
              { name: 'Khong ai', emoji: '\u2705' },
            ],
          };
        }
        return null;

      case 'subst':
        return {
          fixtureId,
          category: 'SUBSTITUTION',
          text: `Nguoi thay vao se ghi ban?`,
          rewardCoins: 100,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          options: [
            { name: 'Co', emoji: '\u26BD' },
            { name: 'Khong', emoji: '\u274C' },
          ],
        };

      case 'var':
        return {
          fixtureId,
          category: 'VAR',
          text: 'VAR co lat nguoc quyet dinh?',
          rewardCoins: 75,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          options: [
            { name: 'Co', emoji: '\uD83D\uDCFA' },
            { name: 'Khong', emoji: '\u274C' },
          ],
        };

      default:
        return null;
    }
  }
}
