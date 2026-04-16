import { Test, TestingModule } from '@nestjs/testing';
import { VariableResolverService, MatchContext } from './variable-resolver.service';
import { RedisService } from '../../common/redis/redis.service';
import { createMockRedis } from '../../test/mock-factories';

/**
 * Covers the two "silent fallback" rules tightened to prevent the
 * Mutondo Stars "striker" class of bug:
 *
 *   1. `resolveText({ strict: true })` must THROW on an unresolved
 *      variable instead of returning the raw `{placeholder}`.
 *   2. `buildMatchContext` must return `null` for lineup-sourced fields
 *      when no lineup is cached — NOT synthesised strings like
 *      "Mutondo Stars striker" that look like real data but aren't.
 */
describe('VariableResolverService', () => {
  let service: VariableResolverService;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    redis = createMockRedis();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VariableResolverService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get(VariableResolverService);
  });

  // ────────────────────────────────────────────────────────────────
  //  resolveText — strict mode
  // ────────────────────────────────────────────────────────────────

  describe('resolveText — strict mode throws on unresolved variables', () => {
    const happyContext = {
      home_team: 'Arsenal',
      away_team: 'Sporting CP',
    } as unknown as MatchContext;

    it('strict + all variables present → same result as non-strict', () => {
      const tpl = '{home_team} vs {away_team}';
      expect(service.resolveText(tpl, happyContext)).toBe('Arsenal vs Sporting CP');
      expect(service.resolveText(tpl, happyContext, { strict: true })).toBe('Arsenal vs Sporting CP');
    });

    it('non-strict + missing variable → keeps placeholder (legacy behavior)', () => {
      const tpl = 'Will {home_striker} score?';
      // home_striker not in the context → value undefined → placeholder kept.
      const out = service.resolveText(tpl, happyContext);
      expect(out).toBe('Will {home_striker} score?');
    });

    it('strict + missing variable → throws with a useful message', () => {
      const tpl = 'Will {home_striker} score?';
      expect(() => service.resolveText(tpl, happyContext, { strict: true })).toThrow(
        /unresolved variable "home_striker"/,
      );
    });

    it('strict + null value → throws (the Part C code path: lineup fields are null when missing)', () => {
      // Regression pin — this is the exact shape resolveText sees when C is
      // in effect and no lineup cached. Without strict, it would return the
      // literal placeholder; without C it would return "Team striker".
      const ctx = { ...happyContext, home_striker: null as unknown as string } as MatchContext;
      const tpl = 'Will {home_striker} score?';
      expect(() => service.resolveText(tpl, ctx, { strict: true })).toThrow(
        /unresolved variable "home_striker"/,
      );
    });

    it('resolveOptions propagates strict to each option name', () => {
      // Q001-style template with an unresolved placeholder in options.
      const options = [
        { nameEn: 'Harry Kane', nameVi: 'Harry Kane', emoji: '⚽', defaultPct: 40 },
        { nameEn: '{away_striker}', nameVi: '{away_striker}', emoji: '⚽', defaultPct: 30 },
      ];
      // Non-strict (default) — keeps the placeholder.
      const loose = service.resolveOptions(options, happyContext, 'en');
      expect(loose[1].name).toBe('{away_striker}');
      // Strict — throws.
      expect(() => service.resolveOptions(options, happyContext, 'en', { strict: true })).toThrow(
        /unresolved variable "away_striker"/,
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  //  buildMatchContext — null for missing lineup data (Part C)
  // ────────────────────────────────────────────────────────────────

  describe('buildMatchContext — returns null for lineup fields when cache missing', () => {
    it('no lineup cached → every lineup-sourced field is null (not a fake string)', async () => {
      // Regression pin for Mutondo Stars vs Green Eagles. Before the fix the
      // resolver synthesised "Mutondo Stars striker" from teams.home and
      // persisted it. Now these fields are null; the engine skips lineup-
      // dependent templates up-front, and strict resolveText would catch
      // any that slip through.
      redis.getJson.mockResolvedValue(null);
      const ctx = await service.buildMatchContext(
        1234,
        { home: 'Mutondo Stars', away: 'Green Eagles' },
        12,
        { home: 0, away: 0 },
      );
      expect(ctx.home_striker).toBeNull();
      expect(ctx.away_striker).toBeNull();
      expect(ctx.home_midfielder).toBeNull();
      expect(ctx.away_midfielder).toBeNull();
      expect(ctx.home_keeper).toBeNull();
      expect(ctx.away_keeper).toBeNull();
      expect(ctx.risky_player_home).toBeNull();
      expect(ctx.risky_player_away).toBeNull();
      expect(ctx.home_sub_striker).toBeNull();
      expect(ctx.away_sub_striker).toBeNull();
      expect(ctx.sub_midfielder).toBeNull();

      // Team names and scores must still work — they don't need lineup data.
      expect(ctx.home_team).toBe('Mutondo Stars');
      expect(ctx.away_team).toBe('Green Eagles');
      expect(ctx._hasLineup).toBe('false');
    });

    it('partial lineup (home only) → home fields populated, away fields null', async () => {
      redis.getJson.mockResolvedValue({
        home: { strikers: ['Lukas Nmecha'], midfielders: ['Rodri'], goalkeeper: 'Ederson' },
        away: { strikers: [], midfielders: [], goalkeeper: null },
      });
      const ctx = await service.buildMatchContext(
        1,
        { home: 'Man City', away: 'Bayern' },
        5,
        { home: 0, away: 0 },
      );
      expect(ctx.home_striker).toBe('Lukas Nmecha');
      expect(ctx.home_midfielder).toBe('Rodri');
      expect(ctx.home_keeper).toBe('Ederson');
      expect(ctx.away_striker).toBeNull();
      expect(ctx.away_midfielder).toBeNull();
      expect(ctx.away_keeper).toBeNull();
    });

    it('full lineup → every lineup field populated; none are null', async () => {
      redis.getJson.mockResolvedValue({
        home: {
          strikers: ['Haaland', 'Alvarez'],
          midfielders: ['Rodri', 'De Bruyne', 'Foden'],
          goalkeeper: 'Ederson',
        },
        away: {
          strikers: ['Kane', 'Muller'],
          midfielders: ['Kimmich', 'Goretzka', 'Musiala'],
          goalkeeper: 'Neuer',
        },
      });
      const ctx = await service.buildMatchContext(
        1,
        { home: 'Man City', away: 'Bayern' },
        5,
        { home: 0, away: 0 },
      );
      for (const key of [
        'home_striker', 'away_striker',
        'home_midfielder', 'away_midfielder',
        'home_keeper', 'away_keeper',
        'risky_player_home', 'risky_player_away',
        'home_sub_striker', 'away_sub_striker',
        'sub_midfielder',
      ] as const) {
        expect(ctx[key]).not.toBeNull();
      }
    });
  });
});
