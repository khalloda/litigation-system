import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClientBase } from 'pg';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateHearing, readHearingMutation } from '../../src/lib/hearing-mutations';
import {
  mutateHearingLifecycle,
  readHearingLifecycle,
  type HearingLifecycleAction,
} from '../../src/lib/hearing-lifecycle';
import {
  readHearing,
  readHearings,
  hearingHistoricalCountQuery,
  parseHearingFilters,
  hearingListHref,
} from '../../src/lib/hearing-query';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { staffReadOnlyState } from './staff-read-only-state';
import { matterMigrationCatalog } from './matter-migration-delta';
import { assertHearingLifecycleBoundary } from './hearing-lifecycle-checkpoint';
import { setHearingParentArchive } from '../test-hearing-read-only';
import { setMatterClientArchive } from '../test-matter-read-only';
import { loadReports } from './gate4-database';
import { prepareHearingLifecycleActors } from './hearing-lifecycle-actors';
import { proveHearingLifecycleAdversarial } from './hearing-lifecycle-adversarial';

export async function proveHearingLifecycle(
  fixture: IsolatedPostgres,
  output: string,
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
  const evidence: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    evidence.push({ name, details });
    writeFileSync(join(output, 'lifecycle-results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS ' + name);
  };
  const exact = (a: unknown, b: unknown, label: string) =>
    assert.ok(JSON.stringify(a) === JSON.stringify(b), label);
  const allState = async () => ({
    rows: await inspect(staffReadOnlyState),
    catalog: await inspect(matterMigrationCatalog),
  });
  if (process.argv.includes('--retention-only')) {
    await prepareHearingLifecycleActors(fixture, runtime);
    const { proveHearingLifecycleRetention } = await import('./hearing-lifecycle-retention');
    try {
      await proveHearingLifecycleRetention(fixture, runtime, pass);
    } finally {
      await runtime.$disconnect();
    }
    return;
  }
  if (process.argv.includes('--supplement') || process.argv.includes('--browser-only')) {
    await prepareHearingLifecycleActors(fixture, runtime);
    const admin = (await lifecycleSessions(runtime)).find((s) => s.user.role === 'Administrator')!;
    const choices = await readHearingMutation(admin, 'create', null, runtime);
    const person = choices.people.find((p) => p.active)!;
    const dependencies = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
    const created = await mutateHearing(
      admin,
      'create',
      {
        id: null,
        version: null,
        submission: randomUUID(),
        values: {
          matter_id: null,
          hearing_date: '2026-09-13',
          decision: 'TEST ONLY supplementary lifecycle',
        },
        attendees: [{ id: null, person_id: person.id }],
      },
      dependencies,
    );
    await mutateHearing(
      admin,
      'update',
      {
        id: created.id,
        version: created.version,
        submission: randomUUID(),
        values: {},
        attendees: [],
      },
      dependencies,
    );
    try {
      if (!process.argv.includes('--browser-only'))
        await proveHearingLifecycleAdversarial(fixture, created.id, pass, runtime);
      if (process.argv.includes('--browser')) {
        const { proveHearingBrowser } = await import('../test-hearing-browser.mjs');
        const { hearingLifecycleBrowserProof } =
          await import('./hearing-lifecycle-browser-proof.mjs');
        await proveHearingBrowser(
          fixture,
          output,
          (
            context: Record<
              | 'page'
              | 'context'
              | 'accounts'
              | 'login'
              | 'goto'
              | 'audit'
              | 'screenshot'
              | 'evidence'
              | 'inspect'
              | 'runtime',
              unknown
            >,
          ) => hearingLifecycleBrowserProof({ ...context, createdId: created.id }),
          { preserveAccounts: true },
        );
      }
    } finally {
      await runtime.$disconnect();
    }
    return;
  }
  try {
    await prepareHearingLifecycleActors(fixture, runtime);
    const sessions = await lifecycleSessions(runtime),
      admin = sessions.find((s) => s.user.role === 'Administrator')!;
    assert.ok(admin);
    const dependencies = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
    const edit = (id: number, version: string, values: Record<string, unknown> = {}) => ({
      id,
      version,
      values,
      submission: randomUUID(),
    });
    const input = async (id: number, action: HearingLifecycleAction) => {
      const s = await readHearingLifecycle(admin, action, id, runtime);
      return {
        id,
        confirmation: id,
        version: s.version,
        facts: s.facts,
        action,
        submission: randomUUID(),
      };
    };
    const run = (action: HearingLifecycleAction, v: unknown, actor: Session | null = admin) =>
      mutateHearingLifecycle(actor, action, v, dependencies);
    const transition = async (id: number, action: HearingLifecycleAction) =>
      run(action, await input(id, action));
    const retained = async (id: number) =>
      inspect(async (db) => ({
        hearing: (
          await db.query(
            "SELECT to_jsonb(h)-ARRAY['row_version','is_archived','updated_at','updated_by'] value FROM hearings h WHERE id=$1",
            [id],
          )
        ).rows,
        attendees: (
          await db.query(
            'SELECT to_jsonb(a) value FROM hearing_attendees a WHERE hearing_id=$1 ORDER BY id',
            [id],
          )
        ).rows,
      }));
    const created = await mutateHearing(
      admin,
      'create',
      {
        id: null,
        version: null,
        submission: randomUUID(),
        values: {
          matter_id: null,
          hearing_date: '2026-09-13',
          decision: 'TEST ONLY lifecycle native',
        },
        attendees: [],
      },
      dependencies,
    );
    const id = created.id;
    const archive = await input(id, 'archive'),
      before = await retained(id);
    const changed = await run('archive', archive);
    assert.equal(changed.changed, true);
    assert.equal(changed.version, '2');
    exact(
      await retained(id),
      before,
      'Archive preserves all original hearing and attendance fields',
    );
    const a = await readHearing(admin, String(id), runtime);
    assert.equal(a!.hearingArchived, true);
    await assert.rejects(
      mutateHearing(
        admin,
        'update',
        edit(id, created.version, { notes: 'TEST ONLY stale editor' }),
        dependencies,
      ),
    );
    await assert.rejects(
      mutateHearing(
        admin,
        'update',
        edit(id, changed.version, { notes: 'TEST ONLY archived refusal' }),
        dependencies,
      ),
    );
    const archived = await allState();
    assert.equal((await run('archive', await input(id, 'archive'))).changed, false);
    exact(await allState(), archived, 'Same-state no-op preserves every row/catalog/full sequence');
    assert.deepEqual(await run('archive', archive), changed);
    exact(await allState(), archived, 'Owned retry has zero side effects');
    await assert.rejects(run('restore', { ...archive, action: 'restore' }));
    await transition(id, 'restore');
    const restored = await allState();
    assert.deepEqual(await run('archive', archive), changed);
    exact(await allState(), restored, 'Old archive retry after restore does not replay');
    exact(await retained(id), before, 'Restore preserves native data');
    pass(
      'Native unassigned archive/read-only/restore, stale editor, exact retry after opposite transition and complete no-op state',
    );
    const current = await input(id, 'archive');
    const invalid = [
      { ...current, confirmation: id + 1 },
      { ...current, id: 0 },
      { ...current, version: '0' },
      { ...current, version: '9223372036854775808' },
      { ...current, facts: { ...current.facts, currentAttendees: 1 } },
      { ...current, is_archived: true },
      { ...current, action: 'delete' },
    ];
    const context = async (db: ClientBase, actor = admin) => {
      await db.query('SELECT audit_set_human_context($1)', [Number(actor.user.id)]);
      await db.query(
        "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY lifecycle proof','system')",
        [randomUUID(), randomUUID(), randomUUID()],
      );
    };
    const direct = (db: ClientBase, v: unknown, actor = admin) =>
      db.query('SELECT public.hearing_lifecycle_save($1,$2,$3,$4,$5::jsonb)', [
        Number(actor.user.id),
        actor.user.sessionVersion,
        actor.user.role,
        actor.expires,
        JSON.stringify(v),
      ]);
    const transaction = async (f: (db: ClientBase) => Promise<void>) =>
      inspect(async (db) => {
        await db.query('BEGIN');
        try {
          await context(db);
          await f(db);
        } finally {
          await db.query('ROLLBACK');
        }
      });
    const invalidBefore = await allState();
    for (const v of invalid) {
      await assert.rejects(run('archive', v));
      await transaction(async (db) => {
        await assert.rejects(direct(db, v));
      });
    }
    for (const s of [
      null,
      ...sessions.filter((s) => s.user.role !== 'Administrator'),
      { ...admin, expires: new Date(0).toISOString() },
      { ...admin, user: { ...admin.user, sessionVersion: admin.user.sessionVersion + 1 } },
    ]) {
      await assert.rejects(run('archive', current, s));
      if (s)
        await transaction(async (db) => {
          await assert.rejects(direct(db, current, s));
        });
    }
    await assert.rejects(
      mutateHearing(
        admin,
        'update',
        { ...edit(id, current.version), values: { is_archived: true } },
        dependencies,
      ),
    );
    exact(await allState(), invalidBefore, 'All invalid attempts preserve full state');
    pass(
      'All-role service/direct-gateway denials; forged fields, identities, versions, confirmation counts; expired/revoked claims',
    );
    // Account state mutations use a different copied account inside rollback-only
    // transactions. KHelmy is never the target of an account mutation test.
    const other = sessions.find((s) => s.user.username !== 'KHelmy')!;
    assert.ok(other);
    for (const alteration of [
      'is_enabled=false,session_version=session_version+1',
      'must_change_password=true,session_version=session_version+1',
      "role_code='Lawyer',session_version=session_version+1",
      'session_version=session_version+1',
    ]) {
      await transaction(async (db) => {
        await db.query('UPDATE user_accounts SET ' + alteration + ' WHERE id=$1 AND username<>$2', [
          Number(other.user.id),
          'KHelmy',
        ]);
        await assert.rejects(
          direct(db, current, { ...other, user: { ...other.user, role: 'Administrator' } }),
        );
      });
    }
    pass(
      'Disabled/forced-change/role-change/session-revocation database refusals on non-KHelmy account only',
    );
    for (const target of [
      'audit_events',
      '_migration.hearing_edit_change',
      '_migration.hearing_edit_submission',
    ]) {
      await inspect((db) =>
        db.query(
          `CREATE FUNCTION public.task43_lifecycle_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY lifecycle fault'; END $$; CREATE TRIGGER task43_lifecycle_fault BEFORE INSERT ON ${target} FOR EACH ROW EXECUTE FUNCTION public.task43_lifecycle_fault()`,
        ),
      );
      try {
        const full = await allState();
        await assert.rejects(transition(id, 'archive'));
        exact(await allState(), full, 'Fault rollback includes every full sequence');
      } finally {
        await inspect((db) =>
          db.query(
            `DROP TRIGGER task43_lifecycle_fault ON ${target}; DROP FUNCTION public.task43_lifecycle_fault()`,
          ),
        );
      }
    }
    pass(
      'Audit, history and receipt insertion faults each roll back full business/history/audit/sequence state',
    );
    const snapshot = await input(id, 'archive');
    const race = await Promise.allSettled([
      run('archive', snapshot),
      run('archive', { ...snapshot, submission: randomUUID() }),
    ]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    await transition(id, 'restore');
    const raceInput = await input(id, 'archive');
    const editRace = await Promise.allSettled([
      run('archive', raceInput),
      mutateHearing(
        admin,
        'update',
        edit(id, raceInput.version, { notes: 'TEST ONLY edit race' }),
        dependencies,
      ),
    ]);
    assert.equal(editRace.filter((r) => r.status === 'fulfilled').length, 1);
    if ((await readHearingLifecycle(admin, 'restore', id, runtime)).archived)
      await transition(id, 'restore');
    pass(
      'Concurrent lifecycle submissions and edit-versus-archive produce one winning aggregate version',
    );
    const nativeState = await readHearingMutation(admin, 'update', id, runtime);
    const person = nativeState.people.find((p) => p.active)!;
    const selected = await mutateHearing(
      admin,
      'update',
      { ...edit(id, nativeState.record!.version), attendees: [{ id: null, person_id: person.id }] },
      dependencies,
    );
    const selectedState = await readHearingMutation(admin, 'update', id, runtime);
    const noopBefore = await allState();
    assert.equal(
      (
        await mutateHearing(
          admin,
          'update',
          { ...edit(id, selected.version), attendees: selectedState.attendees },
          dependencies,
        )
      ).changed,
      false,
    );
    exact(await allState(), noopBefore, 'Selection round-trip no-op exact');
    const oldConfirmation = await input(id, 'archive');
    await mutateHearing(
      admin,
      'update',
      { ...edit(id, selected.version), attendees: [] },
      dependencies,
    );
    await assert.rejects(run('archive', oldConfirmation));
    const retired = await retained(id);
    await transition(id, 'archive');
    await transition(id, 'restore');
    exact(await retained(id), retired, 'Retired attendance remains retired');
    pass(
      'Phase2 real attendee edit/selection no-op, changed confirmation count refusal and retired attendance preservation',
    );
    const imported = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT id,matter_id,legacy_id FROM hearings WHERE legacy_id=ANY($1::int[]) ORDER BY id',
            [[7072, 7071, 7237, 7383, 7451, 7073, 7070, 7219, 7351, 7129, 7159, 7382]],
          )
        ).rows,
    );
    if (imported.length) {
      assert.equal(imported.length, 12);
      const special = await inspect(
        async (db) =>
          (
            await db.query(
              `SELECT DISTINCT h.id,h.matter_id FROM hearings h LEFT JOIN hearing_attendees a ON a.hearing_id=h.id LEFT JOIN people p ON p.id=a.person_id WHERE h.legacy_id IS NOT NULL AND (h.matter_id IS NULL OR a.person_id IS NULL OR NOT p.is_active OR EXISTS(SELECT 1 FROM hearing_attendees b WHERE b.hearing_id=h.id GROUP BY b.person_id HAVING count(*)>1)) ORDER BY h.id LIMIT 12`,
            )
          ).rows,
      );
      for (const h of [...imported, ...special]) {
        const st = await readHearingLifecycle(admin, 'archive', h.id, runtime);
        if (st.facts.matterArchived) await setHearingParentArchive(fixture, h.matter_id, false);
        const r = await retained(h.id);
        await transition(h.id, 'archive');
        await transition(h.id, 'restore');
        exact(await retained(h.id), r, 'Imported D41/reference retention exact');
      }
      pass(
        'All twelve D41 hearings plus twelve OR-selected historical hearings survive lifecycle unchanged; explicit category proof is separate',
        { protected: 12, special: special.length },
      );
      const linked = imported.find((h) => h.matter_id)!;
      const report = () =>
        inspect(async (db) => {
          await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          try {
            return await loadReports(db);
          } finally {
            await db.query('ROLLBACK');
          }
        });
      const reports = await report();
      assert.ok(reports.some((d) => d.rows.length > 0));
      const total = (await readHearings(admin, { archive: 'all' }, runtime)).total;
      assert.ok(total >= 13382);
      const historic = await runtime.$queryRaw(
        hearingHistoricalCountQuery(parseHearingFilters({})),
      );
      await transition(linked.id, 'archive');
      assert.equal((await readHearings(admin, {}, runtime)).total, total - 1);
      assert.equal((await readHearings(admin, { archive: 'archived' }, runtime)).total, 1);
      exact(
        await runtime.$queryRaw(hearingHistoricalCountQuery(parseHearingFilters({}))),
        historic,
        'Historical hearing count unchanged',
      );
      exact(await report(), reports, 'Reporting sources unchanged by hearing archive');
      const parentRequest = await input(linked.id, 'restore');
      await setHearingParentArchive(fixture, linked.matter_id, true);
      await assert.rejects(run('restore', parentRequest));
      assert.ok(await readHearing(admin, String(linked.id), runtime));
      exact(await report(), reports, 'Reports unchanged by parent archive');
      await setHearingParentArchive(fixture, linked.matter_id, false);
      await transition(linked.id, 'restore');
      const client = (
        await inspect(
          async (db) =>
            (await db.query('SELECT client_id FROM matters WHERE id=$1', [linked.matter_id])).rows,
        )
      )[0].client_id;
      if (client) {
        await setMatterClientArchive(fixture, client, true);
        await transition(linked.id, 'archive');
        await transition(linked.id, 'restore');
        await setMatterClientArchive(fixture, client, false);
      }
      exact(await report(), reports, 'Reports after all transitions exact');
      pass(
        'Nonempty operational versus historical/report inclusion; archived parent prerequisite; archived client independent',
        { total, reportDatasets: reports.length },
      );
    }
    const filters = {
      archive: 'all',
      q: 'TEST',
      dateField: 'next',
      from: '2020-01-01',
      to: '2030-01-01',
      matter: '1',
      client: '1',
      court: '1',
      attendee: '1',
      page: '2',
    };
    const parsed = parseHearingFilters(filters);
    assert.deepEqual(
      parseHearingFilters(
        Object.fromEntries(new URL(hearingListHref(parsed), 'http://localhost').searchParams),
      ),
      parsed,
    );
    for (const s of sessions) {
      const read = await readHearings(s, { archive: 'all' }, runtime);
      assert.ok(read.total > 0);
      assert.ok(await readHearing(s, String(id), runtime));
    }
    pass('All-role read access and independent filter round-trip');
    await inspect(assertHearingLifecycleBoundary);
    for (const sql of [
      'ALTER TABLE hearings DISABLE TRIGGER zy_hearing_lifecycle_guard',
      'GRANT EXECUTE ON FUNCTION _migration.hearing_lifecycle_guard() TO litigation_runtime',
      'ALTER TABLE hearings ALTER COLUMN is_archived DROP NOT NULL',
      'DROP INDEX hearings_archive_date_id_idx',
    ]) {
      await transaction(async (db) => {
        await db.query(sql);
        await assert.rejects(assertHearingLifecycleBoundary(db));
      });
    }
    pass(
      'Permanent checker rejects disabled guard, widened grant, weakened archive column and missing index',
    );
    await proveHearingLifecycleAdversarial(fixture, id, pass, runtime);
    await inspect(assertHearingLifecycleBoundary);
    if (process.argv.includes('--browser')) {
      const { proveHearingBrowser } = await import('../test-hearing-browser.mjs');
      const { hearingLifecycleBrowserProof } =
        await import('./hearing-lifecycle-browser-proof.mjs');
      await proveHearingBrowser(
        fixture,
        output,
        (
          context: Record<
            | 'page'
            | 'context'
            | 'accounts'
            | 'login'
            | 'goto'
            | 'audit'
            | 'screenshot'
            | 'evidence'
            | 'inspect'
            | 'runtime',
            unknown
          >,
        ) => hearingLifecycleBrowserProof({ ...context, createdId: id }),
        { preserveAccounts: true },
      );
    }
  } finally {
    await runtime.$disconnect();
  }
}
