/*
 * THE REVIEWED LINKS BASELINE
 *
 * Counting a mapping proves nothing about whether it is the RIGHT mapping.
 *
 * Found by the Codex review of Stage 1. Every check in this project counted
 * the 347 alias links and the 20 crosswalk rules, and checked that each one
 * pointed at something that exists. None of them checked that it pointed at
 * the CORRECT thing. Repoint دعاوى عمالية from عمال to مدني and all 17 checks
 * still pass: the destination exists, the count is unchanged, nothing is
 * dangling.
 *
 * At Stage 2 that class of fault attaches historical work to the wrong lawyer,
 * or files matters under the wrong practice area. Nobody finds it for months,
 * because nothing is missing and nothing errors — the numbers all agree.
 *
 * WHAT THIS DOES
 *
 * A baseline records every link the firm actually reviewed, as a pair:
 *
 *     alias      "احمد سعيد"  ->  the person أحمد سعيد
 *     crosswalk  client_branch/النقض  ->  degree/نقض + its operational note
 *
 * `npm run db:check` then proves every recorded pair still holds. It is
 * deliberately one-directional:
 *
 *   ADDING a link is allowed.    New people, new spellings and new crosswalk
 *                                rules arrive throughout Stage 2, and a
 *                                baseline that forbade them would be edited
 *                                into uselessness within a week.
 *   CHANGING one is refused.     A reviewed pair that now points somewhere
 *                                else, or has vanished, fails the check by
 *                                name.
 *
 * Changing one deliberately is still possible — it takes
 * `npm run baseline:write -- --accept-changes`, which prints every difference
 * before writing. That is the point: a visible decision with a new baseline,
 * committed on its own, rather than a silent edit nobody reviews.
 *
 * WHY PEOPLE ARE IDENTIFIED BY NAME AND NOT BY id
 *
 * ids are an implementation detail and have already been renumbered once, by
 * the merges in migration 0006. A name is also what makes this file readable
 * by the people who reviewed the data. The trade-off is that renaming a
 * person breaks every baseline row that mentions them — which is correct: a
 * rename of a reviewed person IS a decision, and should be seen.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const BASELINE_PATH = 'scripts/baselines/reviewed-links.json';

export type AliasLink = { alias: string; person: string };

export type CrosswalkLink = {
  sourceField: string;
  sourceValue: string;
  targetField: string | null;
  targetValue: string | null;
  /* Optional only while reading a baseline created before task 2.6. Newly
   * written baselines always carry it. SPLIT rules use this as structured
   * migration data, so changing it can move a circuit or note. */
  reviewerNote?: string | null;
};

export type Baseline = {
  generatedAt: string;
  counts: { aliases: number; crosswalk: number };
  digest: string;
  aliases: AliasLink[];
  crosswalk: CrosswalkLink[];
};

/*
 * One difference between the baseline and the database, in words a person can
 * act on. `actual` is deliberately a sentence and not a value: "the spelling
 * is no longer in the database" is a different problem from "it now points at
 * someone else", and the two need different responses.
 */
export type Drift = {
  kind: 'alias' | 'crosswalk';
  subject: string;
  expected: string;
  actual: string;
};

/* -------------------------------------------------------------------------
 *  Canonical form
 *
 *  Sorted, so the file does not churn on row order, and so the digest means
 *  the same thing on two machines. Sorted by code point rather than by
 *  locale: an ICU collation can be changed, and a baseline that reorders
 *  itself when a collation changes is a baseline nobody trusts.
 * ---------------------------------------------------------------------- */

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/*
 * The key for a crosswalk rule.
 *
 * JSON rather than the two values joined by a separator. A separator cannot
 * carry a value that contains it, and these are Arabic strings typed by hand
 * into Access over six years — nobody controls what is in them. This project
 * has already been bitten by exactly that: the db:reset inventory was
 * `schema|table|count` until a table named `review|guard_fixture` broke the
 * parse and a real table read as empty. See "Validate what you receive" in
 * docs/MIGRATION.md.
 */
function ruleKey(rule: { sourceField: string; sourceValue: string }): string {
  return JSON.stringify([rule.sourceField, rule.sourceValue]);
}

export function sortAliases(links: AliasLink[]): AliasLink[] {
  return [...links].sort((x, y) => byCodePoint(x.alias, y.alias));
}

export function sortCrosswalk(links: CrosswalkLink[]): CrosswalkLink[] {
  return [...links].sort(
    (x, y) =>
      byCodePoint(x.sourceField, y.sourceField) || byCodePoint(x.sourceValue, y.sourceValue),
  );
}

export function digestOf(aliases: AliasLink[], crosswalk: CrosswalkLink[]): string {
  const canonical = JSON.stringify({
    aliases: sortAliases(aliases),
    crosswalk: sortCrosswalk(crosswalk),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/* -------------------------------------------------------------------------
 *  Reading the file
 *
 *  Every field is validated on arrival. A file this check cannot parse is a
 *  REFUSAL, never an empty baseline — an empty baseline verifies nothing and
 *  passes silently, which is the most dangerous default a safety check can
 *  have. See "Validate what you receive" in docs/MIGRATION.md.
 * ---------------------------------------------------------------------- */

function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${BASELINE_PATH}: ${where} must be a non-empty string`);
  }
  return value;
}

function strOrNull(value: unknown, where: string): string | null {
  if (value === null) return null;
  return str(value, where);
}

export function parseBaseline(raw: string): Baseline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${BASELINE_PATH} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${BASELINE_PATH}: expected an object`);
  }
  const root = parsed as Record<string, unknown>;

  const rawAliases = root['aliases'];
  const rawCrosswalk = root['crosswalk'];
  if (!Array.isArray(rawAliases)) throw new Error(`${BASELINE_PATH}: "aliases" must be an array`);
  if (!Array.isArray(rawCrosswalk))
    throw new Error(`${BASELINE_PATH}: "crosswalk" must be an array`);

  const aliases: AliasLink[] = rawAliases.map((entry, i) => {
    const row = entry as Record<string, unknown>;
    return {
      alias: str(row['alias'], `aliases[${i}].alias`),
      person: str(row['person'], `aliases[${i}].person`),
    };
  });

  const crosswalk: CrosswalkLink[] = rawCrosswalk.map((entry, i) => {
    const row = entry as Record<string, unknown>;
    const reviewerNote = row['reviewerNote'];
    return {
      sourceField: str(row['sourceField'], `crosswalk[${i}].sourceField`),
      sourceValue: str(row['sourceValue'], `crosswalk[${i}].sourceValue`),
      targetField: strOrNull(row['targetField'], `crosswalk[${i}].targetField`),
      targetValue: strOrNull(row['targetValue'], `crosswalk[${i}].targetValue`),
      ...(reviewerNote === undefined
        ? {}
        : { reviewerNote: strOrNull(reviewerNote, `crosswalk[${i}].reviewerNote`) }),
    };
  });

  // A spelling belongs to one person, so a repeated key means the file itself
  // is contradictory and there is no way to know which row to believe.
  const seen = new Set<string>();
  for (const link of aliases) {
    if (seen.has(link.alias)) {
      throw new Error(`${BASELINE_PATH}: the spelling ${link.alias} is listed twice`);
    }
    seen.add(link.alias);
  }
  const seenRules = new Set<string>();
  for (const link of crosswalk) {
    const key = ruleKey(link);
    if (seenRules.has(key)) {
      throw new Error(
        `${BASELINE_PATH}: the rule ${link.sourceField}/${link.sourceValue} is listed twice`,
      );
    }
    seenRules.add(key);
  }

  const digest = str(root['digest'], 'digest');
  const recomputed = digestOf(aliases, crosswalk);
  if (digest !== recomputed) {
    throw new Error(
      `${BASELINE_PATH}: the digest does not match its own contents.\n` +
        `  recorded:   ${digest}\n` +
        `  recomputed: ${recomputed}\n` +
        `The file has been hand-edited. Regenerate it with:\n` +
        `  npm run baseline:write -- --accept-changes`,
    );
  }

  const counts = (root['counts'] ?? {}) as Record<string, unknown>;
  if (counts['aliases'] !== aliases.length || counts['crosswalk'] !== crosswalk.length) {
    throw new Error(
      `${BASELINE_PATH}: the stated counts (${String(counts['aliases'])} aliases, ` +
        `${String(counts['crosswalk'])} rules) do not match the rows present ` +
        `(${aliases.length}, ${crosswalk.length})`,
    );
  }

  return {
    generatedAt: str(root['generatedAt'], 'generatedAt'),
    counts: { aliases: aliases.length, crosswalk: crosswalk.length },
    digest,
    aliases,
    crosswalk,
  };
}

export function readBaseline(path: string = BASELINE_PATH): Baseline {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `${path} is missing. It records every link the firm reviewed.\n` +
        `Create it with:  npm run baseline:write`,
    );
  }
  return parseBaseline(raw);
}

/* -------------------------------------------------------------------------
 *  Comparing
 * ---------------------------------------------------------------------- */

export function compare(
  baseline: Baseline,
  current: { aliases: AliasLink[]; crosswalk: CrosswalkLink[] },
): Drift[] {
  const drift: Drift[] = [];

  const aliasNow = new Map(current.aliases.map((a) => [a.alias, a.person]));
  for (const link of baseline.aliases) {
    const person = aliasNow.get(link.alias);
    if (person === undefined) {
      drift.push({
        kind: 'alias',
        subject: link.alias,
        expected: link.person,
        actual: 'the spelling is no longer in the database',
      });
    } else if (person !== link.person) {
      drift.push({
        kind: 'alias',
        subject: link.alias,
        expected: link.person,
        actual: `now resolves to ${person}`,
      });
    }
  }

  const target = (field: string | null, value: string | null): string =>
    field === null ? '(discarded)' : value === null ? field : `${field}/${value}`;

  const ruleNow = new Map(current.crosswalk.map((c) => [ruleKey(c), c]));
  for (const link of baseline.crosswalk) {
    const key = ruleKey(link);
    const now = ruleNow.get(key);
    const was = target(link.targetField, link.targetValue);
    if (now === undefined) {
      drift.push({
        kind: 'crosswalk',
        subject: `${link.sourceField}/${link.sourceValue}`,
        expected: was,
        actual: 'the rule is no longer in the database',
      });
    } else if (target(now.targetField, now.targetValue) !== was) {
      drift.push({
        kind: 'crosswalk',
        subject: `${link.sourceField}/${link.sourceValue}`,
        expected: was,
        actual: `now points at ${target(now.targetField, now.targetValue)}`,
      });
    } else if (
      Object.prototype.hasOwnProperty.call(link, 'reviewerNote') &&
      now.reviewerNote !== link.reviewerNote
    ) {
      drift.push({
        kind: 'crosswalk',
        subject: `${link.sourceField}/${link.sourceValue}`,
        expected: `reviewer note ${link.reviewerNote ?? '(none)'}`,
        actual: `reviewer note is now ${now.reviewerNote ?? '(none)'}`,
      });
    }
  }

  return drift;
}

/* Links present in the database that the baseline does not record. Allowed,
 * and reported only so that a growing number is visible rather than silent. */
export function additions(
  baseline: Baseline,
  current: { aliases: AliasLink[]; crosswalk: CrosswalkLink[] },
): { aliases: number; crosswalk: number } {
  const knownAliases = new Set(baseline.aliases.map((a) => a.alias));
  const knownRules = new Set(baseline.crosswalk.map((c) => ruleKey(c)));
  return {
    aliases: current.aliases.filter((a) => !knownAliases.has(a.alias)).length,
    crosswalk: current.crosswalk.filter((c) => !knownRules.has(ruleKey(c))).length,
  };
}
