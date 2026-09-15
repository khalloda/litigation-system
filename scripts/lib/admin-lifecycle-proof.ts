import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClientBase } from 'pg';
import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  readAdminLifecycle,
  mutateAdminLifecycle,
  type AdminLifecycleOperation,
  type AdminLifecycleInput,
} from '../../src/lib/admin-lifecycle';
import { mutateAdminWork, readAdminMutation } from '../../src/lib/admin-work-mutations';
import {
  readAdminWork,
  readAdminWorks,
  parseAdminFilters,
  parseAdminDetailParams,
  adminDetailHref,
  AdminFilterError,
} from '../../src/lib/admin-work-query';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { setHumanAuditContext } from '../../src/lib/audit';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { adminEditState } from './admin-edit-state';
import { assertAdminLifecycleBoundary } from './admin-lifecycle-checkpoint';
import { assertAdminEditBoundary } from './admin-edit-checkpoint';
import { setHearingParentArchive } from '../test-hearing-read-only';
import { setMatterClientArchive } from '../test-matter-read-only';
import { loadReports } from './gate4-database';

export async function proveAdminLifecycle(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  output: string,
) {
  const inspect = <T>(fn: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return fn(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const state = () => inspect(adminEditState),
    results: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    results.push({ name, details });
    writeFileSync(join(output, 'lifecycle-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const sessions = await lifecycleSessions(runtime),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    others = sessions.filter((s) => s.user.role !== 'Administrator');
  const dependencies = () => ({
    database: runtime,
    auditMetadata: createMaintenanceAuditMetadata(),
  });
  const request = async (
    operation: AdminLifecycleOperation,
    id: number,
    step: number | null = null,
  ): Promise<AdminLifecycleInput> => {
    const s = await readAdminLifecycle(admin, operation, id, step, runtime);
    return {
      task_id: id,
      step_id: step,
      version: s.version,
      operation,
      submission: randomUUID() as string,
      confirmation: step ?? id,
      facts: s.facts,
    };
  };
  const save = (r: AdminLifecycleInput, actor = admin) =>
    mutateAdminLifecycle(actor, r.operation, r, dependencies());
  const direct = (r: unknown, actor = admin) =>
    runtime.$transaction(async (tx) => {
      await setHumanAuditContext(tx, Number(actor.user.id), createMaintenanceAuditMetadata());
      return tx.$queryRawUnsafe(
        'SELECT public.admin_lifecycle_save($1::int,$2::int,$3::text,$4::timestamptz,$5::jsonb)',
        Number(actor.user.id),
        actor.user.sessionVersion,
        actor.user.role,
        actor.expires,
        JSON.stringify(r),
      );
    });
  const edit = async (id: number, values: Record<string, unknown>, step: number | null = null) => {
    const snapshot = await readAdminMutation(admin, 'task-update', id, null, runtime);
    return {
      operation: step === null ? ('task-update' as const) : ('step-update' as const),
      task_id: id,
      step_id: step,
      version: snapshot.task!.version,
      submission: randomUUID() as string,
      values,
    };
  };
  const runEdit = (r: Awaited<ReturnType<typeof edit>>) =>
    mutateAdminWork(admin, r.operation, r, dependencies());
  const imported = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT a.id,a.matter_id,count(s.id)::int count FROM admin_tasks a JOIN task_actions s ON s.task_id=a.id LEFT JOIN matters m ON m.id=a.matter_id WHERE NOT coalesce(m.is_archived,false) GROUP BY a.id ORDER BY count(*) DESC,a.id LIMIT 1',
        )
      ).rows[0],
  );
  assert.ok(imported.count > 25);
  const id: number = imported.id,
    step: number = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT id FROM task_actions WHERE task_id=$1 ORDER BY source_ordinal NULLS LAST,id LIMIT 1',
            [id],
          )
        ).rows[0].id,
    );
  const native = await mutateAdminWork(
    admin,
    'task-create',
    {
      operation: 'task-create',
      task_id: null,
      step_id: null,
      version: null,
      submission: randomUUID() as string,
      values: {
        required_work: 'TEST ONLY D63 unassigned work\n100%_ literal',
        matter_id: null,
        task_created_date: null,
      },
    },
    dependencies(),
  );
  const ids = [id, native.id];
  const readBefore = await state();
  for (const operation of [
    'task-archive',
    'task-restore',
    'step-archive',
    'step-restore',
  ] as const) {
    const r = await request(operation, id, operation.startsWith('step') ? step : null);
    for (const actor of others) {
      await assert.rejects(readAdminLifecycle(actor, operation, id, r.step_id, runtime));
      await assert.rejects(save(r, actor));
      await assert.rejects(direct(r, actor));
    }
    for (const r2 of [
      { ...r, actor: 1 },
      { ...r, confirmation: 0 },
      { ...r, step_id: 2147483647 },
      { ...r, facts: { ...r.facts, currentSteps: 99999 } },
      { ...r, version: '0' },
    ])
      await assert.rejects(direct(r2));
  }
  for (const actor of [
    null,
    { ...admin, expires: new Date(0).toISOString() },
    { ...admin, user: { ...admin.user, mustChangePassword: true } },
  ])
    await assert.rejects(readAdminLifecycle(actor, 'task-archive', id, null, runtime));
  assert.deepEqual(await state(), readBefore);
  pass(
    'Four operations: other three roles refused at service/state/gateway; malformed/forged facts and auth reads create no state',
  );
  const reports = () =>
    inspect(async (db) => {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        return await loadReports(db);
      } finally {
        await db.query('ROLLBACK');
      }
    });
  const reportBefore = await reports();
  assert.ok(
    reportBefore.every((d) => d.rows.length > 0),
    'Nonempty actual report datasets',
  );
  const relationship = () =>
    inspect(
      async (db) =>
        (
          await db.query(
            'SELECT matter_id,count(*)::int works,(SELECT count(*)::int FROM task_actions s JOIN admin_tasks a ON a.id=s.task_id WHERE a.matter_id=w.matter_id) steps FROM admin_tasks w WHERE matter_id=$1 GROUP BY matter_id',
            [imported.matter_id],
          )
        ).rows,
    );
  const relationshipBefore = await relationship();
  assert.ok(relationshipBefore.length === 1 && relationshipBefore[0].steps > 0);
  const originalSteps = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,source_ordinal,current_order FROM task_actions WHERE task_id=$1 ORDER BY (current_order IS NOT NULL),source_ordinal NULLS LAST,current_order,id',
          [id],
        )
      ).rows,
  );
  const oldEditor = await edit(id, { result: 'TEST ONLY stale editor must never save' });
  const staleConfirmation = await request('task-archive', id);
  const archivedStepRequest = await request('step-archive', id, step);
  await save(archivedStepRequest);
  await assert.rejects(save(staleConfirmation));
  await assert.rejects(runEdit(oldEditor));
  const originalResult = (await readAdminWork(admin, String(id), '1', runtime))!.result;
  await runEdit(
    await edit(id, { result: 'TEST ONLY changed work retaining independently archived child' }),
  );
  assert.equal((await readAdminLifecycle(admin, 'step-restore', id, step, runtime)).archived, true);
  await runEdit(await edit(id, { result: originalResult }));
  assert.equal(
    (await readAdminWork(admin, String(id), '1', runtime, 'all'))!.steps.find((s) => s.id === step)!
      .archived,
    true,
  );
  const archivedTaskRequest = await request('task-archive', id);
  await save(archivedTaskRequest);
  for (const op of ['step-archive', 'step-restore'] as const)
    await assert.rejects(save(await request(op, id, step)));
  await assert.rejects(runEdit(await edit(id, { result: 'TEST ONLY refused' })));
  const afterArchive = await state();
  await save(archivedStepRequest);
  await save(archivedTaskRequest);
  assert.deepEqual(await state(), afterArchive);
  assert.deepEqual(await reports(), reportBefore);
  assert.deepEqual(await relationship(), relationshipBefore);
  pass(
    'Stale editors/confirmation refused; work retains archived child; exact old receipt under archived parent has no writes; nonempty reports and linked totals unchanged',
  );
  for (const actor of sessions) {
    for (const archive of ['current', 'archived', 'all'] as const) {
      const expected = await inspect(async (db) =>
        (
          await db.query(
            "SELECT id FROM admin_tasks WHERE ($1::text='all' OR is_archived=($1='archived')) ORDER BY task_created_date DESC NULLS LAST,id DESC",
            [archive],
          )
        ).rows.map((r) => r.id),
      );
      const actual: number[] = [];
      let pages = 1;
      for (let page = 1; page <= pages; page++) {
        const list = await readAdminWorks(actor, { archive, page: String(page) }, runtime);
        pages = list.pages;
        assert.equal(list.total, expected.length);
        actual.push(...list.rows.map((r) => r.id));
      }
      assert.deepEqual(actual, expected);
      const stepExpected = originalSteps
          .filter((s) => archive === 'all' || (s.id === step) === (archive === 'archived'))
          .map((s) => s.id),
        stepActual: number[] = [];
      let stepPages = 1;
      for (let page = 1; page <= stepPages; page++) {
        const d = await readAdminWork(actor, String(id), String(page), runtime, archive);
        assert.ok(d && d.archived);
        stepPages = d.stepPages;
        assert.equal(d.stepCount, originalSteps.length);
        assert.equal(d.currentStepCount, originalSteps.length - 1);
        assert.equal(d.archivedStepCount, 1);
        assert.equal(d.visibleStepCount, stepExpected.length);
        stepActual.push(...d.steps.map((s) => s.id));
      }
      assert.deepEqual(stepActual, stepExpected);
    }
    const values = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT a.matter_id,m.client_id,a.assigned_to_person_id,a.status FROM admin_tasks a JOIN matters m ON m.id=a.matter_id WHERE a.id=$1',
            [id],
          )
        ).rows[0],
    );
    for (const archive of ['current', 'archived', 'all'] as const) {
      const expected = await inspect(async (db) =>
        (
          await db.query(
            "SELECT a.id FROM admin_tasks a JOIN matters m ON m.id=a.matter_id WHERE a.matter_id=$1 AND m.client_id IS NOT DISTINCT FROM $2::int AND a.assigned_to_person_id IS NOT DISTINCT FROM $3::int AND a.status IS NOT DISTINCT FROM $4::text AND ($5='all' OR a.is_archived=($5='archived')) ORDER BY a.task_created_date DESC NULLS LAST,a.id DESC",
            [
              values.matter_id,
              values.client_id,
              values.assigned_to_person_id,
              values.status,
              archive,
            ],
          )
        ).rows.map((r) => r.id),
      );
      const actual: number[] = [];
      let pages = 1;
      for (let page = 1; page <= pages; page++) {
        const result = await readAdminWorks(
          actor,
          {
            archive,
            page: String(page),
            matter: String(values.matter_id),
            client: values.client_id === null ? 'missing' : String(values.client_id),
            person:
              values.assigned_to_person_id === null
                ? 'missing'
                : String(values.assigned_to_person_id),
            status: values.status === null ? 'missing' : 'value:' + values.status,
          },
          runtime,
        );
        pages = result.pages;
        actual.push(...result.rows.map((r) => r.id));
        assert.equal(result.total, expected.length);
      }
      assert.deepEqual(actual, expected);
    }
  }
  pass(
    'All four readers: independent complete paginated current/archived/all work and step ID sets and truthful total/current/archived counts',
    {
      works: await inspect(
        async (db) => (await db.query('SELECT count(*)::int n FROM admin_tasks')).rows[0].n,
      ),
      steps: originalSteps.length,
    },
  );
  const clamped = await readAdminWork(admin, String(id), '999', runtime, 'archived');
  assert.ok(clamped?.stepPageClamped && clamped.stepPage === 1);
  for (const p of [
    { archive: 'bad' },
    { archive: ['all', 'current'] },
    { stepArchive: ['all', 'archived'] },
    { stepArchive: 'bad' },
    { stepPage: '01' },
    { fromMatter: 'https://bad.invalid' },
  ])
    assert.throws(() => parseAdminDetailParams(p), AdminFilterError);
  const filters = parseAdminFilters({
    q: '100%_',
    archive: 'all',
    status: 'value:',
    matter: String(imported.matter_id),
    client: 'missing',
    person: 'missing',
    page: '3',
    fromMatter: '/matters?archive=all',
  });
  const round = adminDetailHref(id, filters, 2, 'archived');
  assert.deepEqual(
    parseAdminDetailParams(Object.fromEntries(new URL(round, 'http://local').searchParams)),
    { filters, stepPage: 2, stepArchive: 'archived' },
  );
  await save(await request('task-restore', id));
  assert.equal((await readAdminLifecycle(admin, 'step-restore', id, step, runtime)).archived, true);
  await save(await request('step-restore', id, step));
  assert.deepEqual(
    (await readAdminWork(admin, String(id), '1', runtime, 'all'))!.steps.map((s) => s.id),
    originalSteps.slice(0, 25).map((s) => s.id),
  );
  for (const target of ids) {
    for (const operation of ['task-archive', 'task-restore'] as const) {
      const r = await request(operation, target);
      await save(r);
      const changed = await state();
      await save(r);
      assert.equal((await save(await request(operation, target))).changed, false);
      assert.deepEqual(await state(), changed);
    }
  }
  pass(
    'Restore keeps separate child flags; original order restored; unassigned zero-step native and imported transitions/retries/no-ops; validated navigation/clamping',
  );
  const nativeSteps: number[] = [];
  for (let n = 0; n < 2; n++) {
    const current = await readAdminMutation(admin, 'task-update', native.id, null, runtime);
    const created = await mutateAdminWork(
      admin,
      'step-create',
      {
        operation: 'step-create',
        task_id: native.id,
        step_id: null,
        version: current.task!.version,
        submission: randomUUID(),
        values: { result: 'TEST ONLY native order ' + n },
      },
      dependencies(),
    );
    nativeSteps.push(created.stepId!);
    await save(await request('step-archive', native.id, created.stepId));
  }
  for (const child of nativeSteps) await save(await request('step-restore', native.id, child));
  assert.deepEqual(
    await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT id,current_order FROM task_actions WHERE task_id=$1 ORDER BY current_order',
            [native.id],
          )
        ).rows,
    ),
    nativeSteps.map((id, n) => ({ id, current_order: n + 1 })),
  );
  await inspect(async (db) => {
    await db.query('BEGIN');
    try {
      await db.query('ALTER TABLE task_actions DISABLE TRIGGER USER');
      await assert.rejects(
        db.query('UPDATE task_actions SET current_order=1 WHERE id=$1', [nativeSteps[1]]),
        /unique|duplicate/u,
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });
  pass(
    'Native step archive/restore and append beyond archived maximum retain positions; duplicate native order refused by permanent unique index',
  );
  for (const [taskId, childId] of [
    [id, step],
    [native.id, nativeSteps[0]!],
  ]) {
    for (const operation of ['step-archive', 'step-restore'] as const) {
      const r = await request(operation, taskId!, childId!);
      await save(r);
      const changed = await state();
      await save(r);
      assert.equal((await save(await request(operation, taskId!, childId!))).changed, false);
      assert.deepEqual(await state(), changed);
    }
  }
  pass(
    'Imported/native step archive and restore: exact retries and fresh unchanged requests preserve every table and sequence',
  );
  const foreignBefore = await state();
  const foreignRequest = await request('step-archive', id, step);
  await assert.rejects(readAdminLifecycle(admin, 'step-archive', id, nativeSteps[0]!, runtime));
  await assert.rejects(
    direct({ ...foreignRequest, step_id: nativeSteps[0], confirmation: nativeSteps[0] }),
  );
  assert.deepEqual(await state(), foreignBefore);
  pass(
    'Real foreign-parent step refused at state and committing gateway with complete state unchanged',
  );
  // Shared token namespace and current source authority before receipt reuse.
  const committed = await request('task-archive', native.id);
  await save(committed);
  await save(await request('task-restore', native.id));
  const tokenState = await state();
  for (const changed of [
    { ...committed, operation: 'task-restore' as const },
    { ...committed, task_id: id },
    { ...committed, step_id: step },
    { ...committed, facts: { ...committed.facts, matterId: 1 } },
  ])
    await assert.rejects(direct(changed));
  await assert.rejects(
    runEdit({
      ...(await edit(native.id, { result: 'TEST ONLY token crossing' })),
      submission: committed.submission,
    }),
  );
  const ordinary = await edit(native.id, { result: 'TEST ONLY prior edit token' });
  await runEdit(ordinary);
  const afterEdit = await state();
  await assert.rejects(
    save({ ...(await request('task-archive', native.id)), submission: ordinary.submission }),
  );
  await save(committed);
  assert.deepEqual(await state(), afterEdit);
  assert.ok(tokenState.tables.length > 100);
  const context = async (db: ClientBase) => {
    await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
    await db.query(
      "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY D63 fixture','system')",
      [randomUUID(), randomUUID(), randomUUID()],
    );
  };
  const directPg = (db: ClientBase, r: AdminLifecycleInput, actor = admin) =>
    db.query('SELECT public.admin_lifecycle_save($1,$2,$3,$4,$5::jsonb)', [
      Number(actor.user.id),
      actor.user.sessionVersion,
      actor.user.role,
      actor.expires,
      JSON.stringify(r),
    ]);
  for (const change of [
    'is_enabled=false',
    'must_change_password=true',
    "role_code='Lawyer'",
    'session_version=session_version+1',
  ])
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await context(db);
        await db.query(
          "UPDATE user_accounts SET role_code='Administrator',session_version=session_version+1 WHERE id=$1",
          [Number(others[0]!.user.id)],
        );
        await db.query('SELECT audit_set_human_context($1)', [Number(others[0]!.user.id)]);
        await db.query(
          'UPDATE user_accounts SET ' +
            change +
            (change.startsWith('session_version') ? '' : ',session_version=session_version+1') +
            ' WHERE id=$1',
          [Number(admin.user.id)],
        );
        await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
        const version = (
          await db.query('SELECT session_version FROM user_accounts WHERE id=$1', [
            Number(admin.user.id),
          ])
        ).rows[0].session_version;
        await assert.rejects(
          directPg(db, committed, {
            ...admin,
            user: {
              ...admin.user,
              sessionVersion: change.startsWith('session_version')
                ? admin.user.sessionVersion
                : version,
            },
          }),
          /authorized administrative work session/u,
        );
      } finally {
        await db.query('ROLLBACK');
      }
    });
  await inspect(async (db) => {
    await db.query('BEGIN');
    try {
      await context(db);
      const changed = (
        await db.query(
          "UPDATE user_accounts SET role_code='Administrator',session_version=session_version+1 WHERE id=$1 RETURNING session_version",
          [Number(others[0]!.user.id)],
        )
      ).rows[0];
      await db.query('SELECT audit_set_human_context($1)', [Number(others[0]!.user.id)]);
      await assert.rejects(
        directPg(db, committed, {
          ...others[0]!,
          user: {
            ...others[0]!.user,
            role: 'Administrator',
            sessionVersion: changed.session_version,
          },
        }),
        /belongs to another actor/u,
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });
  await assert.rejects(direct(committed, { ...admin, expires: new Date(0).toISOString() }));
  assert.deepEqual(await state(), afterEdit);
  pass(
    'Shared edit/lifecycle receipts refuse changed payload/action/subject/parent; fresh source account disable/reset/demotion/session-version checks precede old receipt',
  );
  if (imported.matter_id) {
    await setHearingParentArchive(fixture, imported.matter_id, true);
    const locked = await state();
    for (const operation of [
      'task-archive',
      'task-restore',
      'step-archive',
      'step-restore',
    ] as const)
      await assert.rejects(
        save(await request(operation, id, operation.startsWith('step') ? step : null)),
      );
    assert.deepEqual(await state(), locked);
    await setHearingParentArchive(fixture, imported.matter_id, false);
    const client = await inspect(
      async (db) =>
        (await db.query('SELECT client_id FROM matters WHERE id=$1', [imported.matter_id])).rows[0]
          .client_id,
    );
    if (client) {
      await setMatterClientArchive(fixture, client, true);
      await save(await request('task-archive', id));
      await save(await request('task-restore', id));
      await setMatterClientArchive(fixture, client, false);
    }
  }
  pass('Archived matter blocks every new transition; archived client remains independent');
  // A visible lock barrier establishes genuine overlap, never a sleep-only race.
  const blocked = async (db: ClientBase) => {
    for (let i = 0; i < 300; i++) {
      await db.query('SELECT pg_stat_clear_snapshot()');
      if (
        (
          await db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query ~ 'public.admin_(edit|lifecycle)_save' LIMIT 1",
          )
        ).rowCount
      )
        return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error('Required gateway lock overlap not observed');
  };
  for (const kind of [
    'duplicate',
    'task-edit',
    'step-edit',
    'step-create',
    'opposite',
    'child-versus-work',
    'child-versus-sibling',
  ] as const) {
    const childWinner = kind.startsWith('child-');
    const winner = await request(
        childWinner ? 'step-archive' : 'task-archive',
        id,
        childWinner ? step : null,
      ),
      pendingEdit = await edit(
        id,
        { result: 'TEST ONLY losing edit' },
        kind === 'step-edit' ? step : kind === 'child-versus-sibling' ? originalSteps[1]!.id : null,
      );
    const loser = kind === 'opposite' ? await request('task-restore', id) : winner;
    await inspect(async (db) => {
      await db.query('BEGIN');
      await context(db);
      await db.query(
        'SELECT singleton FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE',
      );
      const pending = Promise.allSettled([
        kind === 'task-edit' || kind === 'step-edit' || childWinner
          ? runEdit(pendingEdit)
          : kind === 'step-create'
            ? mutateAdminWork(
                admin,
                'step-create',
                {
                  ...pendingEdit,
                  operation: 'step-create',
                  step_id: null,
                  values: { result: 'TEST ONLY losing create' },
                },
                dependencies(),
              )
            : save(loser),
      ]);
      try {
        await blocked(db);
        await directPg(db, winner);
        await db.query('COMMIT');
      } finally {
        await db.query('ROLLBACK');
      }
      const result = (await pending)[0]!;
      assert.equal(result.status, kind === 'duplicate' ? 'fulfilled' : 'rejected');
    });
    await save(
      await request(childWinner ? 'step-restore' : 'task-restore', id, childWinner ? step : null),
    );
    await inspect(assertAdminLifecycleBoundary);
  }
  pass(
    'Seven deterministic held-mutex overlaps: duplicate click, work archive versus work/step edit and step creation, archive versus restore, step archive versus work/sibling edit; one winner/valid retry',
  );
  for (const operation of ['task-archive', 'step-archive'] as const) {
    const pendingRequest = await request(operation, id, operation === 'step-archive' ? step : null);
    await inspect(async (db) => {
      await db.query('BEGIN');
      await context(db);
      await db.query('SELECT id FROM matters WHERE id=$1 FOR UPDATE', [imported.matter_id]);
      const actor = [
        Number(admin.user.id),
        admin.user.sessionVersion,
        admin.user.role,
        admin.expires,
      ];
      const parent = (
        await db.query('SELECT public.matter_lifecycle_state($1,$2,$3,$4,$5) state', [
          ...actor,
          imported.matter_id,
        ])
      ).rows[0].state;
      const pending = Promise.allSettled([save(pendingRequest)]);
      try {
        await blocked(db);
        await db.query('SELECT public.matter_lifecycle_save($1,$2,$3,$4,$5::jsonb)', [
          ...actor,
          JSON.stringify({
            id: imported.matter_id,
            confirmation: imported.matter_id,
            action: 'archive',
            version: parent.version,
            counts: parent.counts,
            submission: randomUUID(),
          }),
        ]);
        await db.query('COMMIT');
      } finally {
        await db.query('ROLLBACK');
      }
      assert.equal((await pending)[0]!.status, 'rejected');
    });
    await setHearingParentArchive(fixture, imported.matter_id, false);
    await inspect(assertAdminLifecycleBoundary);
  }
  pass(
    'Observed matter-row lock overlap refuses pending work and step archive after parent archive commits',
  );
  // Corruption is injected only in rollback transactions on the positively
  // identified disposable cluster, with original guards restored by rollback.
  const corruptions: [string, string, boolean][] = [
    [
      'boundary constraint removed',
      'ALTER TABLE _migration.admin_lifecycle_boundary DROP CONSTRAINT admin_lifecycle_boundary_prior_versions_check',
      true,
    ],
    [
      'history parent',
      `ALTER TABLE _migration.admin_edit_change DISABLE TRIGGER USER; UPDATE _migration.admin_edit_change SET after_values=jsonb_set(after_values,'{task,matter_id}','null') WHERE task_id=${id}`,
      false,
    ],
    [
      'history version',
      `ALTER TABLE _migration.admin_edit_change DISABLE TRIGGER USER; UPDATE _migration.admin_edit_change SET after_values=jsonb_set(after_values,'{task,row_version}','0') WHERE task_id=${id}`,
      false,
    ],
    [
      'current flag',
      `ALTER TABLE admin_tasks DISABLE TRIGGER USER; UPDATE admin_tasks SET is_archived=NOT is_archived WHERE id=${id}`,
      false,
    ],
    [
      'new history flag',
      `ALTER TABLE _migration.admin_edit_change DISABLE TRIGGER USER; UPDATE _migration.admin_edit_change SET after_values=jsonb_set(after_values,'{task,is_archived}','true') WHERE task_id=${id} AND version=(SELECT max(version) FROM _migration.admin_edit_change WHERE task_id=${id})`,
      false,
    ],
    [
      'history actor',
      `ALTER TABLE _migration.admin_edit_change DISABLE TRIGGER USER; UPDATE _migration.admin_edit_change SET actor_id=${Number(others[0]!.user.id)} WHERE task_id=${id}`,
      false,
    ],
    [
      'receipt subject',
      `ALTER TABLE _migration.admin_edit_submission DISABLE TRIGGER USER; UPDATE _migration.admin_edit_submission SET request_payload=jsonb_set(request_payload,'{confirmation}','0') WHERE task_id=${id} AND request_payload->>'operation' LIKE '%archive'`,
      false,
    ],
    [
      'receipt counts',
      `ALTER TABLE _migration.admin_edit_submission DISABLE TRIGGER USER; UPDATE _migration.admin_edit_submission SET request_payload=jsonb_set(request_payload,'{facts,currentSteps}','0') WHERE task_id=${id} AND request_payload->>'operation'='task-restore'`,
      false,
    ],
    [
      'semantic subject',
      `ALTER TABLE audit_events DISABLE TRIGGER USER; UPDATE audit_events SET entity_key='{"id":2147483647}' WHERE entity_table='task_actions' AND action='archive'`,
      false,
    ],
    [
      'missing semantic audit',
      `ALTER TABLE audit_events DISABLE TRIGGER USER; DELETE FROM audit_events WHERE entity_table='admin_tasks' AND action='archive'`,
      false,
    ],
    [
      'missing lifecycle trigger',
      'ALTER TABLE task_actions DISABLE TRIGGER zy_admin_lifecycle_guard',
      true,
    ],
    [
      'runtime boundary ACL',
      'GRANT SELECT ON _migration.admin_lifecycle_boundary TO litigation_runtime',
      true,
    ],
    [
      'PUBLIC gateway ACL',
      'GRANT EXECUTE ON FUNCTION public.admin_lifecycle_state(integer,integer,text,timestamptz,integer,integer) TO PUBLIC',
      true,
    ],
  ];
  const corruptionBefore = await state();
  for (const [name, sql, structural] of corruptions) {
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await db.query(sql);
        if (structural) await assert.rejects(assertAdminLifecycleBoundary(db));
        else
          assert.equal(
            (await db.query('SELECT _migration.admin_edit_current_valid($1) valid', [id])).rows[0]
              .valid,
            false,
            name,
          );
      } finally {
        await db.query('ROLLBACK');
      }
    });
  }
  assert.deepEqual(await state(), corruptionBefore);
  await inspect((db) => assertAdminEditBoundary(db, 'historical-full-state-upgrade'));
  await inspect(assertAdminLifecycleBoundary);
  pass(
    'Targeted corruptions rejected, each rolled back; full fixture state exact',
    corruptions.map((c) => c[0]),
  );
  writeFileSync(
    join(output, 'report-visibility.json'),
    JSON.stringify(
      {
        nonemptyDatasets: reportBefore.map((d) => ({ name: d.name, rows: d.rows.length })),
        beforeAfterSha256: createHash('sha256').update(JSON.stringify(reportBefore)).digest('hex'),
        relationship: relationshipBefore,
      },
      null,
      2,
    ),
  );
  return { id, step, nativeId: native.id };
}
