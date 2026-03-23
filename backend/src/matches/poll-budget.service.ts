import { Injectable, Logger } from '@nestjs/common';

/**
 * Tracks API-Football call budget per hour.
 * Pro plan: 7,500/day. Budget: ~900/hour during peak.
 */
@Injectable()
export class PollBudgetService {
  private readonly logger = new Logger(PollBudgetService.name);
  private callsThisHour = 0;
  private hourStart = Date.now();
  private readonly MAX_PER_HOUR = 900;

  private maybeResetHour() {
    if (Date.now() - this.hourStart > 3600_000) {
      this.logger.log(`Hour reset: ${this.callsThisHour} API calls in last hour`);
      this.callsThisHour = 0;
      this.hourStart = Date.now();
    }
  }

  recordCall(count = 1) {
    this.callsThisHour += count;
  }

  canMakeCall(): boolean {
    this.maybeResetHour();
    return this.callsThisHour < this.MAX_PER_HOUR;
  }

  /** When > 80% budget used, pollers should reduce frequency */
  isThrottled(): boolean {
    this.maybeResetHour();
    return this.callsThisHour > this.MAX_PER_HOUR * 0.8;
  }

  getUsage(): { calls: number; max: number; pct: number } {
    this.maybeResetHour();
    return {
      calls: this.callsThisHour,
      max: this.MAX_PER_HOUR,
      pct: Math.round((this.callsThisHour / this.MAX_PER_HOUR) * 100),
    };
  }
}
