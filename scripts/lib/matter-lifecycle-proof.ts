import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from 'next-auth';
import type { ClientBase } from 'pg';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateMatter, readMatterMutation } from '../../src/lib/matter-mutations';
import {
  mutateMatterLifecycle,
  readMatterLifecycle,
  type MatterLifecycleAction,
} from '../../src/lib/matter-lifecycle';
import {
  readMatter,
  readMatters,
  parseMatterFilters,
  matterDetailHref,
  matterReturnHref,
} from '../../src/lib/matter-query';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { staffReadOnlyState } from './staff-read-only-state';
import { matterMigrationCatalog } from './matter-migration-delta';
import { assertMatterEditBoundary } from './matter-edit-checkpoint';
import { matterLifecycleApplied } from './matter-lifecycle-checkpoint';
import { loadReports } from './gate4-database';
import { visibilityDigest } from './client-archive-visibility';
import { setMatterClientArchive } from '../test-matter-read-only';
import { proveMatterCorrections } from './matter-correction-proof';

export async function lifecycleSessions(runtime: PrismaClient) {
  const accounts = await runtime.userAccount.findMany({
    select: { id: true, personId: true, username: true, roleCode: true, sessionVersion: true },
  });
  return accounts.map(
    (a) =>
      ({
        expires: new Date(Date.now() + 3600000).toISOString(),
        user: {
          id: String(a.id),
          personId: a.personId,
          username: a.username,
          name: 'TEST ONLY',
          role: a.roleCode,
          sessionVersion: a.sessionVersion,
          mustChangePassword: false,
          auditSessionId: randomUUID(),
        },
      }) as Session,
  );
}
export async function proveMatterLifecycle(
  fixture: IsolatedPostgres,
  output: string,
  runtime: PrismaClient,
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
    writeFileSync(join(output, 'lifecycle-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const sessions = await lifecycleSessions(runtime),
    admins = sessions.filter((s) => s.user.role === 'Administrator');
  assert.equal(admins.length, 1);
  const admin = admins[0]!;
  const assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  const run = (action: MatterLifecycleAction, input: unknown, actor = admin) =>
    mutateMatterLifecycle(actor, action, input, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const edit = (id: number, version: string, values: unknown = {}, actor = admin) =>
    mutateMatter(
      actor,
      'update',
      { id, version, submission: randomUUID(), values },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
  const request = async (id: number, action: MatterLifecycleAction) => {
    const state = await readMatterLifecycle(admin, action, id, runtime);
    return {
      id,
      version: state.version,
      counts: state.counts,
      action,
      confirmation: id,
      submission: randomUUID(),
    };
  };
  const complete = async () => ({
    state: await inspect(staffReadOnlyState),
    catalog: await inspect(matterMigrationCatalog),
  });
  const refused = async (work: () => Promise<unknown>) => {
    const before = await complete();
    await assert.rejects(work());
    assert.deepEqual(await complete(), before);
  };
  const aggregate = (id: number) =>
    inspect(
      async (db) =>
        (await db.query('SELECT _migration.matter_edit_aggregate($1) value', [id])).rows[0].value,
    );
  const businessDigest = (id: number) =>
    inspect(
      async (db) =>
        (
          await db.query(
            "SELECT encode(sha256(convert_to((v||jsonb_build_object('matter',(v->'matter')-ARRAY['is_archived','row_version','updated_at','updated_by']))::text,'UTF8')),'hex') digest FROM (SELECT _migration.matter_edit_aggregate($1) v) q",
            [id],
          )
        ).rows[0].digest as string,
    );
  const business = (value: Record<string, unknown>) => {
    const v = structuredClone(value) as { matter: Record<string, unknown> };
    for (const k of ['is_archived', 'row_version', 'updated_at', 'updated_by']) delete v.matter[k];
    return v;
  };
  const reports = () =>
    inspect(async (db) => {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        return await loadReports(db);
      } finally {
        await db.query('ROLLBACK');
      }
    });
  const options = await readMatterMutation(admin, 'create', null, runtime);
  const created = await mutateMatter(
    admin,
    'create',
    {
      id: null,
      version: null,
      submission: randomUUID(),
      values: {
        case_number_ar: 'TEST ONLY archive 140J\n140ق',
        subject: 'TEST ONLY lifecycle fixture',
        asked_amount: '12.34',
      },
      parties: [
        {
          id: null,
          side: 'client',
          party_name: 'TEST ONLY party',
          gender: null,
          ordinal: null,
          roles: [{ id: null, role_id: options.roles.find((r) => r.active)!.id, ordinal: null }],
        },
        {
          id: null,
          side: 'opponent',
          party_name: 'TEST ONLY retired party',
          gender: null,
          ordinal: 9,
          roles: [],
        },
      ],
      lawyers: [
        {
          id: null,
          person_id: options.people.find((p) => p.active)!.id,
          role: 'support',
          position: null,
        },
      ],
    },
    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
  );
  const nativeForm = await readMatterMutation(admin, 'update', created.id, runtime);
  await mutateMatter(
    admin,
    'update',
    {
      id: created.id,
      version: created.version,
      submission: randomUUID(),
      values: {},
      parties: [nativeForm.parties[0]],
      lawyers: [],
    },
    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
  );
  const empty = await mutateMatter(
    admin,
    'create',
    {
      id: null,
      version: null,
      submission: randomUUID(),
      values: { subject: 'TEST ONLY empty lifecycle' },
    },
    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
  );
  const imported = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT m.id,m.client_id,(SELECT count(*)::int FROM hearings h WHERE h.matter_id=m.id) hearings FROM matters m WHERE m.legacy_id IS NOT NULL AND m.client_id IS NOT NULL ORDER BY hearings DESC,m.id LIMIT 1',
        )
      ).rows[0],
  );
  const emptyImport = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT m.id FROM matters m WHERE m.legacy_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hearings WHERE matter_id=m.id) AND NOT EXISTS(SELECT 1 FROM admin_tasks WHERE matter_id=m.id) AND NOT EXISTS(SELECT 1 FROM documents WHERE matter_id=m.id) AND NOT EXISTS(SELECT 1 FROM fee_letter_matters WHERE matter_id=m.id) AND NOT EXISTS(SELECT 1 FROM matter_fee_letter_references WHERE matter_id=m.id) ORDER BY m.id LIMIT 1',
        )
      ).rows[0],
  );
  assert.ok(imported.hearings > 100 && emptyImport);
  const financial = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT m.id FROM matters m WHERE m.legacy_id IS NOT NULL AND (EXISTS(SELECT 1 FROM fee_letter_matters WHERE matter_id=m.id) OR EXISTS(SELECT 1 FROM matter_fee_letter_references WHERE matter_id=m.id)) ORDER BY (SELECT count(*) FROM hearings WHERE matter_id=m.id) DESC,m.id LIMIT 1',
        )
      ).rows[0],
  );
  assert.ok(financial);
  assert.ok((await request(financial.id, 'archive')).counts.feeLetters > 0);
  const baselineReports = await reports();
  assert.equal(baselineReports.length, 6);
  assert.ok(baselineReports[0]!.rows.length > 0);
  if (!process.argv.includes('--lifecycle-followup-only'))
    for (const id of [created.id, empty.id, imported.id, emptyImport.id, financial.id]) {
      const exactBusiness = await businessDigest(id);
      const before = await aggregate(id),
        allBefore = await inspect(staffReadOnlyState),
        req = await request(id, 'archive');
      const archived = await run('archive', req);
      assert.equal(archived.changed, true);
      assert.equal(BigInt(archived.version), BigInt(req.version) + 1n);
      assert.deepEqual(business(await aggregate(id)), business(before));
      assert.equal(await businessDigest(id), exactBusiness);
      assert.deepEqual(
        (await inspect(staffReadOnlyState)).tables.filter(
          (t) =>
            ![
              'matters',
              'audit_events',
              'matter_edit_change',
              'matter_edit_submission',
              'matter_lifecycle_audit_counter',
            ].includes(t.table),
        ),
        allBefore.tables.filter(
          (t) =>
            ![
              'matters',
              'audit_events',
              'matter_edit_change',
              'matter_edit_submission',
              'matter_lifecycle_audit_counter',
            ].includes(t.table),
        ),
      );
      const after = await complete();
      assert.deepEqual(await run('archive', req), archived);
      assert.deepEqual(await complete(), after);
      const same = await request(id, 'archive');
      assert.equal((await run('archive', same)).changed, false);
      assert.deepEqual(await complete(), after);
      await refused(() => run('restore', { ...req, action: 'restore' }));
      await refused(() => edit(id, archived.version, { subject: 'TEST ONLY denied' }));
      await refused(() => readMatterMutation(assistant, 'update', id, runtime));
      for (const actor of sessions) {
        const detail = await readMatter(actor, String(id), runtime);
        assert.equal(detail?.archived, true);
      }
      assert.equal(visibilityDigest(await reports()), visibilityDigest(baselineReports));
      const restoreReq = await request(id, 'restore');
      const restored = await run('restore', restoreReq);
      assert.equal(restored.changed, true);
      assert.deepEqual(business(await aggregate(id)), business(before));
      assert.equal(await businessDigest(id), exactBusiness);
      const current = await readMatterMutation(assistant, 'update', id, runtime);
      assert.equal(current.record!.version, restored.version);
      const post = await complete();
      assert.equal(
        (
          await mutateMatter(
            assistant,
            'update',
            {
              id,
              version: restored.version,
              submission: randomUUID(),
              values: {},
              parties: current.parties,
              lawyers: current.lawyers,
            },
            { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
          )
        ).changed,
        false,
      );
      assert.deepEqual(await complete(), post);
      const trail = await inspect(
        async (db) =>
          (
            await db.query(
              "SELECT c.version::text,c.actor_id,c.request_id,(SELECT count(*)::int FROM audit_events e WHERE e.request_id=c.request_id AND e.entity_table='matters' AND e.entity_key=jsonb_build_object('id',c.matter_id) AND e.actor_id=c.actor_id AND e.action IN ('archive','restore')) semantic FROM _migration.matter_edit_change c WHERE matter_id=$1 AND version>$2 ORDER BY version",
              [id, req.version],
            )
          ).rows,
      );
      assert.equal(trail.length, 2);
      assert.ok(trail.every((t) => t.semantic === 1));
      pass(
        'Exact archive/restore, retry/no-op, read-only, complete business/related retention and post-restore ordering',
        { id, counts: req.counts, versions: trail.map((t) => t.version) },
      );
    }
  if (process.argv.includes('--retention-browser-only')) return;
  const req = await request(created.id, 'archive');
  if (!process.argv.includes('--lifecycle-followup-only')) {
    for (const actor of sessions.filter((s) => s.user.role !== 'Administrator')) {
      await refused(() => run('archive', req, actor));
      await refused(() => run('restore', { ...req, action: 'restore' }, actor));
      await refused(() => readMatterLifecycle(actor, 'archive', created.id, runtime));
    }
    for (const actor of [
      { ...admin, expires: new Date(0).toISOString() },
      { ...admin, user: { ...admin.user, sessionVersion: admin.user.sessionVersion + 1 } },
      { ...admin, user: { ...admin.user, id: '2147483647' } },
      { ...assistant, user: { ...assistant.user, role: 'Administrator' } },
    ] as Session[])
      await refused(() => run('archive', req, actor));
    for (const payload of [
      { ...req, confirmation: empty.id },
      { ...req, version: '0' },
      { ...req, counts: {} },
      { ...req, counts: { ...req.counts, hearings: req.counts.hearings + 1 } },
      { ...req, action: 'delete' },
      { ...req, values: { status: 'closed' } },
    ])
      await refused(() => run('archive', payload));
    for (const sql of [
      'UPDATE matters SET is_archived=true WHERE id=' + created.id,
      "UPDATE matter_parties SET party_name='TEST ONLY forged' WHERE matter_id=" + created.id,
      'DELETE FROM matters WHERE id=' + created.id,
    ])
      await refused(() => runtime.$executeRawUnsafe(sql));
    pass(
      'All four roles, forged sessions/requests, current version/counts and direct runtime write denial with full state/sequence equality',
    );
  }
  // SQL entry bypasses the TypeScript service and tests actual current account state.
  const context = async (db: ClientBase, account = Number(admin.user.id)) => {
    await db.query('SELECT audit_set_human_context($1)', [account]);
    await db.query(
      "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY lifecycle proof','system')",
      [randomUUID(), randomUUID(), randomUUID()],
    );
  };
  const direct = async (db: ClientBase, input: unknown, actor = admin) =>
    db.query('SELECT public.matter_lifecycle_save($1,$2,$3,$4,$5::jsonb)', [
      Number(actor.user.id),
      actor.user.sessionVersion,
      actor.user.role,
      actor.expires,
      JSON.stringify(input),
    ]);
  for (const actor of sessions.filter((s) => s.user.role !== 'Administrator'))
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await context(db, Number(actor.user.id));
        await assert.rejects(direct(db, req, actor), /Administrator matter lifecycle required/u);
      } finally {
        await db.query('ROLLBACK');
      }
    });
  // Give the owned assistant a temporary administrator role inside each rolled-back transaction.
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
          [Number(assistant.user.id)],
        );
        const beforeAccount = (
          await db.query('SELECT session_version FROM user_accounts WHERE id=$1', [
            Number(assistant.user.id),
          ])
        ).rows[0];
        await db.query(
          'UPDATE user_accounts SET ' +
            change +
            (change.startsWith('session_version') ? '' : ',session_version=session_version+1') +
            ' WHERE id=$1',
          [Number(assistant.user.id)],
        );
        const afterAccount = (
          await db.query('SELECT session_version FROM user_accounts WHERE id=$1', [
            Number(assistant.user.id),
          ])
        ).rows[0];
        await context(db, Number(assistant.user.id));
        const testedActor = {
          ...assistant,
          user: {
            ...assistant.user,
            role: 'Administrator',
            sessionVersion: change.startsWith('session_version')
              ? beforeAccount.session_version
              : afterAccount.session_version,
          },
        } as Session;
        await assert.rejects(
          direct(db, req, testedActor),
          /Current authorized matter session required/u,
        );
      } finally {
        await db.query('ROLLBACK');
      }
    });
  pass(
    'Direct committing gateway refuses each non-administrator and disabled/forced-password/changed-role/revoked account',
  );
  await inspect((db) =>
    db.query(
      "CREATE FUNCTION public.task42_lifecycle_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY lifecycle audit failure'; END $$; CREATE TRIGGER task42_lifecycle_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='archive') EXECUTE FUNCTION public.task42_lifecycle_audit_failure()",
    ),
  );
  try {
    await refused(() => run('archive', req));
  } finally {
    await inspect((db) =>
      db.query(
        'DROP TRIGGER task42_lifecycle_audit_failure ON audit_events; DROP FUNCTION public.task42_lifecycle_audit_failure()',
      ),
    );
  }
  assert.equal((await run('archive', req)).changed, true); // same unconsumed receipt after rollback
  await run('restore', await request(created.id, 'restore'));
  pass(
    'Semantic-audit failure rolls back matter/version/history/receipt/all sequences; original request remains safely retryable',
  );
  const waitBlocked = async (db: ClientBase, count: number) => {
    for (let i = 0; i < 150; i++) {
      await db.query('SELECT pg_stat_clear_snapshot()');
      const blocked = (
        await db.query(
          "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND (query LIKE '%public.matter_edit_save(%' OR query LIKE '%public.matter_lifecycle_save(%')",
        )
      ).rows[0].n;
      if (blocked >= count) {
        pass('Observed overlapping gateway lock waits', { blocked });
        return;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Gateway overlap not observed');
  };
  for (const kind of ['edit/archive', 'archive/restore', 'duplicate archive']) {
    const state = await readMatterLifecycle(admin, 'archive', created.id, runtime),
      one = await request(created.id, 'archive');
    let outcomes: PromiseSettledResult<unknown>[] = [];
    await inspect(async (db) => {
      await db.query('BEGIN');
      await db.query('SELECT id FROM matters WHERE id=$1 FOR UPDATE', [created.id]);
      const pending = Promise.allSettled([
        run('archive', one),
        kind === 'edit/archive'
          ? edit(created.id, state.version, { subject: 'TEST ONLY overlap winner' })
          : kind === 'archive/restore'
            ? run('restore', { ...one, action: 'restore', submission: randomUUID() })
            : run('archive', one),
      ]);
      try {
        await waitBlocked(db, 2);
      } finally {
        await db.query('ROLLBACK');
        outcomes = await pending;
      }
    });
    const now = await readMatterLifecycle(admin, 'archive', created.id, runtime);
    if (kind === 'duplicate archive') {
      assert.ok(outcomes.every((r) => r.status === 'fulfilled'));
      assert.deepEqual(
        (outcomes[0] as PromiseFulfilledResult<unknown>).value,
        (outcomes[1] as PromiseFulfilledResult<unknown>).value,
      );
      assert.equal(BigInt(now.version), BigInt(state.version) + 1n);
    } else if (kind === 'edit/archive') {
      assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(BigInt(now.version), BigInt(state.version) + 1n);
    } else {
      assert.equal(now.archived, true);
      assert.equal(BigInt(now.version), BigInt(state.version) + 1n);
    }
    pass('Serialized ' + kind, {
      outcomes: outcomes.map((r) => r.status),
      version: now.version,
      archived: now.archived,
    });
    if (now.archived) await run('restore', await request(created.id, 'restore'));
  }
  // Commit revocation while a real gateway waits for the current account lock.
  const revocationInput = await request(created.id, 'archive');
  const beforeRevocation = await aggregate(created.id);
  await inspect(async (db) => {
    await db.query('BEGIN');
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await context(db);
      await db.query('UPDATE user_accounts SET session_version=session_version+1 WHERE id=$1', [
        Number(admin.user.id),
      ]);
      pending = Promise.allSettled([run('archive', revocationInput)]);
      await waitBlocked(db, 1);
      await db.query('COMMIT');
      assert.equal((await pending)[0]!.status, 'rejected');
    } finally {
      await db.query('ROLLBACK');
      if (pending) await pending;
    }
  });
  assert.deepEqual(await aggregate(created.id), beforeRevocation);
  admin.user.sessionVersion = (
    await runtime.userAccount.findUniqueOrThrow({
      where: { id: Number(admin.user.id) },
      select: { sessionVersion: true },
    })
  ).sessionVersion;
  pass(
    'Committed session revocation wins a real account-lock race without a matter/history transition',
  );
  // A token that expires while waiting must not commit after acquiring the row.
  await inspect(async (db) => {
    await db.query('BEGIN');
    await db.query('SELECT id FROM matters WHERE id=$1 FOR UPDATE', [created.id]);
    const input = await request(created.id, 'archive');
    const pending = Promise.allSettled([
      run('archive', input, { ...admin, expires: new Date(Date.now() + 400).toISOString() }),
    ]);
    try {
      await waitBlocked(db, 1);
      await new Promise((r) => setTimeout(r, 450));
    } finally {
      await db.query('ROLLBACK');
      assert.equal((await pending)[0]!.status, 'rejected');
    }
  });
  pass('Session expiry during a real aggregate lock wait refuses the commit');
  // Both independent archive directions, plus existing matter editing under an archived client.
  const clientReports = await reports();
  const beforeClient = await aggregate(imported.id);
  await setMatterClientArchive(fixture, imported.client_id, true);
  assert.deepEqual(await aggregate(imported.id), beforeClient);
  await edit(imported.id, (await request(imported.id, 'archive')).version, {}, assistant);
  await run('archive', await request(imported.id, 'archive'));
  assert.equal(visibilityDigest(await reports()), visibilityDigest(clientReports));
  await setMatterClientArchive(fixture, imported.client_id, false);
  assert.equal((await readMatterLifecycle(admin, 'restore', imported.id, runtime)).archived, true);
  await setMatterClientArchive(fixture, imported.client_id, true);
  await run('restore', await request(imported.id, 'restore'));
  assert.equal((await readMatter(admin, String(imported.id), runtime))!.clientArchived, true);
  await setMatterClientArchive(fixture, imported.client_id, false);
  assert.equal(visibilityDigest(await reports()), visibilityDigest(clientReports));
  pass(
    'Independent client/matter archive and restore; unchanged nonempty six-report contents, criteria and amounts',
    {
      reportRows: clientReports.map((r) => r.rows.length),
      digest: visibilityDigest(clientReports),
    },
  );
  const all = await readMatters(admin, { archive: 'all' }, runtime),
    active = await readMatters(admin, {}, runtime);
  assert.equal(all.total, active.total);
  await run('archive', await request(empty.id, 'archive'));
  assert.equal((await readMatters(admin, {}, runtime)).total, active.total - 1);
  assert.equal((await readMatters(admin, { archive: 'archived', page: '999' }, runtime)).total, 1);
  const filters = parseMatterFilters({
    archive: 'archived',
    q: 'TEST ONLY',
    page: '8',
    status: 'missing',
    fromClient: '/clients/12?archive=all&page=2',
  });
  assert.equal(
    matterReturnHref(matterDetailHref(empty.id, filters)),
    matterDetailHref(empty.id, filters),
  );
  await run('restore', await request(empty.id, 'restore'));
  assert.equal(
    (await readMatters(admin, { archive: 'archived', page: '999' }, runtime)).rows.length,
    0,
  );
  pass(
    'Explicit archive/current/all filters, paging clamps and independent client-return navigation',
  );
  for (const sql of [
    'ALTER TABLE matters DISABLE TRIGGER zy_matter_lifecycle_guard',
    'ALTER FUNCTION public.matter_lifecycle_save(integer,integer,text,timestamptz,jsonb) SET search_path=public',
  ])
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await assert.rejects(matterLifecycleApplied(db));
      } finally {
        await db.query('ROLLBACK');
      }
    });
  await inspect(async (db) => {
    assert.equal(await matterLifecycleApplied(db), true);
    await assertMatterEditBoundary(db, 'historical-full-state-upgrade');
  });
  pass(
    'Permanent lifecycle checks reject disabled row guard and modified gateway; complete current history remains valid',
  );
  await proveMatterCorrections(fixture, output, runtime, false);
  pass('Fresh R1 effective no-op and R2 six protected-court gateway/row controls at migration65');
}
