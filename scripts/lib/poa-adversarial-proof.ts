import { mutateClient, readClientMutation } from '../../src/lib/client-mutations';
import { mutateStaff, readStaffManagement } from '../../src/lib/staff-mutations';
import { adminEditState } from './admin-edit-state';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { PrismaClient } from '../../src/generated/prisma/client';
import type { IsolatedPostgres } from './isolated-postgres-fixture';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { withApprovedMigrationClient } from './migration-principal';
import { assertPoaEditBoundary } from './poa-edit-checkpoint';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { mutatePoa, readPoaMutation } from '../../src/lib/poa-mutations';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import type { PoaInput } from '../../src/lib/poa-mutation-input';

export async function provePoaAdversarial(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  output: string,
) {
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return work(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const admin = (await lifecycleSessions(runtime)).find((s) => s.user.role === 'Administrator')!;
  const run = (input: PoaInput) =>
    mutatePoa(admin, input.operation, input, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const input: PoaInput = {
    operation: 'create',
    id: null,
    version: null,
    submission: randomUUID(),
    values: {
      principal_name: 'TEST ONLY lock barrier',
      copies_count: null,
      show_on_poa_report: null,
    },
    lawyers: [],
    facts: null,
  };
  const created = await run(input),
    id = created.id,
    results: unknown[] = [];
  const record = (name: string, details: unknown) => {
    results.push({ name, details });
    writeFileSync(join(output, 'adversarial-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const overlap = async (
    name: string,
    requests: (PoaInput | (() => Promise<unknown>))[],
    clientLocks: number[] = [],
  ) =>
    inspect(async (holder) => {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE');
      for (const clientId of [...clientLocks].sort((a, b) => a - b))
        await holder.query('SELECT id FROM clients WHERE id=$1 FOR UPDATE', [clientId]);
      const holderPid = (await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const running = Promise.allSettled(
        requests.map((request) => (typeof request === 'function' ? request() : run(request))),
      );
      let observed: unknown[] = [];
      try {
        for (let n = 0; n < 100; n++) {
          await holder.query('SELECT pg_stat_clear_snapshot()');
          observed = (
            await holder.query(
              "SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) blockers FROM pg_stat_activity WHERE usename='litigation_runtime' AND wait_event_type='Lock' ORDER BY pid",
            )
          ).rows;
          if (observed.length === requests.length) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.equal(
          observed.length,
          requests.length,
          'actual simultaneously blocked POA statements',
        );
        await holder.query('COMMIT');
        const settled = await running;
        record(name, { holderPid, observed, outcomes: settled.map((s) => s.status) });
        return settled;
      } finally {
        await holder.query('ROLLBACK');
        await running;
      }
    });
  const edit = (version: string, notes: string, lawyers: number[] | null = null): PoaInput => ({
    operation: 'update',
    id,
    version,
    submission: randomUUID(),
    values: { notes },
    lawyers,
    facts: null,
  });
  const first = await overlap('observed edit/edit lock overlap', [
    edit('1', 'TEST ONLY A'),
    edit('1', 'TEST ONLY B'),
  ]);
  assert.equal(first.filter((s) => s.status === 'fulfilled').length, 1);
  let snapshot = await readPoaMutation(admin, 'archive', id, runtime);
  const lifecycle: PoaInput = {
    operation: 'archive',
    id,
    version: snapshot.record!.version,
    submission: randomUUID(),
    values: {},
    lawyers: null,
    facts: snapshot.facts,
  };
  const second = await overlap('observed edit/archive lock overlap', [
    edit(snapshot.record!.version, 'TEST ONLY competing archive'),
    lifecycle,
  ]);
  assert.equal(second.filter((s) => s.status === 'fulfilled').length, 1);
  snapshot = await readPoaMutation(admin, 'restore', id, runtime);
  if (snapshot.record!.archived)
    await run({
      ...lifecycle,
      operation: 'restore',
      version: snapshot.record!.version,
      submission: randomUUID(),
      facts: snapshot.facts,
    });
  snapshot = await readPoaMutation(admin, 'update', id, runtime);
  const people = snapshot.people.filter((p) => p.active).slice(0, 2);
  assert.equal(people.length, 2);
  const memberships = await overlap('observed competing current membership lock overlap', [
    edit(snapshot.record!.version, 'TEST ONLY selection A', [people[0]!.id]),
    edit(snapshot.record!.version, 'TEST ONLY selection B', [people[1]!.id]),
  ]);
  assert.equal(memberships.filter((s) => s.status === 'fulfilled').length, 1);
  const token = { ...input, submission: randomUUID() };
  const duplicate = await overlap('observed exact duplicate submission lock overlap', [
    token,
    token,
  ]);
  assert.equal(duplicate.filter((s) => s.status === 'fulfilled').length, 2);
  if (duplicate[0]!.status === 'fulfilled' && duplicate[1]!.status === 'fulfilled')
    assert.deepEqual(duplicate[0]!.value, duplicate[1]!.value);

  const dep = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
  const setClient = async (clientId: number, archived: boolean) => {
    const operation = archived ? 'client-archive' : 'client-restore',
      s = await readClientMutation(admin, operation, String(clientId), null, runtime);
    return mutateClient(
      admin,
      operation,
      { id: String(clientId), version: s.record!.version, confirmation: String(clientId) },
      dep,
    );
  };
  const clients = (await readPoaMutation(admin, 'update', id, runtime)).clients
    .filter((c) => c.active)
    .slice(0, 2);
  assert.equal(clients.length, 2);
  for (const mode of ['edit', 'relink-old', 'relink-new'] as const) {
    snapshot = await readPoaMutation(admin, 'update', id, runtime);
    await run({
      ...edit(snapshot.record!.version, 'TEST ONLY client preparation'),
      values: { client_id: clients[0]!.id },
    });
    snapshot = await readPoaMutation(admin, 'update', id, runtime);
    const target = mode === 'relink-new' ? clients[1]!.id : clients[0]!.id;
    const request = edit(snapshot.record!.version, 'TEST ONLY concurrent client');
    if (mode !== 'edit') request.values.client_id = clients[1]!.id;
    const outcomes = await overlap(
      'observed POA ' + mode + ' versus client archive',
      [request, () => setClient(target, true)],
      [target],
    );
    assert.ok(outcomes.some((o) => o.status === 'fulfilled'));
    await setClient(target, false);
  }
  const eligible = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT p.id FROM people p WHERE p.is_staff AND p.is_active AND NOT EXISTS(SELECT 1 FROM user_accounts u WHERE u.person_id=p.id) AND NOT EXISTS(SELECT 1 FROM lookup_team t WHERE t.reviewer_id=p.id) AND NOT EXISTS(SELECT 1 FROM power_of_attorney_lawyers l WHERE l.power_of_attorney_id=$1 AND l.person_id=p.id AND NOT l.is_retired) ORDER BY p.id LIMIT 1',
          [id],
        )
      ).rows[0].id as number,
  );
  snapshot = await readPoaMutation(admin, 'update', id, runtime);
  const staff = await readStaffManagement(admin, String(eligible), runtime);
  const deactivation = await overlap('observed new membership versus person deactivation', [
    edit(snapshot.record!.version, 'TEST ONLY concurrent person', [eligible]),
    () =>
      mutateStaff(
        admin,
        'deactivate',
        {
          personId: String(eligible),
          version: staff.person!.version,
          confirmation: String(eligible),
        },
        dep,
      ),
  ]);
  assert.ok(deactivation.some((o) => o.status === 'fulfilled'));
  const inactive = await readPoaMutation(admin, 'update', id, runtime);
  assert.equal(
    (
      await runtime.person.findUniqueOrThrow({
        where: { id: eligible },
        select: { isActive: true },
      })
    ).isActive,
    false,
  );
  if (!inactive.lawyers.some((l) => l.personId === eligible && !l.retired))
    await assert.rejects(
      run(edit(inactive.record!.version, 'TEST ONLY rejected inactive new selection', [eligible])),
    );
  await run(edit(inactive.record!.version, 'TEST ONLY preserve inactive existing selection'));
  const reactivated = await readStaffManagement(admin, String(eligible), runtime);
  await mutateStaff(
    admin,
    'reactivate',
    {
      personId: String(eligible),
      version: reactivated.person!.version,
      confirmation: String(eligible),
    },
    dep,
  );
  await inspect(async (db) => {
    await db.query(
      `CREATE FUNCTION _migration.test_only_task45_late() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.principal_name='TEST ONLY late insert' THEN RAISE EXCEPTION 'TEST ONLY late insert'; END IF; RETURN NEW; END $$; CREATE TRIGGER zzzz_test_only_task45_late AFTER INSERT ON powers_of_attorney FOR EACH ROW EXECUTE FUNCTION _migration.test_only_task45_late()`,
    );
    try {
      const before = await adminEditState(db);
      await assert.rejects(
        run({
          ...input,
          submission: randomUUID(),
          values: { principal_name: 'TEST ONLY late insert' },
        }),
      );
      const after = await adminEditState(db);
      assert.deepEqual(after.tables, before.tables);
      assert.equal(after.catalogDigest, before.catalogDigest);
      const reservations = after.sequences.filter(
        (row, i) => JSON.stringify(row) !== JSON.stringify(before.sequences[i]),
      );
      assert.ok(reservations.some((r) => r.sequencename === 'powers_of_attorney_id_seq'));
      record('failed insert rolls back rows and retains real sequence reservations', {
        reservations,
      });
    } finally {
      await db.query(
        'DROP TRIGGER zzzz_test_only_task45_late ON powers_of_attorney; DROP FUNCTION _migration.test_only_task45_late()',
      );
    }
  });
  // Each fault is applied only inside this isolated owner's rollback transaction.
  // The permanent checker, not a fixture-only predicate, must reject it.
  const faults = [
    [
      'baseline source',
      "ALTER TABLE _migration.poa_edit_import DISABLE TRIGGER USER; UPDATE _migration.poa_edit_import SET initial_values=jsonb_set(initial_values,'{principal_name}','\"TEST ONLY corruption\"') WHERE entity_table='powers_of_attorney' AND id=(SELECT min(id) FROM _migration.poa_edit_import WHERE entity_table='powers_of_attorney')",
    ],
    [
      'current field',
      `ALTER TABLE powers_of_attorney DISABLE TRIGGER USER; UPDATE powers_of_attorney SET notes='TEST ONLY corruption' WHERE id=${id}`,
    ],
    [
      'archive flag',
      `ALTER TABLE powers_of_attorney DISABLE TRIGGER USER; UPDATE powers_of_attorney SET is_archived=NOT is_archived WHERE id=${id}`,
    ],
    [
      'aggregate version',
      `ALTER TABLE powers_of_attorney DISABLE TRIGGER USER; UPDATE powers_of_attorney SET row_version=row_version+1 WHERE id=${id}`,
    ],
    [
      'current membership',
      `ALTER TABLE power_of_attorney_lawyers DISABLE TRIGGER USER; UPDATE power_of_attorney_lawyers SET is_retired=NOT is_retired WHERE power_of_attorney_id=${id}`,
    ],
    [
      'current order',
      `ALTER TABLE power_of_attorney_lawyers DISABLE TRIGGER USER; UPDATE power_of_attorney_lawyers SET current_order=current_order+100 WHERE power_of_attorney_id=${id}`,
    ],
    [
      'history payload',
      `ALTER TABLE _migration.poa_edit_change DISABLE TRIGGER USER; UPDATE _migration.poa_edit_change SET after_values=jsonb_set(after_values,'{poa,notes}','"TEST ONLY corruption"') WHERE poa_id=${id} AND version=1`,
    ],
    [
      'receipt actor',
      `ALTER TABLE _migration.poa_edit_submission DISABLE TRIGGER USER; UPDATE _migration.poa_edit_submission SET actor_id=(SELECT min(id) FROM audit_actors WHERE id<>_migration.poa_edit_submission.actor_id) WHERE poa_id=${id}`,
    ],
    [
      'lifecycle audit role',
      `ALTER TABLE audit_events DISABLE TRIGGER USER; DO $$ DECLARE affected integer; BEGIN UPDATE audit_events SET actor_role_snapshot='Litigation Assistant' WHERE entity_schema='public' AND entity_table='powers_of_attorney' AND action='archive'; GET DIAGNOSTICS affected=ROW_COUNT; IF affected=0 THEN RAISE EXCEPTION 'Missing owned lifecycle audit fixture'; END IF; END $$`,
    ],
    [
      'gateway grant',
      'GRANT EXECUTE ON FUNCTION _migration.poa_edit_aggregate(integer) TO litigation_runtime',
    ],
    ['gateway trigger', 'ALTER TABLE powers_of_attorney DISABLE TRIGGER poa_edit_complete'],
  ] as const;
  for (const [name, sql] of faults)
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await db.query(sql);
        if (name !== 'gateway trigger' && name !== 'gateway grant')
          for (const table of [
            'powers_of_attorney',
            'power_of_attorney_lawyers',
            '_migration.poa_edit_import',
            '_migration.poa_edit_change',
            '_migration.poa_edit_submission',
            'audit_events',
          ])
            await db.query('ALTER TABLE ' + table + ' ENABLE TRIGGER USER');
        let refusal = '';
        await assert.rejects(
          assertPoaEditBoundary(db, 'historical-full-state-upgrade'),
          (error: unknown) => {
            refusal = error instanceof Error ? error.message : String(error);
            return true;
          },
        );
        record('permanent checker refuses ' + name, { refusal });
      } finally {
        await db.query('ROLLBACK');
      }
    });
  await inspect((db) => assertPoaEditBoundary(db, 'historical-full-state-upgrade'));
}
