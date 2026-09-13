import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../../src/generated/prisma/client';
import type { ClientBase } from 'pg';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { mutateHearing, readHearingMutation } from '../../src/lib/hearing-mutations';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { staffReadOnlyState } from './staff-read-only-state';
import { setMatterClientArchive } from '../test-matter-read-only';
import { setHearingParentArchive } from '../test-hearing-read-only';
import { setFixtureStaffActive } from './staff-roster-test-adapter';
export async function proveHearingAdversarial(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  admin: Session,
  assistant: Session,
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
  const run = (input: unknown, actor = admin) =>
    mutateHearing(actor, 'update', input, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const edit = async () => ({
    id,
    version: (await readHearingMutation(admin, 'update', id, runtime)).record!.version,
    submission: randomUUID(),
    values: {},
  });
  const context = async (db: ClientBase) => {
    await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
    await db.query(
      "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY hearing boundary proof','system')",
      [randomUUID(), randomUUID(), randomUUID()],
    );
  };
  const direct = async (db: ClientBase, request: unknown, actor = admin) =>
    db.query('SELECT public.hearing_edit_save($1,$2,$3,$4,$5::jsonb) result', [
      Number(actor.user.id),
      actor.user.sessionVersion,
      actor.user.role,
      actor.expires,
      JSON.stringify(request),
    ]);
  const current = await readHearingMutation(admin, 'update', id, runtime),
    base = await edit();
  const before = await inspect(staffReadOnlyState);
  const invalid = [
    { ...base, values: { matter_id: null } },
    { ...base, values: { report: true } },
    { ...base, values: { notes: 3 } },
    { ...base, values: { hearing_date: '2026-02-29' } },
    { ...base, values: { notes: 'x'.repeat(10001) } },
    { ...base, attendees: [{ id: 2147483647, person_id: 1 }] },
    { ...base, attendees: [current.attendees[0], current.attendees[0]] },
  ];
  for (const request of invalid)
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await context(db);
        await assert.rejects(direct(db, request));
      } finally {
        await db.query('ROLLBACK');
      }
    });
  for (const change of [
    'is_enabled=false',
    'must_change_password=true',
    "role_code='Lawyer'",
    'session_version=session_version+1',
  ]) {
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
          direct(db, base, {
            ...assistant,
            user: {
              ...assistant.user,
              sessionVersion: change.startsWith('session_version')
                ? assistant.user.sessionVersion
                : version,
            },
          }),
          /authorized hearing session/u,
        );
      } finally {
        await db.query('ROLLBACK');
      }
    });
  }
  assert.deepEqual(await inspect(staffReadOnlyState), before);
  pass(
    'Direct committing gateway rejects forged fields, foreign/duplicate members and stale/current account authority with exact rollback',
  );
  const unsuitable = await inspect(
    async (db) =>
      (await db.query('SELECT id FROM people WHERE NOT is_staff OR NOT is_active ORDER BY id'))
        .rows,
  );
  assert.ok(unsuitable.length);
  for (const person of unsuitable.slice(0, 2))
    await assert.rejects(
      run({
        ...(await edit()),
        attendees: [...current.attendees, { id: null, person_id: person.id }],
      }),
    );
  const inactive = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT a.hearing_id FROM hearing_attendees a JOIN people p ON p.id=a.person_id WHERE NOT a.is_retired AND NOT p.is_active ORDER BY a.hearing_id LIMIT 1',
        )
      ).rows[0],
  );
  assert.ok(inactive);
  const old = await readHearingMutation(admin, 'update', inactive.hearing_id, runtime);
  const membersBefore = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT to_jsonb(a) row FROM hearing_attendees a WHERE hearing_id=$1 ORDER BY id',
          [inactive.hearing_id],
        )
      ).rows,
  );
  await mutateHearing(
    admin,
    'update',
    {
      id: inactive.hearing_id,
      version: old.record!.version,
      submission: randomUUID(),
      values: { decision: 'TEST ONLY inactive member retained' },
      attendees: old.attendees,
    },
    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
  );
  assert.deepEqual(
    await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT to_jsonb(a) row FROM hearing_attendees a WHERE hearing_id=$1 ORDER BY id',
            [inactive.hearing_id],
          )
        ).rows,
    ),
    membersBefore,
  );
  pass(
    'Inactive internal member retained unchanged on unrelated save; unsuitable new members refused',
  );
  await inspect((db) =>
    db.query(
      "CREATE FUNCTION public.task43_fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY hearing audit failure'; END $$; CREATE TRIGGER task43_fixture_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN(NEW.entity_table='hearing_attendees') EXECUTE FUNCTION public.task43_fixture_audit_failure()",
    ),
  );
  try {
    const snapshot = await inspect(staffReadOnlyState);
    await assert.rejects(
      run({
        ...(await edit()),
        values: { notes: 'TEST ONLY rollback' },
        attendees: current.attendees.slice(1),
      }),
    );
    assert.deepEqual(await inspect(staffReadOnlyState), snapshot);
  } finally {
    await inspect((db) =>
      db.query(
        'DROP TRIGGER task43_fixture_audit_failure ON audit_events; DROP FUNCTION public.task43_fixture_audit_failure()',
      ),
    );
  }
  pass(
    'Late attendee audit failure rolls back hearing, membership, version, history, receipt and audit',
  );
  async function blocked(db: ClientBase) {
    for (let i = 0; i < 200; i++) {
      await db.query('SELECT pg_stat_clear_snapshot()');
      const n = (
        await db.query(
          "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%public.hearing_edit_save(%'",
        )
      ).rows[0].n;
      if (n) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error('Expected hearing gateway lock wait not observed');
  }
  const request = await edit();
  await inspect(async (db) => {
    await db.query('BEGIN');
    await context(db);
    await db.query('SELECT id FROM user_accounts WHERE id=$1 FOR UPDATE', [
      Number(assistant.user.id),
    ]);
    const pending = Promise.allSettled([
      run({ ...request, values: { notes: 'TEST ONLY revoked race' } }, assistant),
    ]);
    try {
      await blocked(db);
      await db.query('UPDATE user_accounts SET session_version=session_version+1 WHERE id=$1', [
        Number(assistant.user.id),
      ]);
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      assert.equal((await pending)[0]!.status, 'rejected');
    }
  });
  assistant.user.sessionVersion = (
    await runtime.userAccount.findUniqueOrThrow({
      where: { id: Number(assistant.user.id) },
      select: { sessionVersion: true },
    })
  ).sessionVersion;
  pass('Observed account-lock overlap: committed session revocation wins before hearing change');
  const nonlogin = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT p.id FROM people p WHERE p.is_staff AND p.is_active AND NOT p.can_login AND NOT EXISTS(SELECT 1 FROM hearing_attendees a WHERE a.hearing_id=$1 AND a.person_id=p.id) ORDER BY p.id LIMIT 1',
          [id],
        )
      ).rows[0],
  );
  assert.ok(nonlogin);
  const memberState = await readHearingMutation(admin, 'update', id, runtime);
  await run({
    ...(await edit()),
    attendees: [...memberState.attendees, { id: null, person_id: nonlogin.id }],
  });
  const withNonlogin = await readHearingMutation(admin, 'update', id, runtime);
  await run({
    ...(await edit()),
    attendees: withNonlogin.attendees.filter((a) => a.person_id !== nonlogin.id),
  });
  await inspect(async (db) => {
    await db.query('BEGIN');
    await context(db);
    await db.query(
      'SELECT singleton FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE',
    );
    const pending = Promise.allSettled([
      run({
        ...(await edit()),
        attendees: [...memberState.attendees, { id: null, person_id: nonlogin.id }],
      }),
    ]);
    try {
      await blocked(db);
      await db.query(
        'SELECT staff_update_person(p.id,p.row_version,p.name_en,p.email,false,p.is_trainee,p.team_id) FROM people p WHERE p.id=$1',
        [nonlogin.id],
      );
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      assert.equal((await pending)[0]!.status, 'rejected');
    }
  });
  await setFixtureStaffActive(runtime, Number(admin.user.id), nonlogin.id, true);
  pass(
    'Active staff without login accepted; observed staff deactivation overlap refuses reselection and preserves retained membership',
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
      mutateHearing(
        admin,
        'create',
        {
          id: null,
          version: null,
          submission: randomUUID(),
          values: { matter_id: matter.id, decision: 'TEST ONLY archive overlap' },
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
      assert.equal((await pending)[0]!.status, 'rejected');
    }
  });
  await setHearingParentArchive(fixture, matter.id, false);
  pass('Observed parent-row overlap: committed matter archive refuses pending hearing creation');
  await setMatterClientArchive(fixture, matter.client_id, true);
  try {
    const created = await mutateHearing(
      admin,
      'create',
      {
        id: null,
        version: null,
        submission: randomUUID(),
        values: { matter_id: matter.id, decision: 'TEST ONLY archived-client hearing' },
      },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
    assert.ok(created.id);
    await mutateHearing(
      assistant,
      'update',
      {
        id: created.id,
        version: created.version,
        submission: randomUUID(),
        values: { notes: 'TEST ONLY archived-client edit' },
      },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
  } finally {
    await setMatterClientArchive(fixture, matter.client_id, false);
  }
  pass(
    'Archived client permits an unarchived matter hearing creation and editing without parent side effects',
  );
}
