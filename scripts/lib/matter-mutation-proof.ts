import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateMatter, readMatterMutation } from '../../src/lib/matter-mutations';
import {
  parseMatterMutationInput,
  parseMatterMutationForm,
} from '../../src/lib/matter-mutation-input';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { assertMatterEditBoundary } from './matter-edit-checkpoint';
import { staffReadOnlyState } from './staff-read-only-state';

export async function proveMatterMutations(
  fixture: IsolatedPostgres,
  database: PrismaClient,
  admin: Session,
  assistant: Session,
  output: string,
) {
  const evidence: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    evidence.push({ name, details });
    writeFileSync(join(output, 'adversarial-results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS ' + name);
  };
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return fn(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const run = (action: 'create' | 'update', input: unknown, actor = admin) =>
    mutateMatter(actor, action, input, {
      database,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const state = () => inspect(staffReadOnlyState);
  const unchanged = async (work: () => Promise<unknown>) => {
    const before = await state();
    await assert.rejects(work());
    const after = await state();
    assert.deepEqual(
      after.tables,
      before.tables,
      'Refusal leaves every table including audit unchanged',
    );
    assert.equal(after.catalogDigest, before.catalogDigest);
  };
  const draft = () => ({
    id: null,
    version: null,
    submission: randomUUID(),
    values: { subject: 'TEST ONLY adversarial matter' },
  });
  for (const values of [
    { client_id: 0 },
    { subject: {} },
    { case_number_ar: 'x'.repeat(100001) },
    { start_date: '2025-02-29' },
    { start_date: '2024-13-01' },
    { asked_amount: '1e3' },
    { asked_amount: 1 },
    { asked_amount: '10000000000000000' },
    { legacy_id: 999 },
    { row_version: 1 },
    { is_archived: true },
  ])
    assert.throws(() => parseMatterMutationInput('create', { ...draft(), values }));
  const form = new FormData();
  form.set('payload', JSON.stringify(draft()));
  form.append('payload', '{}');
  assert.throws(() => parseMatterMutationForm('create', form));
  form.delete('payload');
  form.set('payload', new Blob(['{}']), 'fixture.json');
  assert.throws(() => parseMatterMutationForm('create', form));
  form.set('payload', '{"id":null,"id":null}');
  assert.throws(() => parseMatterMutationForm('create', form));
  pass(
    'Parser rejects protected/unknown/oversized fields, duplicate keys, File values and lossy dates/decimals',
  );
  const metrics = await inspect(
    async (db) =>
      (
        await db.query(
          `SELECT key,max(length(value#>>'{}')) maximum FROM matters m CROSS JOIN LATERAL jsonb_each(to_jsonb(m)) v WHERE jsonb_typeof(value)='string' GROUP BY key ORDER BY key`,
        )
      ).rows,
  );
  writeFileSync(join(output, 'existing-field-lengths.json'), JSON.stringify(metrics, null, 2));
  const options = await readMatterMutation(admin, 'create', null, database);
  const id = (await run('create', draft(), assistant)).id;
  const snapshot = () => readMatterMutation(admin, 'update', id, database);
  const edit = async () => ({
    id,
    version: (await snapshot()).record!.version,
    submission: randomUUID(),
    values: {},
  });
  await unchanged(() => run('create', { ...draft(), values: {} }));
  await unchanged(() =>
    run('update', { id, version: '1', submission: randomUUID(), values: { client_id: 12 } }),
  );
  for (const actor of [
    null,
    { ...admin, expires: new Date(0).toISOString() },
    { ...admin, user: { ...admin.user, sessionVersion: admin.user.sessionVersion + 1 } },
    { ...admin, user: { ...admin.user, role: 'Lawyer' } },
    { ...admin, user: { ...admin.user, mustChangePassword: true } },
  ])
    await unchanged(() => run('create', draft(), actor as Session));
  const first = (
    await inspect(
      async (db) =>
        (await db.query('SELECT id FROM matters WHERE legacy_id IS NOT NULL ORDER BY id LIMIT 1'))
          .rows,
    )
  )[0].id as number;
  const imported = await readMatterMutation(admin, 'update', first, database);
  const importedBefore = await inspect(
    async (db) =>
      (await db.query('SELECT to_jsonb(m) value FROM matters m WHERE id=$1', [first])).rows[0]
        .value,
  );
  await run('update', {
    id: first,
    version: imported.record!.version,
    submission: randomUUID(),
    values: { notes_2: (imported.record!.values.notes_2 ?? '') + '\nTEST ONLY imported edit' },
  });
  const importedAfter = await inspect(
    async (db) =>
      (await db.query('SELECT to_jsonb(m) value FROM matters m WHERE id=$1', [first])).rows[0]
        .value,
  );
  for (const key of Object.keys(importedBefore))
    if (!['notes_2', 'row_version', 'updated_at', 'updated_by'].includes(key))
      assert.deepEqual(importedAfter[key], importedBefore[key], key);
  await inspect((db) => assertMatterEditBoundary(db, 'historical-full-state-upgrade'));
  pass(
    'Assistant create; imported edit preserves every unedited field and immutable import/release evidence',
  );
  const party = {
    id: null,
    side: 'opponent',
    party_name: 'TEST ONLY ordered party\nsecond line',
    gender: 'f',
    ordinal: 1,
    roles: options.roles
      .filter((r) => r.active)
      .slice(0, 2)
      .map((r, i) => ({ id: null, role_id: r.id, ordinal: i + 1 })),
  };
  const lawyers = options.people
    .filter((p) => p.active)
    .slice(0, 3)
    .map((p, i) => ({
      id: null,
      person_id: p.id,
      role: ['lead', 'co_lead', 'support'][i],
      position: i + 1,
    }));
  await run('update', { ...(await edit()), parties: [party], lawyers });
  const full = await snapshot();
  await unchanged(() =>
    run('update', {
      id,
      version: full.record!.version,
      submission: randomUUID(),
      values: {},
      parties: [
        { ...full.parties[0], roles: [full.parties[0]!.roles[0], full.parties[0]!.roles[0]] },
      ],
    }),
  );
  await unchanged(() =>
    run('update', {
      id,
      version: full.record!.version,
      submission: randomUUID(),
      values: {},
      lawyers: [full.lawyers[0], full.lawyers[0]],
    }),
  );
  await unchanged(() =>
    run('update', {
      id,
      version: full.record!.version,
      submission: randomUUID(),
      values: {},
      lawyers: full.lawyers.map((l) => ({ ...l, role: 'lead' })),
    }),
  );
  await unchanged(() =>
    run('update', {
      id,
      version: full.record!.version,
      submission: randomUUID(),
      values: {},
      parties: [{ ...party, id: 2147483647 }],
    }),
  );
  await run('update', {
    ...(await edit()),
    parties: full.parties.map((p) => ({
      ...p,
      roles: [...p.roles].reverse().map((r, i) => ({ ...r, ordinal: i + 1 })),
    })),
    lawyers: full.lawyers.map((l, i) => ({
      ...l,
      role: i === 0 ? 'support' : i === 2 ? 'lead' : l.role,
      position: 3 - i,
    })),
  });
  const reordered = await snapshot();
  assert.deepEqual(
    reordered.parties[0]!.roles.map((r) => r.id),
    [...full.parties[0]!.roles].reverse().map((r) => r.id),
  );
  assert.deepEqual(
    reordered.lawyers.map((l) => l.id),
    [...full.lawyers].reverse().map((l) => l.id),
  );
  await run('update', { ...(await edit()), parties: [], lawyers: [] });
  assert.deepEqual((await snapshot()).parties, []);
  assert.deepEqual((await snapshot()).lawyers, []);
  const retained = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT count(*)::integer count,bool_and(is_retired) retired FROM matter_parties WHERE matter_id=$1',
          [id],
        )
      ).rows[0],
  );
  assert.deepEqual(retained, { count: 1, retired: true });
  await run('update', {
    ...(await edit()),
    parties: reordered.parties,
    lawyers: reordered.lawyers,
  });
  assert.deepEqual((await snapshot()).parties, reordered.parties);
  assert.deepEqual((await snapshot()).lawyers, reordered.lawyers);
  const noopBefore = await state();
  assert.equal(
    (
      await run('update', {
        ...(await edit()),
        parties: reordered.parties,
        lawyers: reordered.lawyers,
      })
    ).changed,
    false,
  );
  assert.deepEqual(await state(), noopBefore);
  pass(
    'Reorder, lead swap, retained removal/restoration preserve child identities; true no-op has zero table/sequence/catalog changes',
  );
  // Actual simultaneous blocking observed via pg_stat_activity, not a sequential race simulation.
  async function waitBlocked(db: Parameters<Parameters<typeof inspect>[0]>[0], count: number) {
    for (let i = 0; i < 150; i++) {
      await db.query('SELECT pg_stat_clear_snapshot()');
      const n = Number(
        (
          await db.query(
            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%public.matter_edit_save(%'",
          )
        ).rows[0].count,
      );
      if (n >= count) {
        pass('Observed overlapping database locks', { blocked: n });
        return;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Expected concurrent gateway lock wait was not observed');
  }
  const staleBase = await edit();
  await inspect(async (db) => {
    await db.query('BEGIN');
    await db.query('SELECT id FROM matters WHERE id=$1 FOR UPDATE', [id]);
    const writes = [
      run('update', { ...staleBase, values: { subject: 'TEST ONLY race one' } }),
      run('update', {
        ...staleBase,
        submission: randomUUID(),
        values: { subject: 'TEST ONLY race two' },
      }),
    ];
    const results = Promise.allSettled(writes);
    try {
      await waitBlocked(db, 2);
    } finally {
      await db.query('ROLLBACK');
      writeFileSync(
        join(output, 'overlap-update-outcomes.json'),
        JSON.stringify(
          (await results).map((r) => ({
            status: r.status,
            ...(r.status === 'fulfilled'
              ? { result: r.value }
              : { error: r.reason instanceof Error ? r.reason.message : 'rejected' }),
          })),
          null,
          2,
        ),
      );
    }
    const settled = await results;
    assert.equal(settled.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(settled.filter((r) => r.status === 'rejected').length, 1);
  });
  assert.equal(BigInt((await snapshot()).record!.version), BigInt(staleBase.version) + 1n);
  const duplicate = { ...draft(), lawyers: [lawyers[0]] };
  await inspect(async (db) => {
    await db.query('BEGIN');
    await db.query('SELECT id FROM people WHERE id=$1 FOR UPDATE', [lawyers[0]!.person_id]);
    const both = Promise.allSettled([run('create', duplicate), run('create', duplicate)]);
    try {
      await waitBlocked(db, 2);
    } finally {
      await db.query('ROLLBACK');
      writeFileSync(
        join(output, 'overlap-create-outcomes.json'),
        JSON.stringify(
          (await both).map((r) => ({
            status: r.status,
            ...(r.status === 'fulfilled'
              ? { result: r.value }
              : { error: r.reason instanceof Error ? r.reason.message : 'rejected' }),
          })),
          null,
          2,
        ),
      );
    }
    const results = await both;
    assert.ok(results.every((r) => r.status === 'fulfilled'));
    assert.deepEqual(results[0], results[1]);
  });
  pass(
    'Concurrent aggregate updates: one winner; concurrent same submission: one created identity/version',
  );
  // A deliberately failing audit insert must unwind parent and child changes.
  await inspect(async (db) => {
    await db.query(
      `CREATE FUNCTION public.task42_fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY audit failure'; END $$; CREATE TRIGGER task42_fixture_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.entity_table='matter_parties') EXECUTE FUNCTION public.task42_fixture_audit_failure()`,
    );
  });
  try {
    const request = {
      ...(await edit()),
      values: { subject: 'TEST ONLY must roll back' },
      parties: [{ ...party, party_name: 'TEST ONLY audit refusal' }],
    };
    await unchanged(() => run('update', request));
  } finally {
    await inspect((db) =>
      db.query(
        'DROP TRIGGER task42_fixture_audit_failure ON audit_events; DROP FUNCTION public.task42_fixture_audit_failure()',
      ),
    );
  }
  pass('Audit failure rolls back parent/child/history/submission/audit rows together');
  const excludedPeople = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,is_staff,is_active FROM people WHERE NOT is_staff OR NOT is_active ORDER BY id',
        )
      ).rows,
  );
  assert.ok(excludedPeople.some((p) => !p.is_staff));
  assert.ok(excludedPeople.some((p) => !p.is_active));
  for (const person of [
    excludedPeople.find((p) => !p.is_staff),
    excludedPeople.find((p) => !p.is_active),
  ])
    await unchanged(() =>
      run('create', {
        ...draft(),
        lawyers: [{ id: null, person_id: person!.id, role: 'support', position: 1 }],
      }),
    );
  const wrongBranch = options.choices.branch_id!.find(
    (b) => b.active && !options.branches.some((v) => v.client_id === 12 && v.branch_id === b.id),
  );
  assert.ok(wrongBranch);
  await unchanged(() =>
    run('create', {
      ...draft(),
      values: {
        subject: 'TEST ONLY incompatible branch',
        client_id: 12,
        branch_id: wrongBranch.id,
      },
    }),
  );
  const historical = await readMatterMutation(admin, 'update', first, database);
  assert.ok(historical.parties.length > 0);
  await run('update', {
    id: first,
    version: historical.record!.version,
    submission: randomUUID(),
    values: {},
    parties: historical.parties.map((p, i) =>
      i === 0 ? { ...p, party_name: (p.party_name ?? '') + ' TEST ONLY revised' } : p,
    ),
  });
  await inspect((db) => assertMatterEditBoundary(db, 'historical-full-state-upgrade'));
  pass(
    'Inactive/external staff and incompatible branch denied; imported party edit remains exactly reconciled',
  );
  const matterState = async () =>
    (await state()).tables.filter((t) =>
      [
        'matters',
        'matter_parties',
        'matter_party_roles',
        'matter_lawyers',
        'matter_edit_change',
        'matter_edit_import',
        'matter_edit_submission',
      ].includes(t.table),
    );
  const beforeArchive = await matterState();
  await inspect(async (db) => {
    await db.query('BEGIN');
    await db.query('SELECT id FROM clients WHERE id=12 FOR UPDATE');
    const request = Promise.allSettled([
      run('create', {
        ...draft(),
        values: { subject: 'TEST ONLY client archive overlap', client_id: 12 },
      }),
    ]);
    try {
      await waitBlocked(db, 1);
      await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
      await db.query(
        "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY matter eligibility overlap','system')",
        [randomUUID(), randomUUID(), randomUUID()],
      );
      await db.query(
        "SELECT client_contact_set_archived('clients',12,(SELECT row_version FROM clients WHERE id=12),true)",
      );
      await db.query('COMMIT');
    } finally {
      await db.query('ROLLBACK');
      const outcome = await request;
      writeFileSync(
        join(output, 'client-archive-overlap.json'),
        JSON.stringify(
          outcome.map((r) => ({ status: r.status })),
          null,
          2,
        ),
      );
      assert.equal(outcome[0]!.status, 'rejected');
    }
  });
  assert.deepEqual(await matterState(), beforeArchive);
  // Existing matters under the now-archived client remain editable.
  const archivedMatter = await inspect(
    async (db) =>
      (await db.query('SELECT id FROM matters WHERE client_id=12 ORDER BY id LIMIT 1')).rows[0]
        .id as number,
  );
  const archivedSnapshot = await readMatterMutation(admin, 'update', archivedMatter, database);
  await run('update', {
    id: archivedMatter,
    version: archivedSnapshot.record!.version,
    submission: randomUUID(),
    values: {
      notes_1:
        (archivedSnapshot.record!.values.notes_1 ?? '') + '\nTEST ONLY archived client matter edit',
    },
  });
  const { setMatterClientArchive } = await import('../test-matter-read-only');
  await setMatterClientArchive(fixture, 12, false);
  pass(
    'Observed client archive/save overlap rejects newly ineligible selection; archived-client existing matter remains editable',
  );
  // Runtime credentials cannot bypass the two explicit gateways with raw DML.
  await unchanged(
    () =>
      database.$executeRaw`UPDATE matters SET subject='TEST ONLY forbidden raw DML' WHERE id=${id}`,
  );
  await unchanged(() => database.$executeRaw`DELETE FROM matter_parties WHERE matter_id=${id}`);
  await unchanged(
    () =>
      database.$executeRaw`UPDATE _migration.matter_edit_import SET initial_values='{}'::jsonb WHERE false`,
  );
  pass(
    'Restricted runtime cannot update raw matters, delete relationship history or rewrite import evidence',
  );
  await inspect((db) => assertMatterEditBoundary(db, 'historical-full-state-upgrade'));
}
