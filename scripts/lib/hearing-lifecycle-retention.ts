import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateHearing, readHearingMutation } from '../../src/lib/hearing-mutations';
import { mutateHearingLifecycle, readHearingLifecycle } from '../../src/lib/hearing-lifecycle';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { staffReadOnlyState } from './staff-read-only-state';
import { setHearingParentArchive } from '../test-hearing-read-only';

/** Explicit category assertions supplement the earlier bounded OR selection. */
export async function proveHearingLifecycleRetention(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  pass: (name: string, details?: unknown) => void,
) {
  const inspect = <T>(f: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return f(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const admin = (await lifecycleSessions(runtime)).find((s) => s.user.role === 'Administrator')!;
  const dep = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
  const categories = await inspect(async (db) => {
    const predicates = {
      inactive:
        'EXISTS(SELECT 1 FROM hearing_attendees a JOIN people p ON p.id=a.person_id WHERE a.hearing_id=h.id AND NOT p.is_active)',
      duplicate:
        'EXISTS(SELECT 1 FROM hearing_attendees a WHERE a.hearing_id=h.id GROUP BY person_id HAVING count(*)>1)',
      missingContext: 'h.matter_id IS NULL AND (h.court_id IS NULL OR h.action_id IS NULL)',
    };
    const selected = [];
    for (const [category, predicate] of Object.entries(predicates)) {
      const rows = (
        await db.query(
          `SELECT h.id,h.matter_id FROM hearings h WHERE h.legacy_id IS NOT NULL AND ${predicate} ORDER BY h.id LIMIT 1`,
        )
      ).rows;
      assert.equal(rows.length, 1, category + ' requires a positive real-data control');
      selected.push({ category, ...rows[0] });
    }
    const missingPeople = (
      await db.query(
        'SELECT count(*)::int n FROM hearing_attendees a LEFT JOIN people p ON p.id=a.person_id WHERE p.id IS NULL',
      )
    ).rows[0].n;
    return { selected, missingPeople };
  });
  const retained = (id: number) =>
    inspect(async (db) => ({
      hearing: (
        await db.query(
          "SELECT to_jsonb(h)-ARRAY['row_version','is_archived','updated_at','updated_by'] v FROM hearings h WHERE id=$1",
          [id],
        )
      ).rows,
      attendees: (
        await db.query(
          'SELECT to_jsonb(a) v FROM hearing_attendees a WHERE hearing_id=$1 ORDER BY id',
          [id],
        )
      ).rows,
    }));
  const pair = async (id: number) => {
    const expected = await retained(id);
    const before = await inspect(staffReadOnlyState);
    for (const action of ['archive', 'restore'] as const) {
      const state = await readHearingLifecycle(admin, action, id, runtime);
      await mutateHearingLifecycle(
        admin,
        action,
        {
          id,
          confirmation: id,
          action,
          version: state.version,
          facts: state.facts,
          submission: randomUUID(),
        },
        dep,
      );
      assert.ok(
        JSON.stringify(await retained(id)) === JSON.stringify(expected),
        'All retained hearing/attendee fields exact',
      );
    }
    const after = await inspect(staffReadOnlyState);
    const allowed = new Set([
      'public.hearings',
      'public.audit_events',
      '_migration.matter_lifecycle_audit_counter',
      '_migration.hearing_edit_change',
      '_migration.hearing_edit_submission',
    ]);
    const unrelated = (s: typeof before) =>
      s.tables.filter((t) => !allowed.has(t.schema + '.' + t.table));
    assert.ok(
      JSON.stringify(unrelated(before)) === JSON.stringify(unrelated(after)),
      'Every unrelated table, including people, matters, clients, billing and attendance, preserved',
    );
  };
  for (const selected of categories.selected) {
    const state = await readHearingLifecycle(admin, 'archive', selected.id, runtime);
    if (state.facts.matterArchived)
      await setHearingParentArchive(fixture, selected.matter_id, false);
    await pair(selected.id);
  }
  pass(
    'Explicit real imported inactive-person, duplicate-membership and missing matter/court/action context controls; all unrelated tables exact',
    categories,
  );
  const id = categories.selected.find((s) => s.category === 'duplicate')!.id;
  let edit = await readHearingMutation(admin, 'update', id, runtime);
  assert.ok(edit.attendees.length >= 2);
  const retiredId = edit.attendees[0]!.id;
  const person = edit.people.find(
    (p) => p.active && !edit.attendees.some((a) => a.person_id === p.id),
  )!;
  assert.ok(person);
  await mutateHearing(
    admin,
    'update',
    {
      id,
      version: edit.record!.version,
      submission: randomUUID(),
      values: {},
      attendees: [...edit.attendees.slice(1), { id: null, person_id: person.id }],
    },
    dep,
  );
  const mixed = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,ordinal,current_order,is_retired,legacy_name_raw FROM hearing_attendees WHERE hearing_id=$1 ORDER BY id',
          [id],
        )
      ).rows,
  );
  assert.ok(mixed.some((a) => a.id === retiredId && a.is_retired && a.ordinal !== null));
  assert.ok(mixed.some((a) => !a.is_retired && a.ordinal !== null));
  assert.ok(mixed.some((a) => !a.is_retired && a.ordinal === null && a.current_order !== null));
  await pair(id);
  edit = await readHearingMutation(admin, 'update', id, runtime);
  const noOp = await inspect(staffReadOnlyState);
  assert.equal(
    (
      await mutateHearing(
        admin,
        'update',
        {
          id,
          version: edit.record!.version,
          submission: randomUUID(),
          values: {},
          attendees: edit.attendees,
        },
        dep,
      )
    ).changed,
    false,
  );
  assert.ok(JSON.stringify(await inspect(staffReadOnlyState)) === JSON.stringify(noOp));
  pass(
    'Mixed imported/current display order and retired imported membership survive archive/restore; Phase2 selection round-trip remains an exact no-op',
    { hearing: id, retainedAttendee: retiredId },
  );
}
