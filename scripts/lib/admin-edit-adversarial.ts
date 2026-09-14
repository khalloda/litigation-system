import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateAdminWork, readAdminMutation } from '../../src/lib/admin-work-mutations';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { adminEditState } from './admin-edit-state';
import { setFixtureStaffActive } from './staff-roster-test-adapter';
import { setHearingParentArchive } from '../test-hearing-read-only';
import { setMatterClientArchive } from '../test-matter-read-only';
import { assertAdminEditBoundary } from './admin-edit-checkpoint';
import type { AdminValues } from '../../src/lib/admin-work-mutation-input';
import { AdminMutationError } from '../../src/lib/admin-work-mutation-input';

export async function proveAdminAdversarial(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  id: number,
  pass: (name: string, details?: unknown) => void,
) {
  const inspect = <T>(fn: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return fn(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const sessions = await lifecycleSessions(runtime),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  const context = async (db: ClientBase) => {
    await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
    await db.query(
      "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY administrative adversarial proof','system')",
      [randomUUID(), randomUUID(), randomUUID()],
    );
  };
  const edit = async () => ({
    operation: 'task-update' as const,
    task_id: id,
    step_id: null,
    version: (await readAdminMutation(admin, 'task-update', id, null, runtime)).task!.version,
    submission: randomUUID(),
    values: { result: 'TEST ONLY concurrent save' } as AdminValues,
  });
  const run = (request: Awaited<ReturnType<typeof edit>>, actor = admin) =>
    mutateAdminWork(actor, request.operation, request, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const direct = async (db: ClientBase, request: unknown) =>
    db.query('SELECT public.admin_edit_save($1,$2,$3,$4,$5::jsonb)', [
      Number(admin.user.id),
      admin.user.sessionVersion,
      admin.user.role,
      admin.expires,
      JSON.stringify(request),
    ]);
  async function blocked(db: ClientBase) {
    for (let n = 0; n < 250; n++) {
      await db.query('SELECT pg_stat_clear_snapshot()');
      if (
        (
          await db.query(
            "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%public.admin_edit_save(%'",
          )
        ).rows[0].n
      )
        return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error('Administrative gateway lock overlap not observed');
  }
  const state = () => inspect(adminEditState);
  const refusal = async (pending: Promise<PromiseSettledResult<unknown>[]>, code: string) => {
    const outcome = (await pending)[0]!;
    assert.equal(outcome.status, 'rejected');
    if (outcome.status === 'rejected') {
      assert.ok(outcome.reason instanceof AdminMutationError, String(outcome.reason));
      assert.equal(outcome.reason.code, code);
    }
  };
  const authorityBefore = await state();
  for (const change of [
    'is_enabled=false',
    'must_change_password=true',
    "role_code='Lawyer'",
    'session_version=session_version+1',
  ]) {
    const request = await edit();
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await context(db);
        await db.query(
          'UPDATE user_accounts SET ' +
            change +
            (change.startsWith('session_version') ? '' : ',session_version=session_version+1') +
            ' WHERE id=$1',
          [Number(assistant.user.id)],
        );
        const version = (
          await db.query('SELECT session_version FROM user_accounts WHERE id=$1', [
            Number(assistant.user.id),
          ])
        ).rows[0].session_version;
        await assert.rejects(
          db.query('SELECT public.admin_edit_save($1,$2,$3,$4,$5::jsonb)', [
            Number(assistant.user.id),
            change.startsWith('session_version') ? assistant.user.sessionVersion : version,
            assistant.user.role,
            assistant.expires,
            JSON.stringify(request),
          ]),
          /authorized administrative work session/u,
        );
      } finally {
        await db.query('ROLLBACK');
      }
    });
  }
  await inspect(async (db) => {
    await db.query('BEGIN');
    try {
      await context(db);
      await assert.rejects(
        db.query('SELECT public.admin_edit_save($1,$2,$3,$4,$5::jsonb)', [
          Number(assistant.user.id),
          assistant.user.sessionVersion,
          assistant.user.role,
          assistant.expires,
          JSON.stringify(await edit()),
        ]),
        /trusted audit context/u,
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });
  assert.deepEqual(await state(), authorityBefore);
  pass(
    'Disabled, must-change, role/version and mismatched audit actor refused at committing gateway',
  );
  // Hold the gateway's first lock before the task row: preserve production lock order.
  const request = await edit();
  await inspect(async (db) => {
    await db.query('BEGIN');
    await context(db);
    await db.query(
      'SELECT singleton FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE',
    );
    await db.query('SELECT id FROM admin_tasks WHERE id=$1 FOR UPDATE', [id]);
    const pending = Promise.allSettled([
      run({ ...request, submission: randomUUID(), values: { result: 'TEST ONLY loser' } }),
    ]);
    try {
      await blocked(db);
      await direct(db, request);
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      await refusal(pending, 'stale');
    }
  });
  pass(
    'Observed gateway-lock and held task-row overlap: first committed version wins, stale task save refused',
  );
  const step = await inspect(
    async (db) =>
      (await db.query('SELECT id FROM task_actions WHERE task_id=$1 ORDER BY id LIMIT 1', [id]))
        .rows[0],
  );
  assert.ok(step);
  const taskRequest = await edit();
  await inspect(async (db) => {
    await db.query('BEGIN');
    await context(db);
    await db.query(
      'SELECT singleton FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE',
    );
    await db.query('SELECT id FROM admin_tasks WHERE id=$1 FOR UPDATE', [id]);
    const pending = Promise.allSettled([
      mutateAdminWork(
        admin,
        'step-update',
        {
          ...taskRequest,
          submission: randomUUID(),
          operation: 'step-update',
          step_id: step.id,
          values: { report: 'TEST ONLY stale step' },
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      ),
    ]);
    try {
      await blocked(db);
      await direct(db, { ...taskRequest, values: { result: 'TEST ONLY task wins over step' } });
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      await refusal(pending, 'stale');
    }
  });
  pass('Observed aggregate overlap: task commit invalidates pending step edit');
  const revokeRequest = await edit();
  await inspect(async (db) => {
    await db.query('BEGIN');
    await context(db);
    await db.query(
      'SELECT singleton FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE',
    );
    await db.query('SELECT id FROM user_accounts WHERE id=$1 FOR UPDATE', [
      Number(assistant.user.id),
    ]);
    const pending = Promise.allSettled([run(revokeRequest, assistant)]);
    try {
      await blocked(db);
      await db.query('UPDATE user_accounts SET session_version=session_version+1 WHERE id=$1', [
        Number(assistant.user.id),
      ]);
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      await refusal(pending, 'session');
    }
  });
  assistant.user.sessionVersion = (
    await runtime.userAccount.findUniqueOrThrow({
      where: { id: Number(assistant.user.id) },
      select: { sessionVersion: true },
    })
  ).sessionVersion;
  pass('Observed gateway/account lock overlap: committed session revocation prevents pending save');
  const person = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT p.id FROM people p WHERE p.is_staff AND p.is_active AND NOT p.can_login AND NOT EXISTS(SELECT 1 FROM lookup_team t WHERE t.reviewer_id=p.id) ORDER BY p.id LIMIT 1',
        )
      ).rows[0],
  );
  assert.ok(person);
  await run({ ...(await edit()), values: { assigned_to_person_id: person.id } });
  const staffRequest = { ...(await edit()), values: { assigned_to_person_id: person.id } };
  // Clear first so reselection must recheck eligibility.
  await run({ ...staffRequest, values: { assigned_to_person_id: null } });
  staffRequest.version = (await edit()).version;
  staffRequest.submission = randomUUID();
  await inspect(async (db) => {
    await db.query('BEGIN');
    await context(db);
    await db.query(
      'SELECT singleton FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE',
    );
    const pending = Promise.allSettled([run(staffRequest)]);
    try {
      await blocked(db);
      await db.query(
        'SELECT staff_update_person(p.id,p.row_version,p.name_en,p.email,false,p.is_trainee,p.team_id) FROM people p WHERE p.id=$1',
        [person.id],
      );
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      await refusal(pending, 'invalid');
    }
  });
  await setFixtureStaffActive(runtime, Number(admin.user.id), person.id, true);
  pass('Login-independent staff accepted; observed staff deactivation blocks new assignment');
  const choices = await readAdminMutation(admin, 'task-update', id, null, runtime),
    court = choices.courts.find((c) => c.active)!;
  const lookupRequest = { ...(await edit()), values: { court_id: court.id } };
  await inspect(async (db) => {
    await db.query('BEGIN');
    await context(db);
    await db.query('SELECT id FROM lookup_court WHERE id=$1 FOR UPDATE', [court.id]);
    const pending = Promise.allSettled([run(lookupRequest)]);
    try {
      await blocked(db);
      await db.query('UPDATE lookup_court SET is_active=false WHERE id=$1', [court.id]);
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      await refusal(pending, 'invalid');
    }
  });
  await inspect(async (db) => {
    await db.query('BEGIN');
    try {
      await context(db);
      await db.query('UPDATE lookup_court SET is_active=true WHERE id=$1', [court.id]);
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
    }
  });
  pass('Observed lookup lock overlap: deactivated new court selection is refused');
  const destination = choices.destinations.find((c) => c.active)!;
  await run({
    ...(await edit()),
    values: {
      assigned_to_person_id: person.id,
      court_id: court.id,
      destination_id: destination.id,
    },
  });
  await mutateAdminWork(
    admin,
    'step-update',
    {
      ...(await edit()),
      operation: 'step-update',
      step_id: step.id,
      values: { performed_by_person_id: person.id },
    },
    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
  );
  const lookupActive = async (active: boolean) =>
    inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await context(db);
        await db.query('UPDATE lookup_court SET is_active=$1 WHERE id=$2', [active, court.id]);
        await db.query('UPDATE lookup_matter_destination SET is_active=$1 WHERE id=$2', [
          active,
          destination.id,
        ]);
        await db.query('COMMIT');
      } finally {
        await db.query('ROLLBACK');
      }
    });
  await setFixtureStaffActive(runtime, Number(admin.user.id), person.id, false);
  await lookupActive(false);
  try {
    const retained = await readAdminMutation(admin, 'task-update', id, null, runtime);
    assert.equal(retained.people.find((p) => p.id === person.id)?.active, false);
    assert.equal(retained.courts.find((p) => p.id === court.id)?.name, court.name);
    assert.equal(
      retained.destinations.find((p) => p.id === destination.id)?.name,
      destination.name,
    );
    const before = await state();
    const same = {
      ...(await edit()),
      values: {
        assigned_to_person_id: person.id,
        court_id: court.id,
        destination_id: destination.id,
      },
    };
    assert.equal((await run(same)).changed, false);
    assert.deepEqual(await state(), before);
    await run({
      ...same,
      submission: randomUUID(),
      values: { ...same.values, result: 'TEST ONLY inactive values retained' },
    });
    await mutateAdminWork(
      admin,
      'step-update',
      {
        ...(await edit()),
        operation: 'step-update',
        step_id: step.id,
        values: { performed_by_person_id: person.id, action_date: '2098-02-28' },
      },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
    const after = await readAdminMutation(admin, 'step-update', id, step.id, runtime);
    assert.equal(after.task!.values.assigned_to_person_id, person.id);
    assert.equal(after.task!.values.court_id, court.id);
    assert.equal(after.task!.values.destination_id, destination.id);
    assert.equal(after.step!.values.performed_by_person_id, person.id);
  } finally {
    await lookupActive(true);
    await setFixtureStaffActive(runtime, Number(admin.user.id), person.id, true);
  }
  pass(
    'Inactive person/court/destination labels and references survive exact no-op and unrelated task/step edits',
  );
  await inspect(async (db) => {
    const before = await adminEditState(db);
    const original = { result: null, report: null, action_date: null };
    const validated = async (values: unknown) =>
      (
        await db.query(
          'SELECT _migration.admin_edit_validate_values($1::jsonb,$2::jsonb,false,true) patch',
          [JSON.stringify(values), JSON.stringify(original)],
        )
      ).rows[0].patch;
    assert.deepEqual(await validated({ result: null, report: null }), {});
    assert.deepEqual(await validated({ action_date: '2097-02-28' }), { action_date: '2097-02-28' });
    await assert.rejects(validated({ result: '  ', report: null }), /Meaningful step/u);
    await assert.rejects(
      validated({ result: '\uFEFF\u2000\u00a0', report: null }),
      /Meaningful step/u,
    );
    assert.deepEqual(await adminEditState(db), before);
  });
  pass(
    'Incomplete-step scalar fixture: unchanged pair and unrelated date accepted, explicit blank refused; source has zero such steps',
  );
  const matter = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,client_id FROM matters WHERE client_id IS NOT NULL AND NOT is_archived ORDER BY id LIMIT 1',
        )
      ).rows[0],
  );
  await inspect(async (db) => {
    await db.query('BEGIN');
    await context(db);
    await db.query('SELECT id FROM matters WHERE id=$1 FOR UPDATE', [matter.id]);
    const actor = [
      Number(admin.user.id),
      admin.user.sessionVersion,
      admin.user.role,
      admin.expires,
    ];
    const lifecycle = (
      await db.query('SELECT public.matter_lifecycle_state($1,$2,$3,$4,$5) state', [
        ...actor,
        matter.id,
      ])
    ).rows[0].state;
    const pending = Promise.allSettled([
      mutateAdminWork(
        admin,
        'task-create',
        {
          operation: 'task-create',
          task_id: null,
          step_id: null,
          version: null,
          submission: randomUUID(),
          values: {
            matter_id: matter.id,
            task_created_date: null,
            required_work: 'TEST ONLY parent race',
          },
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      ),
    ]);
    try {
      await blocked(db);
      await db.query('SELECT public.matter_lifecycle_save($1,$2,$3,$4,$5::jsonb)', [
        ...actor,
        JSON.stringify({
          id: matter.id,
          confirmation: matter.id,
          action: 'archive',
          version: lifecycle.version,
          counts: lifecycle.counts,
          submission: randomUUID(),
        }),
      ]);
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      await refusal(pending, 'archived');
    }
  });
  await setHearingParentArchive(fixture, matter.id, false);
  pass('Observed matter-row overlap: archived parent refuses pending creation');
  await setMatterClientArchive(fixture, matter.client_id, true);
  try {
    const child = await mutateAdminWork(
      admin,
      'task-create',
      {
        operation: 'task-create',
        task_id: null,
        step_id: null,
        version: null,
        submission: randomUUID(),
        values: {
          matter_id: matter.id,
          task_created_date: null,
          required_work: 'TEST ONLY archived client',
        },
      },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
    assert.ok(child.id);
  } finally {
    await setMatterClientArchive(fixture, matter.client_id, false);
  }
  pass('Archived client does not block a task beneath its unarchived matter');
  await inspect((db) =>
    db.query(
      "CREATE FUNCTION public.task44_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY audit failure'; END $$; CREATE TRIGGER task44_fixture_fail BEFORE INSERT ON audit_events FOR EACH ROW WHEN(NEW.entity_table IN('admin_tasks','task_actions')) EXECUTE FUNCTION public.task44_fixture_fail()",
    ),
  );
  try {
    const before = await state();
    await assert.rejects(run({ ...(await edit()), values: { result: 'TEST ONLY rollback' } }));
    assert.deepEqual(await state(), before);
    await assert.rejects(
      mutateAdminWork(
        admin,
        'task-create',
        {
          operation: 'task-create',
          task_id: null,
          step_id: null,
          version: null,
          submission: randomUUID(),
          values: {
            matter_id: null,
            task_created_date: null,
            required_work: 'TEST ONLY failed insert',
          },
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      ),
    );
    const after = await state();
    assert.deepEqual(after.tables, before.tables);
    assert.equal(after.catalogDigest, before.catalogDigest);
    const changed = after.sequences.filter(
      (s, i) => JSON.stringify(s) !== JSON.stringify(before.sequences[i]),
    );
    assert.ok(changed.length > 0);
    assert.ok(changed.every((s) => s.sequencename === 'admin_tasks_id_seq'));
    pass(
      'Late audit failure rolls back update completely; failed insert consumes only its native ID sequence',
      {
        before: before.sequences.filter((s) => s.sequencename === 'admin_tasks_id_seq'),
        after: changed,
      },
    );
  } finally {
    await inspect((db) =>
      db.query(
        'DROP TRIGGER task44_fixture_fail ON audit_events; DROP FUNCTION public.task44_fixture_fail()',
      ),
    );
  }
  await inspect(async (db) => {
    const before = await adminEditState(db);
    for (const query of [
      'UPDATE _migration.admin_edit_import SET initial_values=initial_values||\'{"result":"TEST ONLY corruption"}\' WHERE entity_table=\'admin_tasks\'',
      'DELETE FROM _migration.admin_edit_change',
      'UPDATE task_actions SET source_ordinal=999 WHERE id=(SELECT min(id) FROM task_actions)',
      'UPDATE task_actions SET task_id=NULL WHERE id=(SELECT min(id) FROM task_actions)',
    ]) {
      await db.query('BEGIN');
      try {
        await context(db);
        await assert.rejects(db.query(query));
      } finally {
        await db.query('ROLLBACK');
      }
    }
    await db.query('BEGIN');
    try {
      await context(db);
      await db.query('UPDATE admin_tasks SET row_version=row_version+1,result=$1 WHERE id=$2', [
        'TEST ONLY no history',
        id,
      ]);
      await assert.rejects(db.query('SET CONSTRAINTS ALL IMMEDIATE'));
    } finally {
      await db.query('ROLLBACK');
    }
    assert.deepEqual(await adminEditState(db), before);
    await assertAdminEditBoundary(db, 'historical-full-state-upgrade');
    for (const removal of [
      'DROP INDEX public.task_actions_current_order_idx',
      'ALTER TABLE public.task_actions DROP CONSTRAINT task_actions_current_order_check',
    ]) {
      await db.query('BEGIN');
      try {
        await db.query(removal);
        await assert.rejects(assertAdminEditBoundary(db, 'historical-full-state-upgrade'));
      } finally {
        await db.query('ROLLBACK');
      }
    }
    assert.deepEqual(await adminEditState(db), before);
  });
  pass(
    'Immutable source/parent/ordinal and missing-history corruption refused without residual state',
  );
}
