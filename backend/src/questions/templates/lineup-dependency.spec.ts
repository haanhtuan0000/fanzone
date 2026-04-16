import {
  LINEUP_DEPENDENT_PLACEHOLDERS,
  templateNeedsLineup,
  TemplateLike,
} from './lineup-dependency';

/**
 * These tests pin the rule that stops Q001-style questions from being
 * persisted with garbage fallback options ("Mutondo Stars striker",
 * "Green Eagles striker") when the match lineup isn't loaded.
 *
 * The bug shape on real data (fixture 1416163) was: options inherited the
 * resolver's "{team} striker" fallback because `{home_striker}` resolved
 * to a synthetic string instead of a real player name. This helper lets
 * the scenario engine filter those templates out of the selection pool
 * before they ever hit the resolver.
 */
describe('templateNeedsLineup — matches any lineup placeholder in text or options', () => {
  it('Q001 shape (option names use {home_striker}) → true', () => {
    const tpl: TemplateLike = {
      textEn: 'Who will score next?',
      options: [
        { nameEn: '{home_striker}', nameVi: '{home_striker}' },
        { nameEn: '{away_striker}', nameVi: '{away_striker}' },
        { nameEn: 'Other player',   nameVi: 'Cầu thủ khác' },
      ],
    };
    expect(templateNeedsLineup(tpl)).toBe(true);
  });

  it('Q032 shape (question text references {home_striker}) → true', () => {
    const tpl: TemplateLike = {
      textEn: 'Will {home_striker} score in this match?',
      textVi: '{home_striker} có ghi bàn trong trận không?',
      options: [
        { nameEn: 'Yes — H1', nameVi: 'Có — H1' },
        { nameEn: 'No',       nameVi: 'Không' },
      ],
    };
    expect(templateNeedsLineup(tpl)).toBe(true);
  });

  it('Q012 shape (risky_player_home in options) → true', () => {
    const tpl: TemplateLike = {
      textEn: 'Who gets the next card?',
      options: [
        { nameEn: '{risky_player_home}', nameVi: '{risky_player_home}' },
        { nameEn: '{risky_player_away}', nameVi: '{risky_player_away}' },
        { nameEn: 'Nobody',              nameVi: 'Không ai' },
      ],
    };
    expect(templateNeedsLineup(tpl)).toBe(true);
  });

  it('lineup-free template (only {home_team}/{away_team}) → false', () => {
    // Q038-style "Home or Away gets more cards?" template. Resolves from
    // fixture teams, never needs a lineup.
    const tpl: TemplateLike = {
      textEn: '{home_team} or {away_team} gets more cards?',
      textVi: '{home_team} hay {away_team} nhận nhiều thẻ hơn?',
      options: [
        { nameEn: '{home_team} more', nameVi: '{home_team} nhiều hơn' },
        { nameEn: '{away_team} more', nameVi: '{away_team} nhiều hơn' },
        { nameEn: 'Equal',            nameVi: 'Bằng nhau' },
      ],
    };
    expect(templateNeedsLineup(tpl)).toBe(false);
  });

  it('fully empty template (no text, no options) → false', () => {
    expect(templateNeedsLineup({})).toBe(false);
    expect(templateNeedsLineup({ textEn: '', options: [] })).toBe(false);
  });

  it('options with null strings → false (no false positives on missing data)', () => {
    const tpl: TemplateLike = {
      textEn: 'Some question',
      options: [{ nameEn: null, nameVi: null }],
    };
    expect(templateNeedsLineup(tpl)).toBe(false);
  });

  // Per-placeholder coverage. If a future schema change adds a lineup-sourced
  // variable to VariableResolver without updating LINEUP_DEPENDENT_PLACEHOLDERS,
  // the corresponding test below will fail silently — but the companion test
  // in engine.spec.ts ("no lineup cached → Q001-style filtered") will fail
  // loudly because the engine filter then misses the new placeholder.
  describe('each placeholder in the canonical list is matched on its own', () => {
    for (const placeholder of LINEUP_DEPENDENT_PLACEHOLDERS) {
      it(`${placeholder} alone in a single option → true`, () => {
        const tpl: TemplateLike = {
          options: [{ nameEn: placeholder }],
        };
        expect(templateNeedsLineup(tpl)).toBe(true);
      });
    }
  });
});
