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
import { readLinksFromDatabase } from './lib/read-links';
import { additions, compare, readBaseline } from './lib/reviewed-links';

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
    ['client_branch', () => db.lookupClientBranch.count(), 15],
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
    '130 rows',
    wrong.length === 0 ? `${lookupTotal} rows` : wrong.join(', '),
    wrong.length === 0 && lookupTotal === 130,
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
  //    جنح used to merge into client_branch الجنح. Since the branch
  //    resolution (D19) الجنح is itself gone and both spellings land in
  //    matter_category جنح, so that is where the surviving target now lives.
  const branchTarget = await db.lookupMatterCategory.count({ where: { labelAr: 'جنح' } });
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

  // 7a. The client branch resolution — decision D19, 21 August 2026.
  //
  //     A branch is a site or subsidiary of a client and nothing else. The 16
  //     values that were something else were removed and crosswalked.
  //
  //     Checked from both sides, as ever. "15 rows" alone would be satisfied
  //     by fifteen rows that are not these fifteen, so the value that had to
  //     survive and the whole set that had to go are both named. المنطقة
  //     الحرة is named because it is the one value that changed side during
  //     the decision — an earlier note moved it to venue, wrongly.
  const freeZone = await db.lookupClientBranch.count({ where: { labelAr: 'المنطقة الحرة' } });
  const notBranches = await db.lookupClientBranch.count({
    where: {
      labelAr: {
        in: [
          'دعاوى عمالية',
          'الجنح',
          'قضاء إداري',
          'القضاء الإداري',
          'مدني',
          'ضرائب',
          'تعويضات',
          'إقتصادي',
          'آراء قانونية',
          'النقض',
          'دعاوى قضائية',
          'سيجما للإعلام (تليفزيون الحياة)',
          'سيجما للصناعات الدوائية',
          'ألفا مصر للتجارة',
          'أولاً: طلب وشكوى أمام الهيئة العامة للاستثمار',
          'ثانياً: النزاعات القضائية المقامة من وضد شركتي الإمارات هايتس ويافا ماك',
        ],
      },
    },
  });
  record(
    'Client branch is 15 sites only',
    'free zone kept, 0 non-branches',
    `free zone ${freeZone === 1 ? 'kept' : 'MISSING'}, ${notBranches} non-branches`,
    freeZone === 1 && notBranches === 0,
  );

  //    The crosswalk is what lets Stage 2 map the old text. Every rule that
  //    names a list must resolve to a value that exists, or a matter maps to
  //    a list entry that is not there.
  //
  //    target_field is validated first. A misspelled one — 'seperate_client'
  //    — would otherwise be skipped by every resolve check below and look
  //    perfectly healthy: the same shape of fault as an assertion over member
  //    rows that cannot see a rule with no members at all.
  const crosswalk = await db.migrationCrosswalk.findMany();

  const listTargets: Record<string, Set<string>> = {
    hearing_action: new Set((await db.lookupHearingAction.findMany()).map((r) => r.labelAr)),
    client_branch: new Set((await db.lookupClientBranch.findMany()).map((r) => r.labelAr)),
    matter_category: new Set((await db.lookupMatterCategory.findMany()).map((r) => r.labelAr)),
    matter_type: new Set((await db.lookupMatterType.findMany()).map((r) => r.labelAr)),
    degree: new Set((await db.lookupDegree.findMany()).map((r) => r.labelAr)),
    venue: new Set((await db.lookupVenue.findMany()).map((r) => r.labelAr)),
  };
  //    Markers are not lists: they carry no target_value and resolve to
  //    nothing. NULL means the value is discarded.
  const markers = new Set(['quarantine', 'separate_client']);

  const unrecognised = crosswalk.filter(
    (c) => c.targetField !== null && !(c.targetField in listTargets) && !markers.has(c.targetField),
  );
  const dangling = crosswalk.filter((c) => {
    const field = c.targetField;
    if (field === null || markers.has(field)) return false;
    const list = listTargets[field];
    if (list === undefined) return false; // already counted as unrecognised
    //  A missing value on a list rule is dangling too. There is nothing to
    //  look up, and "nothing to resolve" must never read as "resolved".
    return c.targetValue === null || !list.has(c.targetValue);
  });
  record(
    'Crosswalk rules resolve',
    '20 rules, 0 dangling, 0 unrecognised',
    `${crosswalk.length} rules, ${dangling.length} dangling, ${unrecognised.length} unrecognised`,
    crosswalk.length === 20 && dangling.length === 0 && unrecognised.length === 0,
  );

  //    Rule (b) of the branch resolution: three values are separate CLIENTS,
  //    so any matter carrying one is attached to the wrong client entirely.
  //    Named here so that losing one of them is loud rather than silent.
  const separateClients = crosswalk.filter((c) => c.targetField === 'separate_client');
  record(
    'Separate-client rules (rule b)',
    '3',
    String(separateClients.length),
    separateClients.length === 3,
  );

  // 7b. THE REVIEWED LINKS ARE STILL THE REVIEWED LINKS.
  //
  //     Everything above counts mappings and proves their destinations exist.
  //     None of it proves a mapping points at the RIGHT destination. Repoint
  //     دعاوى عمالية from عمال to مدني and every check above still passes:
  //     the count is unchanged, the destination exists, nothing dangles.
  //
  //     At Stage 2 that silently files matters under the wrong practice area,
  //     or — on the alias side — attaches a lawyer's historical work to
  //     somebody else. Neither shows up as an error, and the numbers agree.
  //
  //     The baseline records every pair the firm reviewed. Adding links is
  //     allowed; changing one is not. See scripts/lib/reviewed-links.ts.
  const baseline = readBaseline();
  const links = await readLinksFromDatabase();
  const drift = compare(baseline, links);
  const added = additions(baseline, links);
  record(
    'Reviewed links unchanged',
    `${baseline.counts.aliases} aliases + ${baseline.counts.crosswalk} rules, 0 changed`,
    drift.length === 0
      ? `${baseline.counts.aliases} + ${baseline.counts.crosswalk} verified` +
          (added.aliases + added.crosswalk > 0
            ? `, ${added.aliases + added.crosswalk} new since`
            : '')
      : `${drift.length} CHANGED — ` +
        drift
          .slice(0, 3)
          .map((d) => `${d.subject}: ${d.actual}`)
          .join('; ') +
        (drift.length > 3 ? ` (+${drift.length - 3} more)` : ''),
    drift.length === 0,
  );

  // 8. The roster — task 1.2.
  //
  //    Every derived figure, not just the headline two. These moved together
  //    once already: merging two duplicate people changed five numbers at
  //    once, one was corrected and four were left stale, and the assertion
  //    written at the time would have failed on correct data.
  const roster: Array<[string, number, number]> = [
    ['people', await db.person.count(), 135],
    ['aliases', await db.personNameAlias.count(), 347],
    ['staff', await db.person.count({ where: { isStaff: true } }), 64],
    ['current', await db.person.count({ where: { isStaff: true, isActive: true } }), 21],
    ['former', await db.person.count({ where: { isStaff: true, isActive: false } }), 43],
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
    '135/347/64/21/43/71/2/5/16',
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
  //    The alias table must be a COMPLETE index: rule 15 says match through
  //    it, so a person with no alias equal to their own name is silently
  //    unfindable. Six were, including a Milestone 4 test user.
  const unfindable = await db.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM people p
     WHERE NOT EXISTS (SELECT 1 FROM person_name_alias a WHERE a.alias_ar = p.name_ar)`;
  const unfindableCount = Number(one(unfindable, 'unfindable people').count);
  //    After the three name-variant merges, no two people may share a
  //    fully-normalised name. This is the check that found them, kept so it
  //    can find the next one.
  const collisions = await db.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM (
      SELECT replace(translate(regexp_replace(name_ar, '[ًٌٍَُِّْـ]', '', 'g'),
                               'أإآٱةىؤئ', 'ااااهيوي'), ' ', '') AS folded
        FROM people GROUP BY 1 HAVING count(*) > 1) d`;
  const collisionCount = Number(one(collisions, 'normalised collisions').count);
  record(
    'No two people share a normalised name',
    '0 collisions',
    `${collisionCount} collisions`,
    collisionCount === 0,
  );

  record(
    'Every person findable by their own name',
    '0 unfindable',
    `${unfindableCount} unfindable`,
    unfindableCount === 0,
  );

  record(
    'Hamza pairs resolve to one person',
    '2 pairs, 0 problems',
    hamzaProblems.length === 0 ? '2 pairs, 0 problems' : hamzaProblems.join('; '),
    hamzaProblems.length === 0,
  );

  // 8a. Exactly one primary alias per person, and it is their own name.
  //
  //     Migration 0005 asserted this and it was true that afternoon; 0006
  //     broke it an hour later by moving three phantom people's primary
  //     aliases onto the survivors without demoting them, and nothing
  //     noticed for a day. An assertion that runs once is a snapshot, not an
  //     invariant.
  //
  //     Counted from BOTH sides. "Nobody has two" is also satisfied by
  //     somebody having none, and a person with no primary has no name to
  //     display.
  const primaryCounts = await db.$queryRaw<{ person_id: number; n: bigint }[]>`
    SELECT p.id AS person_id, count(*) FILTER (WHERE a.is_primary) AS n
      FROM people p LEFT JOIN person_name_alias a ON a.person_id = p.id
     GROUP BY p.id HAVING count(*) FILTER (WHERE a.is_primary) <> 1`;
  const notOwnName = await db.$queryRaw<{ alias_ar: string; name_ar: string }[]>`
    SELECT a.alias_ar, p.name_ar
      FROM person_name_alias a JOIN people p ON p.id = a.person_id
     WHERE a.is_primary AND a.alias_ar <> p.name_ar`;
  record(
    'One primary alias per person',
    'every person exactly 1, and it is their own name',
    primaryCounts.length === 0 && notOwnName.length === 0
      ? 'all 135 correct'
      : `${primaryCounts.length} with the wrong number, ` +
        `${notOwnName.length} not the person's own name`,
    primaryCounts.length === 0 && notOwnName.length === 0,
  );

  //     ...and the index that makes a second primary impossible must still be
  //     there. The Prisma schema language cannot express a filtered index, so
  //     it is created in raw SQL and is invisible to schema.prisma — which
  //     means nothing but this line would notice it being dropped.
  const primaryIndex = await db.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'person_name_alias_one_primary_per_person'`;
  record(
    'The one-primary index still exists',
    'present',
    primaryIndex.length === 1 ? 'present' : 'MISSING — a second primary is possible again',
    primaryIndex.length === 1,
  );

  // 8b. The two teams, by exact membership and exact reviewer.
  //
  //     Migration 0004 looked its reviewers up through people.name_ar while
  //     its own comment said it matched through the alias table — which D5
  //     and rule 15 forbid, and which is worse than a plain mistake because
  //     the comment would stop the next reader checking. The migration is
  //     history and is not rewritten; this asserts the result it should have
  //     produced, every time anyone checks.
  //
  //     Membership is compared as a SET, not counted. "4 members" is
  //     satisfied by four of the wrong people.
  const teams = await db.lookupTeam.findMany({
    select: {
      labelAr: true,
      reviewer: { select: { nameAr: true } },
      members: { select: { nameAr: true } },
    },
    orderBy: { labelAr: 'asc' },
  });
  //     Both teams have the SAME reviewer — ناجي رمضان — which is what Access
  //     recorded and what sql/lookups-part2-and-teams.sql carries. It looks
  //     like an error and is not one. (Access "team 3" had a different
  //     reviewer, د. هاني سري الدين, and is deliberately not created — D6.)
  //     هاني الدالي is a MEMBER of team ب, not its reviewer.
  const expectedTeams: Record<string, { reviewer: string; members: string[] }> = {
    'الفريق أ': {
      reviewer: 'ناجي رمضان',
      members: ['إيهاب حمدي', 'مؤمن سليم', 'أحمد إسماعيل', 'أحمد سيف'],
    },
    'الفريق ب': {
      reviewer: 'ناجي رمضان',
      members: ['محمد عبد العزيز عبد الحافظ', 'أحمد سعيد', 'هاني الدالي', 'محمود شعبان'],
    },
  };
  const teamProblems: string[] = [];
  for (const [label, expected] of Object.entries(expectedTeams)) {
    const team = teams.find((t) => t.labelAr === label);
    if (team === undefined) {
      teamProblems.push(`${label} is missing`);
      continue;
    }
    if (team.reviewer?.nameAr !== expected.reviewer) {
      teamProblems.push(`${label} reviewer is ${team.reviewer?.nameAr ?? '(nobody)'}`);
    }
    const actual = new Set(team.members.map((m) => m.nameAr));
    const missing = expected.members.filter((m) => !actual.has(m));
    const extra = [...actual].filter((m) => !expected.members.includes(m));
    if (missing.length > 0) teamProblems.push(`${label} is missing ${missing.join(', ')}`);
    if (extra.length > 0) teamProblems.push(`${label} also holds ${extra.join(', ')}`);
  }
  record(
    'Teams: exact reviewer and membership',
    '2 teams, 4 named members each, reviewer ناجي رمضان',
    teamProblems.length === 0 ? '2 teams, 4 + 4, both reviewers correct' : teamProblems.join('; '),
    teamProblems.length === 0,
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
