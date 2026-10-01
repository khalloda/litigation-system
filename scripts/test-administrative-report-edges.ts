import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { mutateMatter } from '../src/lib/matter-mutations';
import { mutateHearing } from '../src/lib/hearing-mutations';
import { mutateAdminWork } from '../src/lib/admin-work-mutations';
import { readAdminLifecycle, mutateAdminLifecycle } from '../src/lib/admin-lifecycle';
import { readMatterLifecycle, mutateMatterLifecycle } from '../src/lib/matter-lifecycle';
import { saveAdministrativeReportSelection } from '../src/lib/reports/administrative-selection';
import { administrativeReports } from '../src/lib/reports/administrative-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { validateReportData } from '../src/lib/reports/result';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL,
    out = process.env.TASK6567_EVIDENCE;
  assert.ok(url && out);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const path = join(out, 'administrative-edge-progress.json');
  assert.ok(!existsSync(path), 'Inspect and reconcile prior write outcome before retry');
  const attempts: { label: string; input: unknown; result?: unknown }[] = [];
  const checks: unknown[] = [];
  const progress = () => writeFileSync(path, JSON.stringify({ attempts, checks }, null, 2) + '\n');
  async function execute<T>(label: string, input: unknown, fn: () => Promise<T>) {
    const entry: { label: string; input: unknown; result?: unknown } = { label, input };
    attempts.push(entry);
    progress();
    const result = await fn();
    entry.result = result;
    progress();
    return result;
  }
  const admin = (await lifecycleSessions(db)).find((s) => s.user.role === 'Administrator')!;
  const meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  async function selection(kind: 'hearing' | 'step', id: number) {
    const r =
      kind === 'hearing'
        ? await db.hearing.findUniqueOrThrow({ where: { id } })
        : await db.taskAction.findUniqueOrThrow({ where: { id } });
    const parent =
      kind === 'hearing' ? (r as { matterId: number }).matterId : (r as { taskId: number }).taskId;
    const task =
      kind === 'step' ? await db.adminTask.findUniqueOrThrow({ where: { id: parent } }) : null;
    const matter = await db.matter.findUniqueOrThrow({
      where: { id: task ? task.matterId! : parent },
    });
    const current =
      kind === 'hearing'
        ? await db.administrativeHearingReportSelection.findUnique({ where: { id } })
        : await db.administrativeStepReportSelection.findUnique({ where: { id } });
    return {
      scope: `administrative-${kind}`,
      id,
      parent,
      client: matter.clientId!,
      version: String(current?.rowVersion ?? 0),
      parentVersion: String(task?.rowVersion ?? matter.rowVersion),
      recordVersion: kind === 'hearing' ? String((r as { rowVersion: bigint }).rowVersion) : null,
      selected: true,
      submission: randomUUID(),
    };
  }
  async function choose(kind: 'hearing' | 'step', id: number) {
    const input = await selection(kind, id);
    return execute(`choose-${kind}-${id}`, input, () =>
      saveAdministrativeReportSelection(admin, input, meta()),
    );
  }
  // Existing full-state records exercise historically preserved destination,
  // short-decision and notification columns, which native editing cannot set.
  const works = await db.$queryRaw<{ id: number; matter: number }[]>(Prisma.sql`
    SELECT w.id,w.matter_id matter FROM public.admin_tasks w JOIN public.matters m ON m.id=w.matter_id
    WHERE w.status<>'منجزة' AND NOT w.is_archived AND NOT m.is_archived AND m.client_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.hearings h WHERE h.matter_id=m.id AND NOT h.is_archived)
      AND EXISTS(SELECT 1 FROM public.task_actions s WHERE s.task_id=w.id AND NOT s.is_archived)
    ORDER BY w.id LIMIT 8`);
  const selectedHearings = new Set<number>(),
    selectedSteps = new Set<number>();
  for (const w of works) {
    const hs = await db.hearing.findMany({
      where: { matterId: w.matter, isArchived: false },
      orderBy: { id: 'asc' },
      take: 3,
      select: { id: true },
    });
    const ss = await db.taskAction.findMany({
      where: { taskId: w.id, isArchived: false },
      orderBy: { id: 'asc' },
      take: 3,
      select: { id: true },
    });
    hs.forEach((h) => selectedHearings.add(h.id));
    ss.forEach((s) => selectedSteps.add(s.id));
  }
  const overdue = await db.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT h.id FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
    WHERE m.status='سارية' AND m.client_id IS NOT NULL AND NOT m.is_archived AND NOT h.is_archived
      AND h.destination_id IS NOT NULL AND h.next_hearing_date<'2026-10-01'::date
      AND h.next_hearing_date=(SELECT max(x.next_hearing_date) FROM public.hearings x JOIN public.lookup_hearing_action a ON a.id=x.action_id WHERE x.matter_id=m.id AND a.label_ar='محكمة')
    ORDER BY h.id LIMIT 12`);
  overdue.forEach((h) => selectedHearings.add(h.id));
  assert.ok(works.length === 8 && overdue.length > 0);
  for (const id of selectedHearings) await choose('hearing', id);
  for (const id of selectedSteps) await choose('step', id);
  checks.push({
    phase: 'historical-choices',
    works,
    hearingIds: [...selectedHearings],
    stepIds: [...selectedSteps],
    overdueIds: overdue.map((h) => h.id),
  });
  progress();

  const record = 'TEST ONLY TASK6567 administrative\n001 / 2080\n140J / 140ق';
  assert.equal(await db.matter.count({ where: { caseNumberAr: record } }), 0);
  const destinations = await db.lookupMatterDestination.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    take: 2,
  });
  assert.equal(destinations.length, 2);
  const court = await db.lookupCourt.findFirstOrThrow({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });
  const matterInput = {
    id: null,
    version: null,
    submission: randomUUID(),
    values: {
      client_id: 245,
      case_number_ar: record,
      subject: 'TEST ONLY TASK6567 أَإِ ثانٍ\n' + 'TEST ONLY multiline text '.repeat(40),
      status: 'سارية',
      destination_id: destinations[1]!.id,
      court_id: court.id,
    },
    parties: [
      {
        id: null,
        side: 'client',
        party_name: 'TEST ONLY TASK6567 party\nsecond line',
        gender: null,
        ordinal: 1,
        roles: [],
      },
    ],
    lawyers: [
      { id: null, person_id: 4, role: 'lead', position: 1 },
      { id: null, person_id: 7, role: 'support', position: 2 },
    ],
  };
  const matter = await execute('native-matter', matterInput, () =>
    mutateMatter(admin, 'create', matterInput, meta()),
  );
  const hearings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const input = {
      id: null,
      version: null,
      submission: randomUUID(),
      values: {
        matter_id: matter.id,
        hearing_date: i === 4 ? null : i === 0 ? '2024-02-29' : '2026-09-30',
        next_hearing_date: i === 4 ? null : i === 3 ? '2080-02-29' : '2026-09-30',
        decision:
          i === 0
            ? ''
            : i === 4
              ? null
              : 'TEST ONLY TASK6567 decision ' +
                i +
                '\n' +
                'TEST ONLY أَإِ ثانٍ '.repeat(i === 1 ? 200 : 1),
        court_id: court.id,
      },
      attendees: [{ id: null, person_id: 4 }],
    };
    const h = await execute('native-hearing-' + i, input, () =>
      mutateHearing(admin, 'create', input, meta()),
    );
    hearings.push(h.id);
    await choose('hearing', h.id);
  }
  const tasks: number[] = [],
    steps: number[] = [];
  for (let i = 0; i < 4; i++) {
    const input = {
      operation: 'task-create',
      task_id: null,
      step_id: null,
      version: null,
      submission: randomUUID(),
      values: {
        matter_id: matter.id,
        required_work: 'TEST ONLY TASK6567 work ' + i,
        status: i === 2 ? 'منجزة' : i === 3 ? null : 'TEST ONLY TASK6567 pending',
        task_created_date: i === 0 ? '2026-10-02' : null,
        destination_id: destinations[0]!.id,
        court_id: court.id,
      },
    };
    const w = await execute('native-work-' + i, input, () =>
      mutateAdminWork(admin, 'task-create', input, meta()),
    );
    tasks.push(w.id);
    for (let j = 0; j < (i === 1 ? 0 : 3); j++) {
      const parent = await db.adminTask.findUniqueOrThrow({ where: { id: w.id } });
      const step = {
        operation: 'step-create',
        task_id: w.id,
        step_id: null,
        version: String(parent.rowVersion),
        submission: randomUUID(),
        values: {
          action_date: j === 2 ? null : '2026-09-30',
          performed_by_person_id: 4,
          result: j === 2 ? '' : 'TEST ONLY TASK6567 result ' + i + '/' + j,
          report: j === 2 ? 'TEST ONLY TASK6567 undated empty-result context' : null,
        },
      };
      const s = await execute('native-step-' + i + '-' + j, step, () =>
        mutateAdminWork(admin, 'step-create', step, meta()),
      );
      steps.push(s.stepId!);
      await choose('step', s.stepId!);
    }
  }
  const run = async (
    id: string,
    fields: Record<string, string> = {},
    instant = '2026-09-30T21:00:00Z',
  ) => {
    const d = administrativeReports.find((d) => d.descriptor.id === id)!;
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const data = await d.query(
          tx,
          parseReportInput(d.descriptor, new URLSearchParams({ format: 'preview', ...fields }))
            .parameters,
          { generatedAt: instant },
        );
        validateReportData(d.descriptor, data);
        return data;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  };
  const flat = (data: Awaited<ReturnType<typeof run>>) =>
    data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
  const dst = { destination: String(destinations[0]!.id) };
  const destinationReport = await run('administrative-by-destination', dst);
  const native = destinationReport.sections[0]!.groups.flatMap((g) => g.rows).filter((r) =>
    tasks.some((id) => r.id === `work:${id}`),
  );
  assert.equal(native.length, 2);
  assert.deepEqual(native.find((r) => r.id === `work:${tasks[0]}`)!.cells.at(-1), {
    type: 'integer',
    value: '-1',
  });
  assert.deepEqual(native.find((r) => r.id === `work:${tasks[1]}`)!.cells.at(-1), { type: 'null' });
  const stepCell = native.find((r) => r.id === `work:${tasks[0]}`)!.cells[6]!;
  assert.ok(
    stepCell.type === 'text' && stepCell.value.includes('0/0') && stepCell.value.includes('0/1'),
  );
  assert.ok(!('value' in stepCell) || !String(stepCell.value).includes('0/2'));
  const clientReport = await run('administrative-by-client', { client: '245' });
  assert.deepEqual(
    flat(clientReport)
      .filter((r) => tasks.some((id) => r.id === `work:${id}`))
      .map((r) => r.id),
    [`work:${tasks[0]}`],
  );
  const chosenStepCell = flat(clientReport).find((r) => r.id === `work:${tasks[0]}`)!.cells[7]!;
  assert.ok(
    chosenStepCell.type === 'text' &&
      chosenStepCell.value.includes('0/0') &&
      chosenStepCell.value.includes('0/1'),
  );
  const nullNative = await db.hearing.findMany({
    where: { id: { in: hearings } },
    select: {
      destinationId: true,
      shortDecision: true,
      clientNotified: true,
      legacyId: true,
      report: true,
    },
  });
  assert.ok(nullNative.every((h) => Object.values(h).every((v) => v === null)));
  assert.equal(
    flat(await run('unnotified-decisions', { from: '0001-01-01', to: '2026-10-01' })).filter((r) =>
      hearings.some((id) => r.id === `hearing:${id}`),
    ).length,
    0,
  );
  const stale = await selection('step', steps[0]!);
  const life = await readAdminLifecycle(admin, 'task-archive', tasks[0]!, null, db);
  const archive = {
    operation: 'task-archive',
    task_id: life.id,
    step_id: null,
    confirmation: life.id,
    version: life.version,
    facts: life.facts,
    submission: randomUUID(),
  };
  await execute('archive-native-work', archive, () =>
    mutateAdminLifecycle(admin, 'task-archive', archive, meta()),
  );
  await assert.rejects(saveAdministrativeReportSelection(admin, stale, meta()));
  assert.deepEqual(await run('administrative-by-client', { client: '245' }), clientReport);
  const m = await readMatterLifecycle(admin, 'archive', matter.id, db);
  const archiveMatter = {
    id: m.id,
    confirmation: m.id,
    version: m.version,
    counts: m.counts,
    action: 'archive',
    submission: randomUUID(),
  };
  await execute('archive-native-matter', archiveMatter, () =>
    mutateMatterLifecycle(admin, 'archive', archiveMatter, meta()),
  );
  assert.deepEqual(await run('administrative-by-destination', dst), destinationReport);
  await assert.rejects(
    saveAdministrativeReportSelection(admin, await selection('hearing', hearings[0]!), meta()),
  );
  checks.push({
    phase: 'native-and-archive',
    matter: matter.id,
    hearings,
    tasks,
    steps,
    assertions: [
      'two latest step ties retained',
      'no Cartesian duplication',
      'all selected contexts retained',
      'empty and NULL distinct',
      'missing followup retained only by destination',
      'future age negative and NULL age unknown',
      'completed and NULL work status excluded',
      'native immutable historical columns NULL, unnotified exclusion',
      'archived work and matter included, selection mutations refused',
      'stale parent selection refused',
    ],
  });
  progress();
  writeFileSync(
    join(out, 'administrative-edge-proof.json'),
    JSON.stringify({ status: 'PASS', checks, attempts: attempts.length }, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log('PASS administrative full-state choices, native rows and archive boundaries');
}
main()
  .finally(() => db.$disconnect())
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
