import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../../src/generated/prisma/client';
import type { ClientBase } from 'pg';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { mutateHearing, readHearingMutation } from '../../src/lib/hearing-mutations';
import { readHearing, readHearings } from '../../src/lib/hearing-query';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { staffReadOnlyState } from './staff-read-only-state';
export async function proveHearingRetention(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  sessions: Session[],
  id: number,
  pass: (name: string, details?: unknown) => void,
) {
  const admin = sessions.find((s) => s.user.role === 'Administrator')!;
  const inspect = <T>(fn: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return fn(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const run = (input: unknown) =>
    mutateHearing(admin, 'update', input, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const protectedRows = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,row_version::text version FROM hearings WHERE legacy_id=ANY($1::int[]) ORDER BY id',
          [[7072, 7071, 7237, 7383, 7451, 7073, 7070, 7219, 7351, 7129, 7159, 7382]],
        )
      ).rows,
  );
  assert.equal(protectedRows.length, 12);
  const before = await inspect(staffReadOnlyState);
  for (const row of protectedRows)
    for (const field of ['court_id', 'circuit', 'notes'])
      for (const value of [null, field === 'court_id' ? 1 : 'TEST ONLY protected refusal']) {
        const request = { ...row, submission: randomUUID(), values: { [field]: value } };
        await assert.rejects(run(request));
        await inspect(async (db) => {
          await db.query('BEGIN');
          try {
            await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
            await assert.rejects(
              db.query('SELECT public.hearing_edit_save($1,$2,$3,$4,$5::jsonb)', [
                Number(admin.user.id),
                admin.user.sessionVersion,
                admin.user.role,
                admin.expires,
                JSON.stringify(request),
              ]),
            );
          } finally {
            await db.query('ROLLBACK');
          }
        });
        await inspect(async (db) => {
          await db.query('BEGIN');
          try {
            await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
            await assert.rejects(
              db.query('UPDATE hearings SET ' + field + '=$1 WHERE id=$2', [value, row.id]),
            );
          } finally {
            await db.query('ROLLBACK');
          }
        });
      }
  assert.deepEqual(await inspect(staffReadOnlyState), before);
  pass(
    'Exact twelve D41 records: changing/clearing all three protected fields refused by service, direct gateway and row guard; all state exact',
  );
  let state = await readHearingMutation(admin, 'update', id, runtime);
  const originalIds = state.attendees.map((a) => a.id);
  const request = () => ({
    id,
    version: state.record!.version,
    submission: randomUUID(),
    values: {},
  });
  await run({
    ...request(),
    values: {
      hearing_date: null,
      next_hearing_date: '2020-01-01',
      decision: null,
      outcome: 'TEST ONLY ordinary outcome',
      court_id: null,
      circuit: 'TEST ONLY ordinary circuit',
      notes: 'TEST ONLY ordinary note',
    },
    attendees: [],
  });
  state = await readHearingMutation(admin, 'update', id, runtime);
  assert.equal(state.attendees.length, 0);
  assert.equal(state.record!.values.hearing_date, null);
  assert.equal(state.record!.values.decision, null);
  assert.equal(state.record!.values.next_hearing_date, '2020-01-01');
  assert.equal(state.record!.values.matter_id, null);
  const retired = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,person_id FROM hearing_attendees WHERE hearing_id=$1 AND id=ANY($2::int[]) ORDER BY id',
          [id, originalIds],
        )
      ).rows,
  );
  await run({
    ...request(),
    values: { outcome: null, circuit: null, notes: null },
    attendees: retired,
  });
  state = await readHearingMutation(admin, 'update', id, runtime);
  assert.deepEqual(
    state.attendees.map((a) => a.id),
    retired.map((a) => a.id),
  );
  const roundtrip = await inspect(staffReadOnlyState);
  assert.equal(
    (await run({ ...request(), attendees: [...state.attendees].reverse() })).changed,
    false,
  );
  assert.deepEqual(await inspect(staffReadOnlyState), roundtrip);
  const detail = await readHearing(admin, String(id), runtime);
  assert.ok(detail);
  assert.equal(detail.attendees.length, state.attendees.length);
  pass(
    'Explicit null/date-only and ordinary field edits; empty/all attendance; exact restored IDs, order and set round-trip no-op',
  );
  const expected = await inspect(async (db) =>
    (
      await db.query('SELECT id FROM hearings ORDER BY hearing_date DESC NULLS LAST,id DESC')
    ).rows.map((r) => r.id),
  );
  let pages = 0;
  for (const session of sessions) {
    const first = await readHearings(session, {}, runtime),
      ids = first.rows.map((r) => r.id);
    pages++;
    for (let page = 2; page <= first.pages; page++) {
      const next = await readHearings(session, { page: String(page) }, runtime);
      assert.equal(next.total, expected.length);
      ids.push(...next.rows.map((r) => r.id));
      pages++;
    }
    assert.deepEqual(ids, expected);
  }
  pass(
    'All four roles traverse every current hearing exactly once after mutations; independent SQL ordering oracle',
    { rows: expected.length, pages },
  );
}
