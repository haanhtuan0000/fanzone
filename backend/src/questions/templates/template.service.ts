import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MatchPhase, QuestionDifficulty } from '@prisma/client';

export interface TemplateCriteria {
  phases?: MatchPhase[];
  difficulty?: QuestionDifficulty;
  trigger?: string;
  excludeIds?: string[];
  category?: string;
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Select a single template using weighted random selection.
   * Excludes templates whose IDs are in excludeIds (already used).
   */
  async selectTemplate(criteria: TemplateCriteria) {
    const candidates = await this.queryCandidates(criteria);
    if (candidates.length === 0) {
      this.logger.warn(`No templates found for criteria: ${JSON.stringify(criteria)}`);
      return null;
    }

    return this.weightedRandom(candidates);
  }

  /**
   * Select templates appropriate for a given match phase.
   * Returns 1-2 templates, avoiding previously used ones and preferring the given difficulty.
   */
  async selectForPhase(
    phase: MatchPhase,
    excludeIds: string[] = [],
    preferredDifficulty?: QuestionDifficulty,
    count: number = 1,
  ) {
    const selected: any[] = [];

    // First pass: try preferred difficulty
    if (preferredDifficulty) {
      const tpl = await this.selectTemplate({
        phases: [phase],
        difficulty: preferredDifficulty,
        trigger: 'SCHEDULED',
        excludeIds: [...excludeIds, ...selected.map((s) => s.id)],
      });
      if (tpl) selected.push(tpl);
    }

    // Fill remaining slots with any difficulty
    while (selected.length < count) {
      const tpl = await this.selectTemplate({
        phases: [phase],
        trigger: 'SCHEDULED',
        excludeIds: [...excludeIds, ...selected.map((s) => s.id)],
      });
      if (!tpl) break; // No more candidates
      selected.push(tpl);
    }

    return selected;
  }

  /**
   * Select a template for an event trigger (e.g., EVENT_GOAL, EVENT_CARD).
   */
  async selectForEvent(
    trigger: string,
    phase: MatchPhase,
    excludeIds: string[] = [],
  ) {
    return this.selectTemplate({
      trigger,
      phases: [phase],
      excludeIds,
    });
  }

  /**
   * Query candidate templates from the database matching the given criteria.
   */
  private async queryCandidates(criteria: TemplateCriteria) {
    const where: any = {
      isActive: true,
    };

    if (criteria.trigger) {
      where.trigger = criteria.trigger;
    }

    if (criteria.difficulty) {
      where.difficulty = criteria.difficulty;
    }

    if (criteria.category) {
      where.category = criteria.category;
    }

    if (criteria.excludeIds && criteria.excludeIds.length > 0) {
      where.id = { notIn: criteria.excludeIds };
    }

    // phases is a PostgreSQL array — use hasSome for overlap check
    if (criteria.phases && criteria.phases.length > 0) {
      where.phases = { hasSome: criteria.phases };
    }

    return this.prisma.questionTemplate.findMany({ where });
  }

  /**
   * Weighted random selection from a list of templates.
   * Templates with higher weight are more likely to be selected.
   */
  private weightedRandom(templates: Array<{ id: string; weight: number; [key: string]: any }>) {
    const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;

    for (const tpl of templates) {
      random -= tpl.weight;
      if (random <= 0) return tpl;
    }

    // Fallback (should not happen)
    return templates[templates.length - 1];
  }
}
