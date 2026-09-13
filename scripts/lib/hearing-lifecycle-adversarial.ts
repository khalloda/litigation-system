import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateHearing, readHearingMutation } from '../../src/lib/hearing-mutations';
import {
  mutateHearingLifecycle,
  readHearingLifecycle,
  type HearingLifecycleAction,
} from '../../src/lib/hearing-lifecycle';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { assertHearingLifecycleBoundary } from './hearing-lifecycle-checkpoint';
import { setHearingParentArchive } from '../test-hearing-read-only';

export async function proveHearingLifecycleAdversarial(
  fixture: IsolatedPostgres,
  id: number,
  pass: (name: string, details?: unknown) => void,
  runtime: PrismaClient,
) {
  const inspect = <T>(f: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return f(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  try {
    const sessions = await lifecycleSessions(runtime),
      admin = sessions.find((s) => s.user.role === 'Administrator')!,
      other = sessions.find((s) => s.user.username !== 'KHelmy')!;
    const dep = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
    const request = async (identity: number, action: HearingLifecycleAction) => {
      const s = await readHearingLifecycle(admin, action, identity, runtime);
      return {
        id: identity,
        confirmation: identity,
        version: s.version,
        action,
        facts: s.facts,
        submission: randomUUID(),
      };
    };
    const actorArgs = (s = admin) => [
      Number(s.user.id),
      s.user.sessionVersion,
      s.user.role,
      s.expires,
    ];
    const context = async (db: ClientBase, s = admin) => {
      await db.query('SELECT audit_set_human_context($1)', [Number(s.user.id)]);
      await db.query(
        "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY lifecycle adversarial','system')",
        [randomUUID(), randomUUID(), randomUUID()],
      );
    };
    const direct = (db: ClientBase, v: unknown, s = admin) =>
      db.query('SELECT hearing_lifecycle_save($1,$2,$3,$4,$5::jsonb)', [
        ...actorArgs(s),
        JSON.stringify(v),
      ]);
    const rolled = async (f: (db: ClientBase) => Promise<void>) =>
      inspect(async (db) => {
        await db.query('BEGIN');
        try {
          await context(db);
          await f(db);
        } finally {
          await db.query('ROLLBACK');
        }
      });
    const archive = await request(id, 'archive');
    await mutateHearingLifecycle(admin, 'archive', archive, dep);
    // Promote a non-owner account only within the rollback transaction. A valid
    // positive control precedes each authorization or receipt negative.
    for (const change of [
      'is_enabled=false',
      'must_change_password=true',
      "role_code='Lawyer'",
      'session_version=session_version+1',
      'receipt',
    ]) {
      await rolled(async (db) => {
        const promoted = (
          await db.query(
            "UPDATE user_accounts SET role_code='Administrator',session_version=session_version+1 WHERE id=$1 AND username<>'KHelmy' RETURNING session_version",
            [Number(other.user.id)],
          )
        ).rows;
        assert.equal(promoted.length, 1);
        const actor = {
          ...other,
          user: {
            ...other.user,
            role: 'Administrator' as const,
            sessionVersion: promoted[0].session_version,
          },
        };
        const valid = (
          await db.query('SELECT hearing_lifecycle_state($1,$2,$3,$4,$5) state', [
            ...actorArgs(actor),
            id,
          ])
        ).rows[0].state;
        assert.equal(valid.id, id);
        if (change === 'receipt') {
          await context(db, actor);
          await assert.rejects(direct(db, archive, actor), /belongs to another actor/u);
        } else {
          await db.query(
            'UPDATE user_accounts SET ' +
              change +
              (change.startsWith('session_version') ? '' : ',session_version=session_version+1') +
              ' WHERE id=$1',
            [Number(other.user.id)],
          );
          await context(db, actor);
          await assert.rejects(direct(db, archive, actor), /authorized hearing session/u);
        }
      });
    }
    pass(
      'Positive-control non-KHelmy Administrator denies disabled/forced/role/revoked receipt reuse and another actor token',
    );
    for (const sql of [
      'UPDATE hearings SET row_version=row_version+1,notes=notes WHERE id=$1',
      'INSERT INTO hearing_attendees(id,hearing_id,person_id,current_order) SELECT 2147483600,$1,id,1000 FROM people WHERE is_staff AND is_active LIMIT 1',
      'UPDATE hearing_attendees SET is_retired=NOT is_retired WHERE hearing_id=$1',
    ])
      await rolled(async (db) => {
        await assert.rejects(db.query(sql, [id]), /Restore archived hearing before editing/u);
      });
    await mutateHearingLifecycle(admin, 'restore', await request(id, 'restore'), dep);
    pass('Archived hearing and attendance row guards refuse direct owner-attributed writes');
    // Missing receipt/history and altered new snapshot shape must be detected even
    // after an owner tamper test re-enables the immutable trigger.
    for (const sql of [
      `ALTER TABLE _migration.hearing_edit_submission DISABLE TRIGGER immutable_rows; DELETE FROM _migration.hearing_edit_submission WHERE hearing_id=${id} AND request_payload->>'action'='archive'; ALTER TABLE _migration.hearing_edit_submission ENABLE TRIGGER immutable_rows`,
      `ALTER TABLE _migration.hearing_edit_change DISABLE TRIGGER immutable_rows; UPDATE _migration.hearing_edit_change SET after_values=after_values#-'{hearing,is_archived}' WHERE hearing_id=${id}; ALTER TABLE _migration.hearing_edit_change ENABLE TRIGGER immutable_rows`,
      `ALTER TABLE _migration.hearing_edit_import DISABLE TRIGGER immutable_rows; UPDATE _migration.hearing_edit_import SET initial_values=initial_values||'{"is_archived":true}'::jsonb WHERE entity_table='hearings' AND id=(SELECT min(id) FROM _migration.hearing_edit_import WHERE entity_table='hearings'); ALTER TABLE _migration.hearing_edit_import ENABLE TRIGGER immutable_rows`,
    ])
      await rolled(async (db) => {
        await db.query(sql);
        await assert.rejects(assertHearingLifecycleBoundary(db));
      });
    pass(
      'Continuous checker detects missing lifecycle receipts, removed current archive history and altered import snapshot',
    );
    const parent = (
      await inspect(
        async (db) =>
          (await db.query('SELECT id FROM matters WHERE NOT is_archived ORDER BY id LIMIT 1')).rows,
      )
    )[0].id;
    const linked = await mutateHearing(
      admin,
      'create',
      {
        id: null,
        version: null,
        submission: randomUUID(),
        values: { matter_id: parent, hearing_date: '2026-09-13' },
        attendees: [],
      },
      dep,
    );
    async function waitBlocked(db: ClientBase) {
      for (let i = 0; i < 200; i++) {
        await db.query('SELECT pg_stat_clear_snapshot()');
        if (
          (
            await db.query(
              "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%hearing_%'",
            )
          ).rows[0].n
        )
          return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw Error('Expected owned gateway lock overlap absent');
    }
    for (const action of ['edit', 'archive', 'restore'] as const) {
      if (action === 'restore')
        await mutateHearingLifecycle(admin, 'archive', await request(linked.id, 'archive'), dep);
      const life = await request(linked.id, action === 'restore' ? 'restore' : 'archive');
      await inspect(async (db) => {
        await db.query('BEGIN');
        await context(db);
        await db.query('SELECT id FROM matters WHERE id=$1 FOR UPDATE', [parent]);
        const state = (
          await db.query('SELECT matter_lifecycle_state($1,$2,$3,$4,$5) state', [
            ...actorArgs(),
            parent,
          ])
        ).rows[0].state;
        const pending = Promise.allSettled([
          action === 'edit'
            ? mutateHearing(
                admin,
                'update',
                {
                  id: linked.id,
                  version: life.version,
                  submission: randomUUID(),
                  values: { decision: 'TEST ONLY parent race' },
                },
                dep,
              )
            : mutateHearingLifecycle(admin, action, life, dep),
        ]);
        try {
          await waitBlocked(db);
          await db.query('SELECT matter_lifecycle_save($1,$2,$3,$4,$5::jsonb)', [
            ...actorArgs(),
            JSON.stringify({
              id: parent,
              confirmation: parent,
              version: state.version,
              counts: state.counts,
              action: 'archive',
              submission: randomUUID(),
            }),
          ]);
          await db.query('COMMIT');
        } finally {
          await db.query('ROLLBACK');
          assert.equal((await pending)[0]!.status, 'rejected');
        }
      });
      await setHearingParentArchive(fixture, parent, false);
      if (action === 'restore')
        await mutateHearingLifecycle(admin, 'restore', await request(linked.id, 'restore'), dep);
    }
    pass(
      'Observed parent lock overlap: matter archive wins against hearing edit, archive and restore without deadlock',
    );
    const state = await readHearingMutation(admin, 'update', linked.id, runtime);
    const editRequest = {
      id: linked.id,
      version: state.record!.version,
      submission: randomUUID(),
      values: { notes: 'TEST ONLY accepted edit receipt' },
    };
    const result = await mutateHearing(admin, 'update', editRequest, dep);
    await mutateHearingLifecycle(admin, 'archive', await request(linked.id, 'archive'), dep);
    assert.deepEqual(await mutateHearing(admin, 'update', editRequest, dep), result);
    assert.equal((await readHearingLifecycle(admin, 'restore', linked.id, runtime)).archived, true);
    await mutateHearingLifecycle(admin, 'restore', await request(linked.id, 'restore'), dep);
    pass(
      'Previously committed Phase2 edit retry acknowledges its receipt after archive without unarchiving',
    );
  } finally {
    // Caller owns the shared fixture client.
  }
}
