/*
 * Proves the application can actually reach the database and that the
 * database is in the state the application expects.
 *
 *     npm run db:check
 *
 * Every line must read OK. This exists because "the container is running" and
 * "the application can use the database" are different claims, and only the
 * second one matters.
 */

import 'dotenv/config';
import { db } from '../src/lib/db';

type Check = { name: string; expected: string; actual: string; ok: boolean };

const checks: Check[] = [];

function record(name: string, expected: string, actual: string, ok: boolean) {
  checks.push({ name, expected, actual, ok });
}

/*
 * A query that returns nothing is a failure, not an empty value to shrug at.
 * Say so here rather than letting an undefined travel onwards.
 */
function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${what}: the database returned no rows`);
  }
  return row;
}

async function main() {
  // 1. Can we connect at all?
  const { version } = one(
    await db.$queryRaw<{ version: string }[]>`
      SELECT current_setting('server_version') AS version`,
    'server version',
  );
  const major = Number(version.split('.')[0]);
  record('Connects to PostgreSQL', '16 or newer', version, major >= 16);

  // 2. Did migration 0001 run?
  const { count: migrations } = one(
    await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    'migration count',
  );
  record('Migrations applied', 'at least 1', String(migrations), migrations >= 1n);

  // 3. Extensions, from migration 0001.
  const extensions = await db.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension
    WHERE extname IN ('pg_trgm', 'btree_gin', 'unaccent') ORDER BY extname`;
  record(
    'Search extensions',
    'btree_gin, pg_trgm, unaccent',
    extensions.map((e) => e.extname).join(', ') || '(none)',
    extensions.length === 3,
  );

  // 4. Arabic must survive the round trip through the driver, not only
  //    through psql. A wrong client encoding shows up here and nowhere else.
  const arabic = 'الدعاوى والجلسات والتوكيلات';
  const { echoed } = one(
    await db.$queryRaw<{ echoed: string }[]>`SELECT ${arabic}::text AS echoed`,
    'Arabic round trip',
  );
  record('Arabic survives the driver', arabic, echoed, echoed === arabic);

  // 5. The collation must SORT correctly, not merely exist. أحمد and احمد are
  //    the same name, one written without the hamza; they must sit together,
  //    both before بسام.
  const sorted = await db.$queryRaw<{ word: string }[]>`
    SELECT word FROM unnest(ARRAY['بسام', 'احمد', 'أحمد']) AS word
    ORDER BY word COLLATE "arabic"`;
  const order = sorted.map((r) => r.word);
  record('Arabic sorts correctly', '… ,… ,بسام last', order.join(' '), order[2] === 'بسام');

  // 6. The nine lookup lists, through Prisma rather than raw SQL — so this
  //    also proves the generated client matches the tables that exist.
  //
  //    Rule 15: state the count, fail loudly if it differs. The migration
  //    asserts these once, when it runs; this asserts them every time anyone
  //    checks the database, which is when a later mistake would show up.
  const expectedLookups: Array<[string, () => Promise<number>, number]> = [
    ['matter_type', () => db.lookupMatterType.count(), 14],
    ['matter_category', () => db.lookupMatterCategory.count(), 21],
    ['degree', () => db.lookupDegree.count(), 12],
    ['venue', () => db.lookupVenue.count(), 7],
    ['importance', () => db.lookupImportance.count(), 3],
    ['party_role', () => db.lookupPartyRole.count(), 11],
    ['hearing_action', () => db.lookupHearingAction.count(), 20],
    ['matter_destination', () => db.lookupMatterDestination.count(), 27],
    ['client_branch', () => db.lookupClientBranch.count(), 31],
  ];

  let lookupTotal = 0;
  const wrong: string[] = [];
  for (const [name, count, expected] of expectedLookups) {
    const actual = await count();
    lookupTotal += actual;
    if (actual !== expected) wrong.push(`${name} ${actual}/${expected}`);
  }
  record(
    'Lookup lists (9)',
    '146 rows',
    wrong.length === 0 ? `${lookupTotal} rows` : wrong.join(', '),
    wrong.length === 0 && lookupTotal === 146,
  );

  // The default matter type is what a matter falls back to. Exactly one.
  const defaults = await db.lookupMatterType.count({ where: { isDefault: true } });
  record('One default matter type', '1', String(defaults), defaults === 1);

  // 7. The four merges of 21 August 2026 (migration 0003).
  //
  //    Checked from both sides. "The typo is gone" alone would also be
  //    satisfied by deleting both spellings, so the value each one merged
  //    INTO is checked too.
  const mergedAway = await db.lookupHearingAction.count({
    where: { labelAr: { in: ['محكمه', 'مجكمة', 'رفع الدعوي'] } },
  });
  const branchMergedAway = await db.lookupClientBranch.count({ where: { labelAr: 'جنح' } });
  record(
    'Merged spellings removed',
    '0',
    String(mergedAway + branchMergedAway),
    mergedAway + branchMergedAway === 0,
  );

  const mergeTargets = await db.lookupHearingAction.count({
    where: { labelAr: { in: ['محكمة', 'رفع الدعوى'] } },
  });
  const branchTarget = await db.lookupClientBranch.count({ where: { labelAr: 'الجنح' } });
  record(
    'Merge targets present',
    '3',
    String(mergeTargets + branchTarget),
    mergeTargets + branchTarget === 3,
  );

  //    تحكيم (arbitration) and تحقيق (investigation) look similar to an
  //    algorithm and are different words. Both must survive.
  const kept = await db.lookupHearingAction.count({
    where: { labelAr: { in: ['تحكيم', 'تحقيق'] } },
  });
  record('تحكيم and تحقيق both kept', '2', String(kept), kept === 2);

  //    The crosswalk is what lets Stage 2 map the old text. Every target must
  //    name a value that exists, or a hearing maps to a list entry that is
  //    not there.
  const crosswalk = await db.migrationCrosswalk.findMany();
  const actions = new Set((await db.lookupHearingAction.findMany()).map((r) => r.labelAr));
  const branches = new Set((await db.lookupClientBranch.findMany()).map((r) => r.labelAr));
  const dangling = crosswalk.filter(
    (c) =>
      (c.targetField === 'hearing_action' && !actions.has(c.targetValue ?? '')) ||
      (c.targetField === 'client_branch' && !branches.has(c.targetValue ?? '')),
  );
  record(
    'Crosswalk rules resolve',
    '4 rules, 0 dangling',
    `${crosswalk.length} rules, ${dangling.length} dangling`,
    crosswalk.length === 4 && dangling.length === 0,
  );

  // 8. The roster — task 1.2.
  //
  //    Every derived figure, not just the headline two. These moved together
  //    once already: merging two duplicate people changed five numbers at
  //    once, one was corrected and four were left stale, and the assertion
  //    written at the time would have failed on correct data.
  const roster: Array<[string, number, number]> = [
    ['people', await db.person.count(), 138],
    ['aliases', await db.personNameAlias.count(), 339],
    ['staff', await db.person.count({ where: { isStaff: true } }), 67],
    ['current', await db.person.count({ where: { isStaff: true, isActive: true } }), 21],
    ['former', await db.person.count({ where: { isStaff: true, isActive: false } }), 46],
    ['external', await db.person.count({ where: { isStaff: false } }), 71],
    ['teams', await db.lookupTeam.count(), 2],
    [
      'current with a team',
      await db.person.count({ where: { isStaff: true, isActive: true, teamId: { not: null } } }),
      5,
    ],
    [
      'current without a team',
      await db.person.count({ where: { isStaff: true, isActive: true, teamId: null } }),
      16,
    ],
  ];
  const rosterWrong = roster.filter(([, actual, expected]) => actual !== expected);
  record(
    'Roster figures (9)',
    '138/339/67/21/46/71/2/5/16',
    rosterWrong.length === 0
      ? roster.map(([, actual]) => actual).join('/')
      : rosterWrong.map(([n, a2, e]) => `${n} ${a2}/${e}`).join(', '),
    rosterWrong.length === 0,
  );

  //    The two hamza pairs. Each hamza-less spelling must be an ALIAS of the
  //    correct person, and must NOT be a person in its own right — which is
  //    exactly what went wrong before, creating a duplicate carrying 1,309
  //    hearings. Checked from both sides: absent from people AND absent from
  //    aliases would also satisfy "not a duplicate", and would lose every row
  //    that used the spelling.
  const hamzaPairs: Array<[string, string]> = [
    ['احمد إسماعيل', 'أحمد إسماعيل'],
    ['احمد سعيد', 'أحمد سعيد'],
  ];
  const hamzaProblems: string[] = [];
  for (const [variant, canonical] of hamzaPairs) {
    const asPerson = await db.person.count({ where: { nameAr: variant } });
    if (asPerson !== 0) hamzaProblems.push(`${variant} is a person again`);

    const canonicalCount = await db.person.count({ where: { nameAr: canonical } });
    if (canonicalCount !== 1) {
      hamzaProblems.push(`${canonical} appears ${canonicalCount} times, expected 1`);
    }

    const resolved = await db.personNameAlias.findUnique({
      where: { aliasAr: variant },
      include: { person: true },
    });
    if (resolved?.person.nameAr !== canonical) {
      hamzaProblems.push(`${variant} does not resolve to ${canonical}`);
    }
  }
  record(
    'Hamza pairs resolve to one person',
    '2 pairs, 0 problems',
    hamzaProblems.length === 0 ? '2 pairs, 0 problems' : hamzaProblems.join('; '),
    hamzaProblems.length === 0,
  );

  // ---- report --------------------------------------------------------------
  const width = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) {
    console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name.padEnd(width)}  ${c.actual}`);
    if (!c.ok) console.log(`      ${''.padEnd(width)}  expected: ${c.expected}`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} of ${checks.length} checks failed.`);
    console.error('If the database is empty, run: npm run db:migrate');
    process.exitCode = 1;
    return;
  }
  console.log(`\nAll ${checks.length} checks passed.`);
}

main()
  .catch((error: unknown) => {
    console.error('\nCould not check the database.\n');
    console.error(error instanceof Error ? error.message : error);
    console.error('\nIs it running?  npm run db:up');
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
