import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Session } from 'next-auth';
import { db } from '../src/lib/db';
import { mutateMatter, readMatterMutation } from '../src/lib/matter-mutations';
import { mutateHearing } from '../src/lib/hearing-mutations';
import { mutateHearingLifecycle, readHearingLifecycle } from '../src/lib/hearing-lifecycle';
import { mutateMatterLifecycle, readMatterLifecycle } from '../src/lib/matter-lifecycle';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { judgmentsByLawyer } from '../src/lib/reports/judgments-by-lawyer';
import { parseReportInput } from '../src/lib/reports/input';
import { validateReportData } from '../src/lib/reports/result';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

async function main() {
  const out = process.argv[2]!;
  assert(out);
  const f = JSON.parse(readFileSync(out + '/private/fixture.json', 'utf8'));
  await withApprovedMigrationClient(
    (c) => assertIsolatedTestCluster(c, new URL(f.migrationUrl), f.environment),
    { databaseUrl: f.migrationUrl },
  );
  const path = out + '/judgments-edge-progress.json';
  assert(!existsSync(path), 'Establish previous mutation outcomes before retry');
  const admin = (
    JSON.parse(readFileSync(out + '/private/genuine-sessions.json', 'utf8')) as Session[]
  ).find((s) => s.user.role === 'Administrator')!;
  const meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  const requests: { name: string; input: unknown; result?: unknown }[] = [],
    checks: string[] = [];
  const save = () => writeFileSync(path, JSON.stringify({ requests, checks }, null, 2));
  async function perform<T>(name: string, input: unknown, work: () => Promise<T>) {
    const item: { name: string; input: unknown; result?: unknown } = { name, input };
    requests.push(item);
    save();
    item.result = await work();
    save();
    return item.result as T;
  }
  assert.equal(
    await db.matter.count({ where: { caseNumberAr: { startsWith: 'TEST ONLY TASK68' } } }),
    0,
  );
  const options = await readMatterMutation(admin, 'create', null, db);
  for (const id of [4, 7, 8])
    assert.equal(options.people.filter((p) => p.id === id && p.active).length, 1);
  assert.equal(options.clients.filter((c) => c.id === 245 && c.active).length, 1);
  const court = options.choices.court_id!.find((c) => c.active)!.id;
  const caseNumber = 'TEST ONLY TASK68\n001 / 52ق\n140J / 140ق';
  const long = 'TEST ONLY legal text — أَإِ ثانٍ ABC-001\n'.repeat(50);
  const matters = [];
  for (let i = 0; i < 2; i++) {
    const input = {
      id: null,
      version: null,
      submission: randomUUID(),
      values: {
        client_id: 245,
        status: 'سارية',
        case_number_ar: caseNumber + '\n' + i,
        subject: i === 0 ? long : 'TEST ONLY unassigned after retirement',
        court_id: court,
      },
      lawyers:
        i === 0
          ? [
              { id: null, person_id: 4, role: 'lead', position: 1 },
              { id: null, person_id: 7, role: 'co_lead', position: 2 },
              { id: null, person_id: 8, role: 'support', position: 3 },
            ]
          : [{ id: null, person_id: 8, role: 'lead', position: 1 }],
      parties: [],
    };
    matters.push(
      await perform('create native matter ' + i, input, () =>
        mutateMatter(admin, 'create', input, meta()),
      ),
    );
  }
  const definitions: [string | null, string | null][] = [
    ['2080-02-28', 'صالح'],
    ['2080-02-29', 'صالح'],
    ['2080-02-29', 'ضد'],
    ['2080-02-29', 'TEST ONLY unknown'],
    ['2080-02-29', ''],
    ['2080-02-29', null],
    [null, 'صالح'],
    ['2080-03-01', 'صالح'],
    ['2080-02-29', ' '],
  ];
  const hearings: Awaited<ReturnType<typeof mutateHearing>>[] = [];
  for (const [index, [date, outcome]] of [
    ...definitions,
    ['2080-02-29', 'ضد'] as [string, string],
  ].entries()) {
    const input = {
      id: null,
      version: null,
      submission: randomUUID(),
      values: {
        matter_id: matters[index === 9 ? 1 : 0]!.id,
        hearing_date: date,
        outcome,
        decision: 'TEST ONLY decision ' + index,
        court_id: court,
        circuit: 'TEST ONLY hearing circuit',
        notes: index === 1 ? long : index === 2 ? '' : null,
      },
      attendees: [],
    };
    hearings.push(
      await perform('create native hearing ' + index, input, () =>
        mutateHearing(admin, 'create', input, meta()),
      ),
    );
  }
  const retiring = await db.matter.findUniqueOrThrow({ where: { id: matters[1]!.id } });
  const input = {
    id: retiring.id,
    version: String(retiring.rowVersion),
    submission: randomUUID(),
    values: {},
    lawyers: [],
  };
  await perform('retire principal for unassigned group', input, () =>
    mutateMatter(admin, 'update', input, meta()),
  );
  const parameters = parseReportInput(
    judgmentsByLawyer.descriptor,
    new URLSearchParams({ format: 'preview', from: '2080-02-29', to: '2080-02-29' }),
  ).parameters;
  const report = () =>
    db.$transaction((tx) => judgmentsByLawyer.query(tx, parameters), {
      isolationLevel: 'RepeatableRead',
    });
  const before = await report();
  assert.equal(validateReportData(judgmentsByLawyer.descriptor, before), 9);
  assert.equal(before.totals[0]!.value.type === 'integer' && before.totals[0]!.value.value, '5');
  assert.deepEqual(before.sections.map((s) => s.id).sort(), [
    'lawyer:4',
    'lawyer:7',
    'lawyer:unassigned',
  ]);
  for (const id of [4, 7]) {
    const s = before.sections.find((s) => s.id === `lawyer:${id}`)!;
    assert.deepEqual(
      s.groups.flatMap((g) => g.rows.map((r) => r.id)).sort(),
      [1, 2, 3, 8].map((i) => `lawyer:${id}:hearing:${hearings[i]!.id}`).sort(),
    );
    assert.deepEqual(
      s.groups.flatMap((g) => g.rows).find((r) => r.id.endsWith(':' + hearings[1]!.id))!.cells[7],
      { type: 'text', value: long },
    );
  }
  assert.deepEqual(
    before.sections
      .find((s) => s.id === 'lawyer:unassigned')!
      .groups.flatMap((g) => g.rows.map((r) => r.id)),
    [`lawyer:unassigned:hearing:${hearings[9]!.id}`],
  );
  checks.push(
    'two current principals; support and retired principal excluded; unassigned retained',
    'native same-day repeated hearings; exact endpoints; null/empty outcomes and undated excluded; unknown/space preserved',
    'complete multiline mixed-script values and long notes',
  );
  save();
  const hearing = await readHearingLifecycle(admin, 'archive', hearings[1]!.id, db);
  const hInput = {
    id: hearing.id,
    confirmation: hearing.id,
    version: hearing.version,
    submission: randomUUID(),
    action: 'archive',
    facts: hearing.facts,
  };
  await perform('archive task-owned native hearing', hInput, () =>
    mutateHearingLifecycle(admin, 'archive', hInput, meta()),
  );
  const matter = await readMatterLifecycle(admin, 'archive', matters[0]!.id, db);
  const mInput = {
    id: matter.id,
    confirmation: matter.id,
    version: matter.version,
    submission: randomUUID(),
    action: 'archive',
    counts: matter.counts,
  };
  await perform('archive task-owned native matter', mInput, () =>
    mutateMatterLifecycle(admin, 'archive', mInput, meta()),
  );
  const after = await report();
  assert.deepEqual(after, before);
  checks.push('exact output preserved after native hearing and matter archive');
  save();
  writeFileSync(
    out + '/judgments-by-lawyer-edges-oracle.json',
    JSON.stringify({ status: 'PASS', parameters, data: after, matters, hearings, checks }, null, 2),
    { flag: 'wx' },
  );
  console.log(
    'PASS Task68 native, overlap, unassigned, retired/support, unknown/null/empty, date and archive edges',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
