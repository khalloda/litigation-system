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
  //    Through ar_normalise(), the one definition in the system since task
  //    1.6. This used to repeat the fold inline here and in migration 0006 —
  //    two copies of a rule that must never disagree.
  const collisions = await db.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM (
      SELECT ar_normalise(name_ar) FROM people GROUP BY 1 HAVING count(*) > 1) d`;
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

  // 9. The core schema — task 1.3.
  //
  //    These tables are EMPTY until Stage 2, so there is no data to check.
  //    A schema is data too, and it is what Stage 2 will land on: a missing
  //    raw column makes a mapping irreversible, and a NOT NULL added by
  //    someone tidying up turns a known, handled fact into a failed load.
  //
  //    Migration 0011 asserts all of this when it runs. Rule 16: that is a
  //    snapshot, so it is asserted here too.
  const columnsExist = async (pairs: Array<[string, string]>): Promise<string[]> => {
    const rows = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'`;
    const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    return pairs.filter(([t, c]) => !have.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`);
  };

  const coreTables = [
    'lookup_court',
    'clients',
    'client_logos',
    'contacts',
    'matters',
    'hearings',
    'admin_tasks',
    'task_actions',
    'powers_of_attorney',
    'documents',
    'fee_letters',
    // task 1.4
    'matter_lawyers',
    'matter_parties',
    'matter_party_roles',
    'hearing_attendees',
    'fee_letter_matters',
    // task 1.5
    'invoices',
    'payments',
    'invoice_allocations',
    'attendance',
    // task 1.5a — the three Latin lookups
    'lookup_invoice_status',
    'lookup_invoice_type',
    'lookup_lawyer_share_role',
  ];
  const tableRows = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  const haveTables = new Set(tableRows.map((r) => r.table_name));
  const missingTables = coreTables.filter((t) => !haveTables.has(t));

  //    D10 and the audit table in docs/MIGRATION.md. hearing_attendees
  //    .legacy_name_raw is the fifth of the five task 1.3 names and arrives
  //    with its table at task 1.4 — add it to this list then.
  const missingRaw = await columnsExist([
    ['clients', 'legacy_branch_raw'],
    ['hearings', 'legacy_action_raw'],
    ['admin_tasks', 'legacy_assignee_raw'],
    ['powers_of_attorney', 'legacy_lawyers_raw'],
    ['matters', 'legacy_category_raw'],
    ['matters', 'legacy_degree_raw'],
    ['matters', 'legacy_court_raw'],
    ['hearings', 'legacy_court_raw'],
    ['admin_tasks', 'legacy_court_raw'],
    ['documents', 'legacy_responsible_raw'],
    ['task_actions', 'legacy_task_id_raw'],
    //  القائم بالعمل — the fourth person-name mapping, 96% of 4,130 rows.
    ['task_actions', 'legacy_performed_by_raw'],
    //  The fifth of the five task 1.3 named — 373 spellings to 135 people,
    //  the highest-ratio mapping in the project.
    ['hearing_attendees', 'legacy_name_raw'],
    ['matter_lawyers', 'legacy_source'],
    ['matter_parties', 'legacy_raw'],
    ['fee_letter_matters', 'legacy_matter_ref'],
    //  Not a mapping raw column but the same idea: the abandoned duplicate of
    //  الصفة, kept under D10 and never read.
    ['powers_of_attorney', 'poa_capacity_duplicate'],
    //  A fifth person-name mapping, on the leave register.
    ['attendance', 'legacy_person_raw'],
    //  AttSituation is a free-text daily log, 865 distinct values. The raw
    //  column keeps the original when a Phase 2 review folds `At the Office`
    //  and `At the office` together.
    ['attendance', 'legacy_situation_raw'],
    //  The only Latin person column in the database — English names resolved
    //  through people.name_en, not the alias table.
    ['invoice_allocations', 'legacy_lawyer_raw'],
    //  Access holds a PERCENTAGE; share holds a fraction. The conversion has
    //  to stay visible.
    ['invoice_allocations', 'legacy_percent_raw'],
    ['invoice_allocations', 'legacy_lawyer_as_raw'],
  ]);
  record(
    'Core schema: 23 tables, 21 raw columns',
    'all present',
    missingTables.length === 0 && missingRaw.length === 0
      ? '23 tables, 21 raw columns'
      : `missing ${[...missingTables, ...missingRaw].join(', ')}`,
    missingTables.length === 0 && missingRaw.length === 0,
  );

  //    Two columns that must NOT exist, which a presence check cannot see.
  //    contacts.attachments looks 100% populated in Access and holds zero
  //    files (D11); name_ar/name_en were placeholders invented before the
  //    real column list arrived, and Access has Contact1 and Full_name.
  const mustNotExist = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (table_name, column_name) IN (
            ('contacts', 'attachments'), ('contacts', 'name_ar'),
            ('contacts', 'name_en'),
            -- Three placeholders invented at task 1.5 before the firm sent
            -- the column lists. الفواتير has contractID not clientID, السداد
            -- has Credit and Debit not one Amount, and AttSituation is a
            -- free-text log rather than a status.
            ('invoices', 'client_id'), ('payments', 'amount'),
            ('attendance', 'status'),
            -- Replaced once the firm read its own columns: الصفة is the live
            -- capacity and صفة الموكل بالتوكيل is an abandoned duplicate.
            -- Both old names must be gone, or a transform could pick either.
            ('powers_of_attorney', 'capacity'),
            ('powers_of_attorney', 'principal_capacity'))`;
  record(
    'No placeholder or complex columns',
    '0',
    mustNotExist.length === 0
      ? '0'
      : mustNotExist.map((r) => `${r.table_name}.${r.column_name}`).join(', '),
    mustNotExist.length === 0,
  );

  //    Nothing is deleted during migration (D10). The firm already knows the
  //    counts — 4 hearings with no matter, 1 POA with no client, 75 task
  //    actions with a broken or absent parent. A NOT NULL on any of these
  //    would turn a handled fact into a rejected row.
  const notNullable = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND is_nullable = 'NO'
       AND (table_name, column_name) IN (
            ('matters', 'client_id'), ('hearings', 'matter_id'),
            ('admin_tasks', 'matter_id'), ('task_actions', 'task_id'),
            ('powers_of_attorney', 'client_id'), ('contacts', 'client_id'),
            ('documents', 'matter_id'), ('fee_letters', 'client_id'),
            ('hearing_attendees', 'person_id'), ('fee_letter_matters', 'matter_id'),
            ('payments', 'invoice_id'), ('attendance', 'person_id'),
            ('invoices', 'fee_letter_id'), ('payments', 'payment_date'),
            ('invoice_allocations', 'person_id'),
            ('invoice_allocations', 'invoice_id'))`;
  record(
    'Stage 2 can never reject a row',
    '16 links all nullable',
    notNullable.length === 0
      ? '16 links all nullable'
      : `NOT NULL on ${notNullable.map((r) => `${r.table_name}.${r.column_name}`).join(', ')}`,
    notNullable.length === 0,
  );

  //    Two decisions that live in the shape of the schema rather than in the
  //    data, and would be reversed silently by an ordinary-looking change.
  const caseNumber = await db.$queryRaw<{ data_type: string }[]>`
    SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'matters'
       AND column_name = 'case_number_ar'`;
  const logoBinary = await db.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'client_logos'
       AND data_type IN ('bytea', 'oid')`;
  const caseIsText = caseNumber[0]?.data_type === 'text';
  record(
    'D9 case numbers, D15 logos as files',
    'case_number_ar is text, client_logos holds no binary',
    caseIsText && logoBinary.length === 0
      ? 'text, no binary'
      : `${caseIsText ? 'text' : `case_number_ar is ${caseNumber[0]?.data_type ?? 'absent'}`}` +
        `${logoBinary.length > 0 ? `, client_logos holds ${logoBinary.map((r) => r.column_name).join(', ')}` : ''}`,
    caseIsText && logoBinary.length === 0,
  );

  // 9a. The junction constraints — task 1.4.
  //
  //     Prisma cannot express a CHECK constraint or a filtered index, so all
  //     four are raw SQL and invisible to schema.prisma. Nothing but this
  //     line would notice one being dropped.
  //
  //     matter_lawyers_one_lead_per_matter is the one constraint in Stage 2
  //     that can stop a load, deliberately. If it ever fires, quarantine the
  //     matter and ask the firm which lawyer leads it — do NOT relax it.
  //     "Who leads this matter" having two answers is the ambiguity D5 exists
  //     to remove.
  const junctionGuards = await db.$queryRaw<{ name: string }[]>`
    SELECT conname AS name FROM pg_constraint
     WHERE conname IN ('matter_lawyers_role_check', 'matter_parties_side_check',
                       'matter_parties_gender_check')
    UNION ALL
    SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'matter_lawyers_one_lead_per_matter'`;
  record(
    'Junction constraints in place',
    '3 checks + one lead per matter',
    junctionGuards.length === 4
      ? '3 checks + one lead per matter'
      : `only ${junctionGuards.length} of 4: ${junctionGuards.map((g) => g.name).join(', ')}`,
    junctionGuards.length === 4,
  );

  // 9b. Billing — task 1.5. Empty until Phase 2, and the shape is where the
  //     money decisions live.
  //
  //     Money is NEVER a floating-point number. A double cannot hold 0.1
  //     exactly, so summing 597 payments in one gives a total that is close
  //     and wrong — in a report a partner sends to a client. Gate 4
  //     reconciles totals against Access, and that only means something if
  //     both sides add up exactly.
  const inexactMoney = await db.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type <> 'numeric'
       AND (table_name, column_name) IN (
            ('invoices', 'amount'), ('invoices', 'amount_usd'),
            ('invoices', 'receipt_amount'),
            ('payments', 'credit'), ('payments', 'debit'),
            ('invoice_allocations', 'share'))`;
  //     D4: Pay-Date is not migrated. Asserted ABSENT — it stopped in Sept
  //     2019 and holds 126 stale values the payments table supersedes.
  const payDate = await db.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invoices'
       AND column_name IN ('pay_date', 'paydate')`;
  record(
    'Billing: exact money, no Pay-Date',
    'numeric amounts, Pay-Date absent',
    inexactMoney.length === 0 && payDate.length === 0
      ? 'numeric amounts, Pay-Date absent'
      : [
          ...inexactMoney.map((r) => `${r.table_name}.${r.column_name} is ${r.data_type}`),
          ...payDate.map((r) => `invoices.${r.column_name} exists (D4)`),
        ].join(', '),
    inexactMoney.length === 0 && payDate.length === 0,
  );

  //     The shares on one invoice must sum to 1. That is a rule ACROSS rows,
  //     which no CHECK constraint can express, so it lives here.
  //
  //     NOT a vacuous check. The firm verified against the Access data: 15
  //     invoices carry splits and all 15 sum to exactly 1. So it has 15
  //     genuine cases to validate when Stage 2 loads تقسيم التحصيلات, and any
  //     failure would be a real finding rather than a bad rule.
  const badSplits = await db.$queryRaw<{ invoice_id: number; total: string }[]>`
    SELECT invoice_id, sum(share)::text AS total
      FROM invoice_allocations
     GROUP BY invoice_id
    HAVING sum(share) <> 1`;
  record(
    'Invoice shares sum to 1',
    '0 invoices out',
    badSplits.length === 0
      ? '0 invoices out'
      : badSplits.map((b) => `invoice ${b.invoice_id} sums to ${b.total}`).join(', '),
    badSplits.length === 0,
  );

  // 10. Arabic search — task 1.6.
  //
  //     A plain search fails on 49% of client names and 96% of matter
  //     subjects, because users type without hamza and without diacritics.
  //     ar_normalise() folds both the stored value and the query, so the two
  //     sides cannot drift apart.
  //
  //     The POSITIVE tests are the two docs/PRD.md names. The NEGATIVE ones
  //     matter more: every fold is a merge, and a fold that is right 95% of
  //     the time silently merges two people the other 5%. This project has
  //     merged two people by accident twice, one carrying 1,309 hearings.
  const folds = await db.$queryRaw<{ label: string; pass: boolean }[]>`
    SELECT 'احمد finds أحمد'  AS label, ar_normalise('احمد') = ar_normalise('أحمد') AS pass
    UNION ALL SELECT '140J finds 140ق', ar_normalise('140J') = ar_normalise('140ق')
    UNION ALL SELECT 'ta marbuta',      ar_normalise('محكمه') = ar_normalise('محكمة')
    UNION ALL SELECT 'compound space',  ar_normalise('عبدالعزيز') = ar_normalise('عبد العزيز')
    UNION ALL SELECT 'Arabic digits',   ar_normalise('١٤٠ق') = ar_normalise('140ق')
    UNION ALL SELECT 'NOT a dropped middle name',
                     ar_normalise('سامي خطاب') <> ar_normalise('سامي إبراهيم خطاب')
    UNION ALL SELECT 'NOT تحكيم/تحقيق', ar_normalise('تحكيم') <> ar_normalise('تحقيق')
    UNION ALL SELECT 'NOT طاعن/متظلم',  ar_normalise('طاعن') <> ar_normalise('متظلم')`;
  const failedFolds = folds.filter((f) => !f.pass);
  record(
    'Arabic search folds, and does not over-fold',
    '8 of 8',
    failedFolds.length === 0
      ? '8 of 8'
      : `FAILED: ${failedFolds.map((f) => f.label).join(', ')}`,
    failedFolds.length === 0,
  );

  //     The shadow columns are maintained by triggers, which schema.prisma
  //     cannot see. A stored value that disagrees with the function is a
  //     record that has quietly become unfindable.
  const drifted = await db.$queryRaw<{ count: bigint }[]>`
    SELECT (SELECT count(*) FROM people
             WHERE name_ar_normalised IS DISTINCT FROM ar_normalise(name_ar))
         + (SELECT count(*) FROM person_name_alias
             WHERE alias_ar_normalised IS DISTINCT FROM ar_normalise(alias_ar))
         + (SELECT count(*) FROM clients
             WHERE name_ar_normalised IS DISTINCT FROM ar_normalise(name_ar))
         + (SELECT count(*) FROM matters
             WHERE case_number_ar_normalised IS DISTINCT FROM ar_normalise(case_number_ar))
         + (SELECT count(*) FROM contacts
             WHERE contact_name_normalised IS DISTINCT FROM ar_normalise(contact_name))
      AS count`;
  const driftCount = Number(one(drifted, 'normalised drift').count);
  record(
    'Normalised columns agree with the function',
    '0 rows out of step',
    `${driftCount} out of step`,
    driftCount === 0,
  );

  const searchGuards = await db.$queryRaw<{ name: string }[]>`
    SELECT tgname AS name FROM pg_trigger
     WHERE tgname IN ('clients_name_ar_normalise', 'clients_full_name_normalise',
                      'matters_case_number_ar_normalise', 'matters_subject_normalise',
                      'people_name_ar_normalise', 'person_name_alias_alias_ar_normalise',
                      'contacts_contact_name_normalise')
    UNION ALL
    SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND indexdef LIKE '%gin_trgm_ops%'
       AND indexname IN (
            'clients_name_ar_normalised_idx', 'matters_case_number_ar_normalised_idx',
            'matters_subject_normalised_idx', 'people_name_ar_normalised_idx',
            'person_name_alias_alias_ar_normalised_idx',
            'contacts_contact_name_normalised_idx')`;
  //     The index names are Prisma's own since they were declared in
  //     schema.prisma. They were briefly created in raw SQL instead, and the
  //     next migration dropped all six — THIS CHECK is what caught it. The
  //     indexdef test matters as much as the name: a plain btree called the
  //     right thing would satisfy a name check and do nothing for LIKE '%…%'.
  record(
    'Search triggers and trigram indexes',
    '7 triggers + 6 indexes',
    searchGuards.length === 13 ? '7 triggers + 6 indexes' : `only ${searchGuards.length} of 13`,
    searchGuards.length === 13,
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
