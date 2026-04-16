/**
 * The exhaustive set of placeholders that `VariableResolver.buildMatchContext`
 * sources from the cached lineup. If any of these appears in a template's
 * question text or an option name AND the lineup is not loaded, the resolver
 * silently substitutes generic fallback text like "Mutondo Stars striker" —
 * which then gets persisted as the option name and locks the question into a
 * useless state forever (observed on fixture 1416163 Mutondo Stars vs Green
 * Eagles, Zambia Super League).
 *
 * Templates matching this list must not be selected for a phase until real
 * lineup data is available in Redis.
 *
 * Keep this list in sync with the lineup-sourced fields in
 * `backend/src/questions/templates/variable-resolver.service.ts` — the
 * per-placeholder test in `lineup-dependency.spec.ts` fails loudly if a
 * future variable is added there without being mirrored here.
 */
export const LINEUP_DEPENDENT_PLACEHOLDERS: readonly string[] = [
  '{home_striker}', '{away_striker}',
  '{home_midfielder}', '{away_midfielder}',
  '{home_keeper}', '{away_keeper}',
  '{risky_player_home}', '{risky_player_away}',
  '{home_sub_striker}', '{away_sub_striker}',
  '{sub_midfielder}',
];

/** Shape of what `templateNeedsLineup` inspects. Structurally matches both
 *  the Prisma `QuestionTemplate` row and the seed-bank template literal. */
export type TemplateLike = {
  textEn?: string | null;
  textVi?: string | null;
  options?: ReadonlyArray<{
    nameEn?: string | null;
    nameVi?: string | null;
  }> | null;
};

/** True if the template's question text or any option name references a
 *  lineup-sourced placeholder. Pure function — no DB, no Redis, no side
 *  effects — so it can be unit-tested without a harness and the rule is
 *  visible in a diff when it changes. */
export function templateNeedsLineup(tpl: TemplateLike): boolean {
  const strings: string[] = [
    tpl.textEn ?? '',
    tpl.textVi ?? '',
    ...(tpl.options ?? []).flatMap((o) => [o.nameEn ?? '', o.nameVi ?? '']),
  ];
  return strings.some((s) =>
    LINEUP_DEPENDENT_PLACEHOLDERS.some((p) => s.includes(p)),
  );
}
