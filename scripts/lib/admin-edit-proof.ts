import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClientBase } from 'pg';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateAdminWork, readAdminMutation } from '../../src/lib/admin-work-mutations';
import {
  parseAdminMutationInput,
  parseAdminMutationForm,
  type AdminOperation,
} from '../../src/lib/admin-work-mutation-input';
import { readAdminWork, readAdminWorks } from '../../src/lib/admin-work-query';
import { setHumanAuditContext } from '../../src/lib/audit';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { adminEditState } from './admin-edit-state';
import { assertAdminEditBoundary } from './admin-edit-checkpoint';
import { setHearingParentArchive } from '../test-hearing-read-only';

export async function proveAdminEditing(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  output: string,
) {
  const inspect = <T>(work: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return work(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const results: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    results.push({ name, details });
    writeFileSync(join(output, 'mutation-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const sessions = await lifecycleSessions(runtime),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    writers = sessions.filter((s) => s.user.role !== 'Lawyer'),
    lawyer = sessions.find((s) => s.user.role === 'Lawyer')!;
  const run = (operation: AdminOperation, input: unknown, session = admin) =>
    mutateAdminWork(session, operation, input, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const draft = () => ({
    operation: 'task-create' as const,
    task_id: null,
    step_id: null,
    version: null,
    submission: randomUUID(),
    values: {
      matter_id: null,
      task_created_date: null,
      required_work: 'TEST ONLY administrative work',
    },
  });
  const state = () => inspect(adminEditState);
  const direct = (input: unknown, session = admin) =>
    runtime.$transaction(async (tx) => {
      await setHumanAuditContext(tx, Number(session.user.id), createMaintenanceAuditMetadata());
      return tx.$queryRawUnsafe(
        'SELECT public.admin_edit_save($1::integer,$2::integer,$3::text,$4::timestamptz,$5::jsonb)',
        Number(session.user.id),
        session.user.sessionVersion,
        session.user.role,
        session.expires,
        JSON.stringify(input),
      );
    });
  const deniedBefore = await state();
  for (const op of ['task-create', 'task-update', 'step-create', 'step-update'] as const) {
    await assert.rejects(run(op, draft(), lawyer));
    await assert.rejects(
      readAdminMutation(
        lawyer,
        op,
        op === 'task-create' ? null : 1,
        op === 'step-update' ? 1 : null,
        runtime,
      ),
    );
  }
  for (const session of [
    null,
    { ...admin, expires: '2000-01-01T00:00:00Z' },
    { ...admin, user: { ...admin.user, sessionVersion: admin.user.sessionVersion + 1 } },
    { ...admin, user: { ...admin.user, role: 'Paralegal' as const } },
  ])
    await assert.rejects(run('task-create', draft(), session!));
  for (const values of [
    { required_work: 'x' },
    { matter_id: null, task_created_date: null, required_work: ' ' },
    { matter_id: null, task_created_date: null, required_work: '\uFEFF\u2000\u00a0' },
    { matter_id: null, task_created_date: null, required_work: 'x', next_appointment: null },
    { matter_id: null, task_created_date: '2026-02-29', required_work: 'x' },
    { matter_id: null, task_created_date: null, required_work: 'x'.repeat(10001) },
    { matter_id: null, task_created_date: null, required_work: 'x', legacy_id: 3 },
    { matter_id: 0, task_created_date: null, required_work: 'x' },
    {
      matter_id: null,
      task_created_date: null,
      required_work: 'TEST ONLY',
      status: 'x'.repeat(161),
    },
    {
      matter_id: null,
      task_created_date: null,
      required_work: 'TEST ONLY',
      status: '😀'.repeat(81),
    },
  ]) {
    const request = { ...draft(), values };
    assert.throws(() => parseAdminMutationInput('task-create', request));
    await assert.rejects(direct(request));
  }
  for (const extra of [{ actor: 1 }, { source_ordinal: 1 }, { id: 1 }]) {
    assert.throws(() => parseAdminMutationInput('task-create', { ...draft(), ...extra }));
    await assert.rejects(direct({ ...draft(), ...extra }));
  }
  const duplicateForm = new FormData();
  duplicateForm.set('payload', '{"operation":"task-create","operation":"task-create"}');
  assert.throws(() => parseAdminMutationForm('task-create', duplicateForm));
  for (const table of ['admin_tasks', 'task_actions'])
    for (const sql of [
      `INSERT INTO ${table}(id) VALUES(999999)`,
      `UPDATE ${table} SET result=result WHERE false`,
      `DELETE FROM ${table} WHERE false`,
      `TRUNCATE ${table}`,
      `SELECT nextval('${table}_id_seq')`,
    ])
      await assert.rejects(runtime.$executeRawUnsafe(sql));
  await assert.rejects(
    runtime.$queryRawUnsafe(
      "SELECT _migration.admin_edit_require_account(1,1,'Administrator',now(),false)",
    ),
  );
  assert.deepEqual(await state(), deniedBefore);
  pass('Role/session/strict input and direct runtime bypass refusals preserve complete state');
  const choices = await readAdminMutation(admin, 'task-create', null, null, runtime);
  const person = choices.people.find((p) => p.active)!,
    court = choices.courts.find((p) => p.active)!,
    destination = choices.destinations.find((p) => p.active)!;
  const createdIds: number[] = [];
  for (const writer of writers) {
    const request = {
      ...draft(),
      values: {
        ...draft().values,
        required_work: 'TEST ONLY ' + writer.user.role + '\r\nأحمد ١٢ JTI 140J 140ق',
        assigned_to_person_id: person.id,
        task_created_date: '2024-02-29',
        execution_date: '2024-01-01',
        result: 'TEST ONLY result',
        previous_decision: 'TEST ONLY previous',
        last_followup: 'TEST ONLY\r\nfull\nfollow up',
        deadline: null,
        court_id: court.id,
        circuit: 'TEST ONLY circuit',
        destination_id: destination.id,
        status: 'TEST ONLY status',
        alert: 'TEST ONLY alert',
      },
    };
    let created = await run('task-create', request, writer);
    createdIds.push(created.id);
    const beforeRetry = await state();
    assert.deepEqual(await run('task-create', request, writer), created);
    assert.deepEqual(await state(), beforeRetry);
    await assert.rejects(
      run('task-create', { ...request, values: { ...request.values, result: 'changed' } }, writer),
    );
    await assert.rejects(run('task-create', request, writer === admin ? writers[1]! : admin));
    assert.deepEqual(await state(), beforeRetry);
    const snapshot = await readAdminMutation(writer, 'task-update', created.id, null, runtime);
    for (const [key, value] of Object.entries(request.values))
      assert.equal(snapshot.task!.values[key], value);
    const edit = {
      operation: 'task-update' as const,
      task_id: created.id,
      step_id: null,
      version: created.version,
      submission: randomUUID(),
      values: { ...request.values },
    };
    delete (edit.values as Record<string, unknown>).matter_id;
    assert.equal((await run('task-update', edit, writer)).changed, false);
    assert.deepEqual(await state(), beforeRetry);
    created = await run(
      'task-update',
      {
        ...edit,
        submission: randomUUID(),
        values: {
          result: null,
          assigned_to_person_id: null,
          court_id: null,
          destination_id: null,
          execution_date: null,
          deadline: '2023-01-01',
          status: '',
          alert: null,
        },
      },
      writer,
    );
    const stepRequest = {
      operation: 'step-create' as const,
      task_id: created.id,
      step_id: null,
      version: created.version,
      submission: randomUUID(),
      values: {
        action_date: '2020-02-29',
        performed_by_person_id: person.id,
        result: 'TEST ONLY step\r\nأحمد',
        report: 'TEST ONLY report',
      },
    };
    const step = await run('step-create', stepRequest, writer);
    assert.ok(step.stepId);
    const stepSnapshot = await readAdminMutation(
      writer,
      'step-update',
      created.id,
      step.stepId,
      runtime,
    );
    for (const [key, value] of Object.entries(stepRequest.values))
      assert.equal(stepSnapshot.step!.values[key], value);
    const repeat = await state();
    assert.deepEqual(await run('step-create', stepRequest, writer), step);
    assert.deepEqual(await state(), repeat);
    const noop = {
      operation: 'step-update' as const,
      task_id: created.id,
      step_id: step.stepId,
      version: step.version,
      submission: randomUUID(),
      values: stepRequest.values,
    };
    assert.equal((await run('step-update', noop, writer)).changed, false);
    assert.deepEqual(await state(), repeat);
    await assert.rejects(
      run('step-update', {
        ...noop,
        submission: randomUUID(),
        values: { result: null, report: ' ' },
      }),
    );
    await assert.rejects(
      run('step-update', { ...noop, submission: randomUUID(), values: { task_id: created.id } }),
    );
    assert.deepEqual(await state(), repeat);
    const changed = await run(
      'step-update',
      {
        ...noop,
        submission: randomUUID(),
        values: {
          action_date: null,
          performed_by_person_id: null,
          result: null,
          report: 'TEST ONLY changed report',
        },
      },
      writer,
    );
    await assert.rejects(
      run('task-update', { ...edit, submission: randomUUID(), values: { result: 'STALE' } }),
    );
    assert.equal(changed.version, String(BigInt(step.version) + 1n));
  }
  pass(
    'All three roles create/edit both types; every field, NULL/date/multiline, no-op and owned exact retry',
    { roles: writers.map((s) => s.user.role), createdIds },
  );
  const id = createdIds[0]!,
    editState = await readAdminMutation(admin, 'task-update', id, null, runtime);
  const base = {
    operation: 'task-update' as const,
    task_id: id,
    step_id: null,
    version: editState.task!.version,
    submission: randomUUID(),
    values: { result: 'TEST ONLY changed' },
  };
  const negativeBefore = await state();
  for (const values of [
    { required_work: null },
    { required_work: '\t\n' },
    { required_work: '\uFEFF\u2000\u00a0' },
    { matter_id: null },
    { assigned_to_person_id: 2147483647 },
    { court_id: 2147483647 },
    { destination_id: 2147483647 },
  ]) {
    await assert.rejects(run('task-update', { ...base, values }));
    await assert.rejects(direct({ ...base, values }));
  }
  const former = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id FROM people WHERE NOT is_active OR NOT is_staff ORDER BY id LIMIT 1',
        )
      ).rows[0].id,
  );
  await assert.rejects(run('task-update', { ...base, values: { assigned_to_person_id: former } }));
  const foreignStep = await inspect(
    async (db) =>
      (await db.query('SELECT id FROM task_actions WHERE task_id<>$1 ORDER BY id LIMIT 1', [id]))
        .rows[0].id,
  );
  await assert.rejects(
    run('step-update', { ...base, operation: 'step-update', step_id: foreignStep }),
  );
  await assert.rejects(run('step-create', { ...base, operation: 'step-create', task_id: null }));
  assert.deepEqual(await state(), negativeBefore);
  pass('Completeness, unknown/ineligible selections, immutable parent and foreign-step refusal');
  const legacy = await inspect(
    async (db) =>
      (
        await db.query(
          `SELECT a.id FROM admin_tasks a LEFT JOIN matters m ON m.id=a.matter_id WHERE a.legacy_id IS NOT NULL AND coalesce(a.required_work,'') !~ '[^[:space:]]' AND NOT coalesce(m.is_archived,false) ORDER BY a.id LIMIT 1`,
        )
      ).rows[0],
  );
  assert.ok(legacy, 'measured legacy missing description');
  const old = await readAdminMutation(admin, 'task-update', legacy.id, null, runtime),
    beforeLegacy = await state();
  assert.equal(
    (
      await run('task-update', {
        ...base,
        task_id: legacy.id,
        version: old.task!.version,
        values: {},
      })
    ).changed,
    false,
  );
  assert.deepEqual(await state(), beforeLegacy);
  await run('task-update', {
    ...base,
    task_id: legacy.id,
    version: old.task!.version,
    submission: randomUUID(),
    values: { alert: 'TEST ONLY unrelated' },
  });
  const afterLegacy = await readAdminMutation(admin, 'task-update', legacy.id, null, runtime);
  assert.equal(afterLegacy.task!.values.required_work, old.task!.values.required_work);
  pass('Legacy missing description survives unchanged and unrelated saves', { id: legacy.id });
  const parent = choices.matters.find((m) => m.active)!.id,
    linked = await run('task-create', {
      ...draft(),
      values: { ...draft().values, matter_id: parent },
    });
  await setHearingParentArchive(fixture, parent, true);
  const archivedBefore = await state();
  await assert.rejects(
    run('task-create', { ...draft(), values: { ...draft().values, matter_id: parent } }),
  );
  await assert.rejects(
    run('task-update', { ...base, task_id: linked.id, version: linked.version }),
  );
  await assert.rejects(
    run('step-create', {
      ...base,
      operation: 'step-create',
      task_id: linked.id,
      version: linked.version,
      values: { result: 'TEST ONLY blocked' },
    }),
  );
  assert.deepEqual(await state(), archivedBefore);
  for (const s of sessions) assert.ok(await readAdminWork(s, String(linked.id), '1', runtime));
  await setHearingParentArchive(fixture, parent, false);
  pass('Archived matter blocks creation/task/step save, preserving four-role reads');
  // Native append after recorded imported order; date edits do not move a step.
  const originalId = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT task_id FROM task_actions GROUP BY task_id HAVING count(*)>5 ORDER BY task_id LIMIT 1',
        )
      ).rows[0].task_id,
  );
  const originalOrder = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,source_ordinal FROM task_actions WHERE task_id=$1 ORDER BY source_ordinal NULLS LAST,id',
          [originalId],
        )
      ).rows,
  );
  let version = (await readAdminMutation(admin, 'task-update', originalId, null, runtime)).task!
    .version;
  const appended: number[] = [];
  for (let n = 0; n < 3; n++) {
    const r = await run('step-create', {
      operation: 'step-create',
      task_id: originalId,
      step_id: null,
      version,
      submission: randomUUID(),
      values: { result: 'TEST ONLY append ' + n, action_date: '1900-01-01' },
    });
    version = r.version;
    appended.push(r.stepId!);
  }
  const allSteps = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,source_ordinal,current_order,next_appointment,legacy_id FROM task_actions WHERE task_id=$1 ORDER BY (current_order IS NOT NULL),source_ordinal NULLS LAST,current_order,id',
          [originalId],
        )
      ).rows,
  );
  assert.deepEqual(
    allSteps.map((r) => r.id),
    [...originalOrder.map((r) => r.id), ...appended],
  );
  const displayIds: number[] = [];
  let displayPage = 1,
    displayPages = 1;
  do {
    const display = await readAdminWork(admin, String(originalId), String(displayPage), runtime);
    assert.ok(display);
    displayIds.push(...display.steps.map((s) => s.id));
    displayPages = display.stepPages;
    displayPage++;
  } while (displayPage <= displayPages);
  assert.deepEqual(
    displayIds,
    [...originalOrder.map((r) => r.id), ...appended],
    'Production paged reader follows the independently captured original order and append results',
  );
  for (const r of allSteps.filter((r) => appended.includes(r.id))) {
    assert.equal(r.source_ordinal, null);
    assert.equal(r.legacy_id, null);
    assert.equal(r.next_appointment, null);
  }
  await run('step-update', {
    operation: 'step-update',
    task_id: originalId,
    step_id: originalOrder[0]!.id,
    version,
    submission: randomUUID(),
    values: { action_date: '2099-01-01' },
  });
  assert.deepEqual(
    await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT id,source_ordinal FROM task_actions WHERE task_id=$1 AND legacy_id IS NOT NULL ORDER BY source_ordinal NULLS LAST,id',
            [originalId],
          )
        ).rows,
    ),
    originalOrder,
  );
  pass(
    'Imported ordinals retained, native steps append in stable separate order, dates never reorder',
  );
  for (const s of sessions) {
    const list = await readAdminWorks(s, {}, runtime);
    assert.equal(list.total, 3694 + createdIds.length + 1);
    assert.ok(await readAdminWork(s, String(id), '1', runtime));
  }
  await inspect((db) => assertAdminEditBoundary(db, 'historical-full-state-upgrade'));
  pass(
    'All four roles read real/native volumes; original source and current-history invariants pass',
  );
  return { createdId: id, linkedId: linked.id, originalId };
}
