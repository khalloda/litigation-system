import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { t } from '../src/strings';
import { mutateMatter, readMatterMutation } from '../src/lib/matter-mutations';
import { mutateHearing } from '../src/lib/hearing-mutations';
import { readMatterLifecycle, mutateMatterLifecycle } from '../src/lib/matter-lifecycle';
import { readHearingLifecycle, mutateHearingLifecycle } from '../src/lib/hearing-lifecycle';
import { saveLawyerReportSelection } from '../src/lib/reports/lawyer-selection';
import { lawyerReports } from '../src/lib/reports/lawyer-matters';
import { lawyerUpcomingHearings } from '../src/lib/reports/lawyer-upcoming';
import { parseReportInput } from '../src/lib/reports/input';
import type { ReportData } from '../src/lib/reports/types';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { lawyerSelectionFailures } from './lib/lawyer-selection-checkpoint';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'],
    out = process.env['TASK64_EVIDENCE'];
  assert.ok(url && out);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const progressPath = join(out, 'lawyer-edge-progress.json');
  assert.ok(!existsSync(progressPath), 'Inspect retained mutations before any retry');
  const admin = (await lifecycleSessions(db)).find((s) => s.user.role === 'Administrator')!,
    meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  const options = await readMatterMutation(admin, 'create', null, db);
  for (const id of [245, 239])
    assert.equal(options.clients.filter((c) => c.id === id && c.active).length, 1);
  for (const id of [4, 7, 8])
    assert.equal(options.people.filter((p) => p.id === id && p.active).length, 1);
  const court = options.choices.court_id!.find((c) => c.active)!.id,
    capacity = options.roles.find((c) => c.active)!.id;
  const requests: unknown[] = [],
    matters: { id: number; version: string }[] = [],
    hearings: { id: number; version: string }[] = [],
    checks: string[] = [];
  const progress = () =>
    writeFileSync(progressPath, JSON.stringify({ requests, matters, hearings, checks }, null, 2));
  const request = (value: object) => {
    const r = { ...value, submission: randomUUID() };
    requests.push(r);
    progress();
    return r;
  };
  const rows = (d: ReportData) => d.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
  const run = (
    id: string,
    mode = 'all',
    lawyer = 4,
    from = '2080-02-29',
    to = from,
    client = 245,
  ) => {
    const def = [...lawyerReports, lawyerUpcomingHearings].find((x) => x.descriptor.id === id)!;
    const pairs = new URLSearchParams({ format: 'preview' });
    if (def.descriptor.parameters.client) pairs.set('client', String(client));
    if (def.descriptor.parameters.lawyer) pairs.set('lawyer', String(lawyer));
    if (def.descriptor.date) {
      pairs.set('from', from);
      pairs.set('to', to);
    }
    if (def.descriptor.extra) pairs.set('extra_mode', mode);
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return def.query(tx, parseReportInput(def.descriptor, pairs).parameters);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  };
  const save = async (id: number, hearingId: number | null, selected = true) => {
    const m = await db.matter.findUniqueOrThrow({ where: { id } }),
      s = await db.lawyerReportSelection.findUnique({ where: { id } }),
      h =
        hearingId === null
          ? null
          : await db.hearing.findUniqueOrThrow({ where: { id: hearingId } });
    return saveLawyerReportSelection(
      admin,
      request({
        scope: 'lawyer',
        id,
        client: m.clientId,
        version: String(s?.rowVersion ?? 0),
        matterVersion: String(m.rowVersion),
        hearingId,
        hearingVersion: h ? String(h.rowVersion) : null,
        selected,
      }),
      meta(),
    );
  };
  assert.equal(
    await db.matter.count({ where: { caseNumberAr: { startsWith: 'TEST ONLY TASK64 FAMILY' } } }),
    0,
  );
  for (let i = 0; i < 5; i++) {
    const lawyers =
      i === 3
        ? []
        : i === 4
          ? [
              { id: null, person_id: 7, role: 'lead', position: 1 },
              { id: null, person_id: 4, role: 'support', position: 2 },
            ]
          : [
              { id: null, person_id: 4, role: 'lead', position: 1 },
              ...(i === 0 ? [{ id: null, person_id: 7, role: 'co_lead', position: 3 }] : []),
              { id: null, person_id: 8, role: 'support', position: 4 },
            ];
    const created = await mutateMatter(
      admin,
      'create',
      request({
        id: null,
        version: null,
        values: {
          client_id: i === 1 || i === 3 ? 239 : 245,
          status: i === 2 ? 'منتهية' : 'سارية',
          case_number_ar: `TEST ONLY TASK64 FAMILY ${i}\n001 / 52ق\n140J / 140ق`,
          subject:
            'TEST ONLY FAMILY ' +
            i +
            '\n' +
            (i === 0 ? 'TEST ONLY long legal text أَإِ ثانٍ '.repeat(30) : 'TEST ONLY'),
          start_date: i === 2 ? '2080-02-28' : i === 4 ? '2080-03-01' : '2080-02-29',
          court_id: court,
          circuit: 'TEST ONLY matter circuit',
        },
        lawyers,
        parties:
          i === 0
            ? [
                {
                  id: null,
                  side: 'client',
                  party_name: 'TEST ONLY client party 1\nline 2',
                  gender: 'm',
                  ordinal: 1,
                  roles: [{ id: null, role_id: capacity, ordinal: 1 }],
                },
                {
                  id: null,
                  side: 'client',
                  party_name: 'TEST ONLY client party 2',
                  gender: 'f',
                  ordinal: 2,
                  roles: [{ id: null, role_id: capacity, ordinal: 1 }],
                },
                {
                  id: null,
                  side: 'opponent',
                  party_name: 'TEST ONLY opponent',
                  gender: null,
                  ordinal: 1,
                  roles: [],
                },
              ]
            : [],
      }),
      meta(),
    );
    matters.push(created);
    progress();
  }
  const createHearing = async (
    matter: number,
    hearingDate: string | null,
    decision: string | null,
    courtId: number | null,
    nextDate: string | null = null,
  ) => {
    const h = await mutateHearing(
      admin,
      'create',
      request({
        id: null,
        version: null,
        values: {
          matter_id: matter,
          hearing_date: hearingDate,
          decision,
          court_id: courtId,
          circuit: courtId === null ? null : 'TEST ONLY hearing circuit',
          next_hearing_date: nextDate,
          outcome: null,
        },
        attendees: [],
      }),
      meta(),
    );
    hearings.push(h);
    progress();
    return h;
  };
  const chosen = await createHearing(
    matters[0]!.id,
    '2080-02-29',
    'TEST ONLY deliberately chosen\r\nأَإِ ثانٍ',
    null,
    '2080-03-01',
  );
  const tied = await createHearing(
    matters[0]!.id,
    '2080-02-29',
    'TEST ONLY equal date higher ID',
    court,
    '2080-03-01',
  );
  await createHearing(matters[0]!.id, null, null, null, null);
  const closed = await createHearing(
    matters[2]!.id,
    '2080-02-29',
    'TEST ONLY closed position',
    court,
  );
  await createHearing(matters[3]!.id, '2080-02-29', 'TEST ONLY unassigned', null);
  const other = await createHearing(
    matters[4]!.id,
    '2080-02-29',
    'TEST ONLY support versus principal',
    court,
  );
  const allBefore = await run('lawyer-current-position');
  assert.equal(
    rows(allBefore).find((r) => r.id === `matter:${matters[0]!.id}`)!.cells[6]?.type,
    'text',
  );
  assert.deepEqual(rows(allBefore).find((r) => r.id === `matter:${matters[0]!.id}`)!.cells[6], {
    type: 'text',
    value: 'TEST ONLY equal date higher ID',
  });
  await save(matters[0]!.id, chosen.id);
  await save(matters[1]!.id, null);
  await save(matters[2]!.id, closed.id);
  await save(matters[4]!.id, other.id);
  const selectedBefore = await run('lawyer-current-position', 'selected');
  const expert = await createHearing(
    matters[0]!.id,
    '2080-03-01',
    'TEST ONLY later expert action',
    court,
    '2080-03-01',
  );
  assert.deepEqual(await run('lawyer-current-position', 'selected'), selectedBefore);
  assert.ok(
    !rows(await run('lawyer-current-position')).some((r) => r.id === `matter:${matters[0]!.id}`),
  );
  assert.deepEqual(
    rows(await run('lawyer-current-position', 'all', 4, '2080-03-01')).find(
      (r) => r.id === `matter:${matters[0]!.id}`,
    )!.cells[6],
    { type: 'text', value: 'TEST ONLY later expert action' },
  );
  assert.deepEqual(
    rows(selectedBefore).find((r) => r.id === `matter:${matters[0]!.id}`)!.cells[1],
    { type: 'null' },
  );
  assert.deepEqual(
    rows(selectedBefore).find((r) => r.id === `matter:${matters[0]!.id}`)!.cells[6],
    { type: 'text', value: 'TEST ONLY deliberately chosen\r\nأَإِ ثانٍ' },
  );
  const b = rows(await run('lawyer-supporting-matters', 'selected', 8)).find(
    (r) => r.id === `matter:${matters[0]!.id}`,
  )!;
  assert.ok(JSON.stringify(b.cells[1]).includes('TEST ONLY matter circuit'));
  assert.deepEqual(
    b.cells[6],
    rows(selectedBefore).find((r) => r.id === `matter:${matters[0]!.id}`)!.cells[6],
  );
  assert.ok(
    !rows(await run('lawyer-principal-matters', 'selected', 4)).some(
      (r) => r.id === `matter:${matters[4]!.id}`,
    ),
  );
  assert.ok(
    rows(await run('lawyer-supporting-matters', 'selected', 4)).some(
      (r) => r.id === `matter:${matters[4]!.id}`,
    ),
  );
  assert.ok(
    !rows(await run('lawyer-principal-matters', 'selected')).some(
      (r) => r.id === `matter:${matters[2]!.id}`,
    ),
  );
  assert.ok(rows(selectedBefore).some((r) => r.id === `matter:${matters[2]!.id}`));
  await assert.rejects(
    () => run('lawyer-current-position', 'selected', 4, '2080-02-29', '2080-02-29', 239),
    /selection-incomplete/,
  );
  assert.deepEqual(
    rows(await run('lawyer-new-matters', 'selected', 4, '2080-02-29', '2080-02-29', 239)).map(
      (r) => r.id,
    ),
    [`matter:${matters[1]!.id}`],
  );
  assert.deepEqual(
    rows(await run('lawyer-new-matters', 'selected')).map((r) => r.id),
    [`matter:${matters[0]!.id}`],
  );
  assert.equal(rows(await run('lawyer-new-matters', 'selected', 4, '2080-03-01')).length, 1);
  const upcoming = rows(await run('lawyer-upcoming-hearings', 'all', 4, '2080-03-01')).filter((r) =>
    [chosen.id, tied.id, expert.id].some((id) => r.id === `hearing:${id}`),
  );
  assert.equal(upcoming.length, 3);
  checks.push(
    'literal native source-free mode/date/court coherence, tie/undated, newer expert stability, role/status distinctions, no-hearing distribution, next-date every hearing',
  );
  progress();
  const principal = await run('lawyer-principal-matters', 'selected');
  const nativeRow = rows(principal).find((r) => r.id === `matter:${matters[0]!.id}`)!;
  assert.ok(
    JSON.stringify(nativeRow.cells[2]).includes('TEST ONLY client party 1') &&
      JSON.stringify(nativeRow.cells[2]).includes('TEST ONLY client party 2'),
  );
  assert.deepEqual(nativeRow.cells[9], {
    type: 'text',
    value: t.lawyerReports.reviewerStates.no_source,
  });
  const credit = principal.totals.filter((x) =>
    x.label.startsWith(t.lawyerReports.principalCredit),
  );
  assert.equal(credit.length, 2);
  for (const x of credit) assert.deepEqual(x.value, { type: 'integer', value: '1' });
  const all = await run('lawyer-all-matters', 'all', 4, '2080-02-29', '2080-02-29', 239);
  assert.ok(rows(all).some((r) => r.id === `matter:${matters[3]!.id}`));
  const unassigned = all.totals.find((x) => x.label === t.lawyerReports.unassigned)!.value;
  assert.equal(unassigned.type, 'integer');
  assert.ok('value' in unassigned && Number(unassigned.value) >= 1);
  checks.push(
    'complete two client parties/capacities, absent historical reviewer retained, shared credits and unassigned parent preserved',
  );
  progress();
  // The current write contract prohibits a duplicate person within one matter.
  // Exercise defensive read behavior using literal returned-relation fixtures;
  // no invalid names/relationships are written and no guard is disabled.
  await assert.rejects(() =>
    mutateMatter(
      admin,
      'create',
      request({
        id: null,
        version: null,
        values: { subject: 'TEST ONLY duplicate assignment refusal' },
        lawyers: [
          { id: null, person_id: 4, role: 'lead', position: 1 },
          { id: null, person_id: 4, role: 'co_lead', position: 2 },
        ],
      }),
      meta(),
    ),
  );
  const def = lawyerReports.find((d) => d.descriptor.id === 'lawyer-principal-matters')!;
  const literal = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const proxy = new Proxy(tx, {
        get(target, property, receiver) {
          if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
          return async (...args: Parameters<typeof tx.$queryRaw>) => {
            const result = (await target.$queryRaw(...args)) as Record<string, unknown>[];
            const query = args[0];
            if (
              'sql' in query &&
              query.sql.includes('FROM public.matter_lawyers ml JOIN public.people')
            ) {
              const same = result.map((r) =>
                r.personId === 4 || r.personId === 7
                  ? { ...r, name: 'TEST ONLY identical principal' }
                  : r,
              );
              const duplicate = same.find((r) => r.personId === 4)!;
              return [...same, { ...duplicate, id: 900000001, role: 'co_lead' }];
            }
            if ('sql' in query && query.sql.includes('lawyer_report_historical_reviewer'))
              return result.map((r) => ({ ...r, source_state: 'reviewer_empty', reviewer: '' }));
            return result;
          };
        },
      });
      return def.query(
        proxy,
        parseReportInput(
          def.descriptor,
          new URLSearchParams({
            format: 'preview',
            client: '245',
            lawyer: '4',
            extra_mode: 'selected',
          }),
        ).parameters,
      );
    },
    { isolationLevel: 'RepeatableRead' },
  );
  assert.equal(rows(literal).length, 1);
  assert.deepEqual(rows(literal)[0]!.cells[7], {
    type: 'text',
    value: 'TEST ONLY identical principal\nTEST ONLY identical principal',
  });
  assert.deepEqual(rows(literal)[0]!.cells[9], { type: 'text', value: '' });
  assert.deepEqual(
    literal.totals
      .filter((x) => x.label.startsWith(t.lawyerReports.principalCredit))
      .map((x) => [x.label, x.value]),
    [4, 7].map((id) => [
      `${t.lawyerReports.principalCredit} — TEST ONLY identical principal [${id}]`,
      { type: 'integer', value: '1' },
    ]),
  );
  checks.push(
    'literal read-relation contract: duplicate role for same ID does not multiply; identical names with distinct IDs remain separate; empty historical reviewer differs from missing. Actual duplicate assignment write is refused.',
  );
  progress();
  // Existing deferred parent invariant must reject a valid gateway request to
  // move a saved hearing; rollback must leave the saved choice and output exact.
  const hv = await db.hearing.findUniqueOrThrow({ where: { id: chosen.id } });
  await assert.rejects(() =>
    mutateHearing(
      admin,
      'update',
      request({
        id: chosen.id,
        version: String(hv.rowVersion),
        values: { matter_id: matters[4]!.id },
      }),
      meta(),
    ),
  );
  assert.deepEqual(await run('lawyer-principal-matters', 'selected'), principal);
  // Archive affects write eligibility, not the explicitly source-qualified report.
  const h = await readHearingLifecycle(admin, 'archive', chosen.id, db);
  await mutateHearingLifecycle(
    admin,
    'archive',
    request({
      id: h.id,
      confirmation: h.id,
      version: h.version,
      facts: h.facts,
      action: 'archive',
    }),
    meta(),
  );
  assert.deepEqual(await run('lawyer-principal-matters', 'selected'), principal);
  await assert.rejects(() => save(matters[0]!.id, chosen.id));
  const m = await readMatterLifecycle(admin, 'archive', matters[0]!.id, db);
  await mutateMatterLifecycle(
    admin,
    'archive',
    request({
      id: m.id,
      confirmation: m.id,
      version: m.version,
      counts: m.counts,
      action: 'archive',
    }),
    meta(),
  );
  assert.deepEqual(await run('lawyer-principal-matters', 'selected'), principal);
  await assert.rejects(() => save(matters[0]!.id, null, false));
  const beforeRetire = await readMatterMutation(admin, 'update', matters[4]!.id, db);
  await mutateMatter(
    admin,
    'update',
    request({
      id: matters[4]!.id,
      version: beforeRetire.record!.version,
      values: {},
      lawyers: beforeRetire.lawyers.filter((l) => l.person_id !== 4),
    }),
    meta(),
  );
  assert.ok(
    !rows(await run('lawyer-supporting-matters', 'selected', 4)).some(
      (r) => r.id === `matter:${matters[4]!.id}`,
    ),
  );
  checks.push(
    'chosen hearing cannot move to another parent; archived chosen/matter report unchanged and saves denied; retired support excluded',
  );
  progress();
  await withApprovedMigrationClient(
    async (c) => {
      await assertIsolatedTestCluster(c, new URL(url));
      assert.deepEqual(await lawyerSelectionFailures(c), []);
      for (const sql of [
        'ALTER TABLE _migration.client_report_selection_submission DISABLE TRIGGER lawyer_selection_scope',
        'ALTER FUNCTION public.lawyer_report_historical_reviewer(integer[]) SET search_path=public',
      ]) {
        await c.query('BEGIN');
        try {
          await c.query(sql);
          assert.ok((await lawyerSelectionFailures(c)).length > 0);
        } finally {
          await c.query('ROLLBACK');
        }
      }
      await c.query('BEGIN');
      try {
        await c.query("INSERT INTO _migration.lawyer_report_submission_scope VALUES($1,'lawyer')", [
          randomUUID(),
        ]);
        await assert.rejects(() => c.query('SET CONSTRAINTS ALL IMMEDIATE'), /lacks exact receipt/);
      } finally {
        await c.query('ROLLBACK');
      }
      assert.deepEqual(await lawyerSelectionFailures(c), []);
    },
    { databaseUrl: url },
  );
  checks.push(
    'ongoing checks reject disabled global scope trigger and altered reviewer function; deferred registry rejects orphan receipts',
  );
  progress();
  writeFileSync(
    join(out, 'lawyer-edges.json'),
    JSON.stringify(
      {
        status: 'PASS',
        utc: new Date().toISOString(),
        matters,
        hearings,
        chosen: chosen.id,
        latest: expert.id,
        checks,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log('PASS lawyer report native mismatch and invariant edges');
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : 'failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
