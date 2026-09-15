import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../../src/generated/prisma/client';
import type { IsolatedPostgres } from './isolated-postgres-fixture';
import { withApprovedMigrationClient } from './migration-principal';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { adminEditState } from './admin-edit-state';
import { assertPoaEditBoundary } from './poa-edit-checkpoint';
import { mutatePoa, readPoaMutation } from '../../src/lib/poa-mutations';
import { readPoa, readPoas, parsePoaFilters } from '../../src/lib/poa-query';
import { parsePoaInput, type PoaInput } from '../../src/lib/poa-mutation-input';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { setHumanAuditContext } from '../../src/lib/audit';
import { setMatterClientArchive } from '../test-matter-read-only';

export async function provePoaImplementation(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  output: string,
) {
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(fn, { databaseUrl: fixture.migrationUrl });
  const sessions = await lifecycleSessions(runtime),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  assert.ok(admin && assistant);
  const results: unknown[] = [];
  const pass = (name: string, detail: unknown = {}) => {
    results.push({ name, detail });
    writeFileSync(join(output, 'behavior-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const run = (input: PoaInput, session: Session | null = admin) =>
    mutatePoa(session, input.operation, input, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const draft = (): PoaInput => ({
    operation: 'create',
    id: null,
    version: null,
    submission: randomUUID(),
    values: { principal_name: 'TEST ONLY POA', copies_count: 0, show_on_poa_report: null },
    lawyers: [],
    facts: null,
  });
  const beforeRead = await inspect(adminEditState);
  for (const session of sessions) {
    const all = await readPoas(session, {}, runtime);
    assert.equal(all.total, 752);
    assert.equal(all.rows.length, 25);
    assert.equal(all.pages, 31);
    assert.equal(new Set(all.rows.map((r) => r.id)).size, 25);
  }
  const independent = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,client_id,copies_count,show_on_poa_report FROM powers_of_attorney ORDER BY id DESC',
        )
      ).rows,
  );
  const seen: number[] = [];
  for (let page = 1; page <= 31; page++)
    seen.push(...(await readPoas(admin, { page: String(page) }, runtime)).rows.map((r) => r.id));
  assert.deepEqual(
    seen,
    independent.map((r) => r.id),
  );
  for (const [key, value, expected] of [
    ['copies', 'zero', 113],
    ['copies', 'unknown', 8],
    ['copies', 'positive', 631],
    ['report', 'shown', 697],
    ['report', 'hidden', 55],
    ['report', 'unknown', 0],
    ['client', 'missing', 1],
  ] as const) {
    const result = await readPoas(admin, { [key]: value }, runtime);
    assert.equal(result.total, expected);
    pass('real filter ' + key + '=' + value, { expected });
  }
  for (const params of [
    { page: '0' },
    { page: '1.5' },
    { client: '-1' },
    { copies: 'false' },
    { archive: 'deleted' },
    { q: ['a', 'b'] },
    { unknown: 'x' },
  ])
    assert.throws(() => parsePoaFilters(params));
  assert.equal(await readPoa(admin, '-1', runtime), null);
  assert.equal((await readPoas(admin, { page: '2147483647' }, runtime)).filters.page, 31);
  assert.deepEqual(await inspect(adminEditState), beforeRead);
  pass(
    'all four roles read all 752 identities with stable pages; filters and malformed reads have zero database/sequence effects',
  );

  const direct = (input: unknown, session = admin) =>
    runtime.$transaction(async (tx) => {
      await setHumanAuditContext(tx, Number(session.user.id), createMaintenanceAuditMetadata());
      return tx.$queryRawUnsafe(
        'SELECT public.poa_edit_save($1::integer,$2::integer,$3::text,$4::timestamptz,$5::jsonb)',
        Number(session.user.id),
        session.user.sessionVersion,
        session.user.role,
        session.expires,
        JSON.stringify(input),
      );
    });
  const denied = await inspect(adminEditState);
  for (const session of sessions.filter(
    (s) => !['Administrator', 'Litigation Assistant'].includes(s.user.role),
  )) {
    for (const operation of ['create', 'update', 'archive', 'restore'] as const) {
      await assert.rejects(
        readPoaMutation(session, operation, operation === 'create' ? null : 1, runtime),
      );
      await assert.rejects(run({ ...draft(), operation }, session));
    }
    await assert.rejects(direct(draft(), session));
  }
  for (const session of [
    null,
    { ...admin, expires: '2000-01-01T00:00:00Z' },
    { ...admin, user: { ...admin.user, sessionVersion: admin.user.sessionVersion + 1 } },
    { ...admin, user: { ...admin.user, role: 'Paralegal' as const } },
  ])
    await assert.rejects(run(draft(), session));
  for (const values of [
    { principal_name: ' ' },
    { principal_name: 'x', legacy_id: 1 },
    { principal_name: 'x', copies_count: -1 },
    { principal_name: 'x', copies_count: 1.5 },
    { principal_name: 'x', show_on_poa_report: 'true' },
    { principal_name: 'x', issue_date: '2026-02-29' },
    { principal_name: 'x', client_id: 0 },
    { principal_name: 'x'.repeat(10001) },
  ]) {
    const request = { ...draft(), values };
    assert.throws(() => parsePoaInput('create', request));
    await assert.rejects(direct(request));
  }
  for (const request of [
    { ...draft(), actor: 1 },
    { ...draft(), lawyers: [1, 1] },
    { ...draft(), values: { principal_name: 'x', client_name: 'invented' } },
  ]) {
    assert.throws(() => parsePoaInput('create', request));
    await assert.rejects(direct(request));
  }
  for (const table of ['powers_of_attorney', 'power_of_attorney_lawyers'])
    for (const sql of [
      `DELETE FROM ${table} WHERE false`,
      `UPDATE ${table} SET id=id WHERE false`,
      `TRUNCATE ${table}`,
    ])
      await assert.rejects(runtime.$executeRawUnsafe(sql));
  assert.deepEqual(await inspect(adminEditState), denied);
  pass('role/session/malformed/direct SQL denials preserve complete state and every sequence');

  const input = draft(),
    created = await run(input, assistant);
  assert.equal(created.version, '1');
  assert.equal(created.changed, true);
  const saved = await inspect(adminEditState);
  assert.deepEqual(await run(input, assistant), created);
  assert.deepEqual(await inspect(adminEditState), saved);
  await assert.rejects(run(input, admin));
  await assert.rejects(
    run({ ...input, values: { ...input.values, notes: 'different' } }, assistant),
  );
  assert.deepEqual(await inspect(adminEditState), saved);
  pass('assistant creation, exact retry and cross-actor/payload receipt rejection');
  const id = created.id;
  const update = (
    values: PoaInput['values'],
    version: string,
    lawyers: number[] | null = null,
  ): PoaInput => ({
    operation: 'update',
    id,
    version,
    submission: randomUUID(),
    values,
    lawyers,
    facts: null,
  });
  const noOp = update({}, '1');
  assert.equal((await run(noOp)).changed, false);
  assert.deepEqual(await inspect(adminEditState), saved);
  const snap = await readPoaMutation(admin, 'update', id, runtime),
    external = snap.people.find((p) => p.active && !p.staff)!,
    internal = snap.people.find((p) => p.active && p.staff)!;
  assert.ok(external && internal);
  const changed = await run(
    update(
      {
        notes: 'TEST ONLY\ncomplete multiline 140J / 140ق',
        copies_count: null,
        show_on_poa_report: false,
      },
      '1',
      [external.id, internal.id],
    ),
  );
  assert.equal(changed.version, '2');
  let current = await readPoaMutation(admin, 'update', id, runtime);
  assert.equal(current.record?.values.copies_count, null);
  assert.equal(current.record?.values.show_on_poa_report, false);
  assert.deepEqual(
    current.lawyers.map((l) => l.personId),
    [external.id, internal.id],
  );
  await assert.rejects(run(update({ notes: 'stale' }, '1')));
  await run(update({}, '2', [internal.id]));
  current = await readPoaMutation(admin, 'update', id, runtime);
  assert.equal(current.lawyers.find((l) => l.personId === external.id)?.retired, true);
  const order = current.lawyers.find((l) => l.personId === external.id)?.order;
  await run(update({}, '3', [internal.id, external.id]));
  current = await readPoaMutation(admin, 'update', id, runtime);
  assert.equal(current.lawyers.find((l) => l.personId === external.id)?.order, order);
  assert.equal(current.lawyers.length, 2);
  pass(
    'current internal/external membership retirement and re-add retain identity/order; stale edits rejected',
  );
  const importedId = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT power_of_attorney_id id FROM power_of_attorney_lawyers WHERE legacy_source_record_key IS NOT NULL ORDER BY id LIMIT 1',
        )
      ).rows[0].id as number,
  );
  const imported = await readPoaMutation(admin, 'update', importedId, runtime);
  await run({ ...update({}, imported.record!.version, []), id: importedId });
  const retired = await readPoaMutation(admin, 'update', importedId, runtime);
  assert.ok(retired.lawyers.every((l) => l.original && l.retired));
  assert.equal(retired.record?.sourceLawyers, imported.record?.sourceLawyers);
  assert.equal(retired.record?.sourceClient, imported.record?.sourceClient);
  pass('retiring reviewed imported memberships preserves full original evidence');
  const lifecycle = async (operation: 'archive' | 'restore'): Promise<PoaInput> => {
    const s = await readPoaMutation(admin, operation, id, runtime);
    return {
      operation,
      id,
      version: s.record!.version,
      submission: randomUUID(),
      values: {},
      lawyers: null,
      facts: s.facts,
    };
  };
  const archive = await lifecycle('archive');
  await assert.rejects(run(archive, assistant));
  await assert.rejects(run({ ...archive, facts: { ...archive.facts, copies: 999 } }));
  await run(archive);
  assert.equal((await readPoa(admin, String(id), runtime))?.archived, true);
  await assert.rejects(run(update({ notes: 'blocked' }, String(Number(archive.version) + 1))));
  const repeatArchive = await lifecycle('archive'),
    beforeNoop = await inspect(adminEditState);
  assert.equal((await run(repeatArchive)).changed, false);
  assert.deepEqual(await inspect(adminEditState), beforeNoop);
  await run(await lifecycle('restore'));
  assert.equal((await readPoa(admin, String(id), runtime))?.archived, false);
  pass(
    'Administrator lifecycle, confirmation drift, archived edit rejection and exact lifecycle no-op',
  );
  const raceState = await readPoaMutation(admin, 'update', id, runtime);
  const race = await Promise.allSettled([
    run(update({ notes: 'TEST ONLY race A' }, raceState.record!.version)),
    run(update({ notes: 'TEST ONLY race B' }, raceState.record!.version)),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(race.filter((r) => r.status === 'rejected').length, 1);
  const retry = draft(),
    dupe = await Promise.all([run(retry), run(retry)]);
  assert.deepEqual(dupe[0], dupe[1]);
  pass('simultaneous writes have one winner; identical concurrent creation has one identity');
  const parent = snap.clients.find((c) => c.active)!;
  current = await readPoaMutation(admin, 'update', id, runtime);
  await run(update({ client_id: parent.id }, current.record!.version));
  await setMatterClientArchive(fixture, parent.id, true);
  current = await readPoaMutation(admin, 'update', id, runtime);
  const locked = await inspect(adminEditState);
  const blockedValues: PoaInput['values'][] = [
    { client_id: null },
    { notes: 'blocked' },
    { client_id: snap.clients.find((c) => c.active && c.id !== parent.id)!.id },
  ];
  for (const values of blockedValues)
    await assert.rejects(run(update(values, current.record!.version)));
  await assert.rejects(run(await lifecycle('archive')));
  assert.deepEqual(await inspect(adminEditState), locked);
  await setMatterClientArchive(fixture, parent.id, false);
  pass('archived current client blocks edit, clearing, relinking and archive with zero effects');
  for (const actor of [admin, assistant]) {
    const values: PoaInput['values'] = {
      client_id: parent.id,
      serial_no: 'TEST ONLY A/ب',
      principal_name: 'TEST ONLY أحمد\r\n  second  ',
      poa_capacity: 'TEST ONLY\ncapacity',
      poa_number: 'duplicate TEST ONLY',
      poa_letter: 'أ/B',
      poa_year: 'A/B',
      issuing_authority: 'TEST ONLY issuer',
      issue_date: '0001-01-01',
      copies_count: 2147483647,
      notes: 'TEST ONLY\r\n  exact  ',
      show_on_poa_report: true,
    };
    const request = { ...draft(), values },
      native = await run(request, actor);
    const first = await readPoaMutation(actor, 'update', native.id, runtime);
    assert.deepEqual(first.record!.values, values);
    assert.equal(first.record!.sourceClient, null);
    assert.equal(first.record!.sourceLawyers, null);
    const cleared = Object.fromEntries(Object.keys(values).map((key) => [key, null]));
    await run({ ...update(cleared, native.version), id: native.id }, actor);
    assert.deepEqual(
      (await readPoaMutation(actor, 'update', native.id, runtime)).record!.values,
      cleared,
    );
    const last = await run(
      { ...update({ notes: '', issue_date: '9999-12-31', copies_count: 1 }, '2'), id: native.id },
      actor,
    );
    const exact = await inspect(adminEditState);
    assert.deepEqual(await run(request, actor), native);
    assert.deepEqual(await inspect(adminEditState), exact);
    assert.equal(
      (await readPoaMutation(actor, 'update', native.id, runtime)).record!.values.notes,
      '',
    );
    assert.equal(last.version, '3');
  }
  const source = await readPoa(admin, String(importedId), runtime);
  assert.ok(source);
  for (const clientId of [null, parent.id]) {
    const state = await readPoaMutation(admin, 'update', importedId, runtime);
    await run({ ...update({ client_id: clientId }, state.record!.version), id: importedId });
    for (const actor of sessions) {
      const detail = await readPoa(actor, String(importedId), runtime);
      assert.equal(detail!.clientId, clientId);
      assert.equal(detail!.clientName, clientId === null ? null : parent.name);
      assert.equal(detail!.sourceClient, source.sourceClient);
      assert.equal(detail!.sourceLawyers, source.sourceLawyers);
      assert.ok(detail!.lawyers.every((lawyer) => lawyer.original && lawyer.retired));
    }
  }
  pass(
    'both writers exact all-field/date/text/NULL/empty round trips and owned retry after later edits; all readers distinguish cleared/replaced current client from imported evidence',
  );
  await inspect((db) => assertPoaEditBoundary(db, 'historical-full-state-upgrade'));
  pass('complete original boundary and current history replay after all successful mutations');
}
