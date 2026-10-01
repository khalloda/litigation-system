import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { mutatePoa, readPoaMutation } from '../src/lib/poa-mutations';
import { mutateDocument, readDocumentMutation } from '../src/lib/document-mutations';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { documentReports } from '../src/lib/reports/document-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { validateReportData } from '../src/lib/reports/result';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL,
    out = process.env.TASK6567_EVIDENCE;
  assert.ok(url && out);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const path = join(out, 'document-edge-progress.json');
  assert.ok(!existsSync(path), 'Reconcile prior write outcomes before retry');
  const attempts: { label: string; input: unknown; result?: unknown }[] = [];
  const checks: unknown[] = [];
  const save = () => writeFileSync(path, JSON.stringify({ attempts, checks }, null, 2) + '\n');
  async function execute<T>(label: string, input: unknown, operation: () => Promise<T>) {
    const attempt: (typeof attempts)[number] = { label, input };
    attempts.push(attempt);
    save();
    const result = await operation();
    attempt.result = result;
    save();
    return result;
  }
  const admin = (await lifecycleSessions(db)).find((s) => s.user.role === 'Administrator')!;
  const meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  const snapshot = await readPoaMutation(admin, 'create', null);
  const clientRows = await db.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT id FROM public.clients WHERE NOT is_archived AND poa_location IS NOT NULL
    AND poa_location<>'تم تسليمه للعميل' ORDER BY id LIMIT 1`);
  assert.equal(clientRows.length, 1);
  const client = clientRows[0]!.id;
  const active = snapshot.people.filter((p) => p.active);
  const external = active.find((p) => !p.staff)!;
  assert.ok(external);
  const people = [external, ...active.filter((p) => p.id !== external.id).slice(0, 13)];
  assert.equal(people.length, 14);
  async function report(id: string, fields: Record<string, string> = {}) {
    const d = documentReports.find((r) => r.descriptor.id === id)!;
    const parameters = parseReportInput(
      d.descriptor,
      new URLSearchParams({ format: 'preview', ...fields }),
    ).parameters;
    const data = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return d.query(tx, parameters);
      },
      { isolationLevel: 'RepeatableRead' },
    );
    validateReportData(d.descriptor, data);
    return {
      data,
      columns: d.descriptor.columns,
      rows: data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows)),
    };
  }
  const beforeInventory = await report('poa-inventory');
  const beforeClient = await report('client-poas', { client: String(client) });
  const created: { id: number; version: string; flag: boolean | null; copies: number | null }[] =
    [];
  for (const [i, [flag, copies]] of (
    [
      [true, 0],
      [true, 1],
      [true, 3],
      [true, null],
      [false, 2],
      [null, 0],
    ] as const
  ).entries()) {
    const input = {
      operation: 'create' as const,
      id: null,
      version: null,
      submission: randomUUID(),
      values: {
        client_id: client,
        serial_no: `TEST ONLY TASK6567 POA ${i}\r\n001 / 140J / 140ق`,
        principal_name: 'TEST ONLY TASK6567 أَإِ ثانٍ',
        poa_capacity: i === 0 ? '' : null,
        poa_number: '001 / 1061',
        poa_letter: i === 0 ? null : 'ق',
        poa_year: '0052',
        issuing_authority: 'TEST ONLY',
        issue_date: '2024-02-29',
        copies_count: copies,
        notes: '=TEST ONLY\r\nأَإِ ثانٍ\r\n0 / 0001',
        show_on_poa_report: flag,
      },
      lawyers: i === 0 ? people.map((p) => p.id) : [],
      facts: null,
    };
    const result = await execute(`create-poa-${i}`, input, () =>
      mutatePoa(admin, 'create', input, meta()),
    );
    created.push({ ...result, flag, copies });
  }
  const afterInventory = await report('poa-inventory');
  const afterClient = await report('client-poas', { client: String(client) });
  assert.equal(afterInventory.rows.length - beforeInventory.rows.length, 4);
  assert.equal(afterClient.rows.length - beforeClient.rows.length, 4);
  for (const record of created) {
    for (const result of [afterInventory, afterClient]) {
      const row = result.rows.find((r) => r.id === `poa:${record.id}`);
      assert.equal(Boolean(row), record.flag === true);
      if (row) assert.equal(row.highlight, record.copies === 0 ? 'attention' : undefined);
    }
    const card = await report('poa-movement-card', { poa: String(record.id) });
    assert.equal(card.rows.length, 1);
    const copies = card.rows[0]!.cells[card.columns.findIndex((c) => c.key === 'copies')];
    assert.deepEqual(
      copies,
      record.copies === null ? { type: 'null' } : { type: 'integer', value: String(record.copies) },
    );
  }
  const first = created[0]!;
  const card = await report('poa-movement-card', { poa: String(first.id) });
  assert.deepEqual(card.rows[0]!.cells[card.columns.findIndex((c) => c.key === 'lawyers')], {
    type: 'text',
    value: people.map((p) => p.name).join('\n'),
  });
  const edit = await readPoaMutation(admin, 'update', first.id);
  const clear = {
    operation: 'update',
    id: first.id,
    version: edit.record!.version,
    submission: randomUUID(),
    values: { poa_number: null, poa_year: null, issuing_authority: null, notes: '' },
    lawyers: [],
    facts: null,
  };
  await execute('clear-native-poa-current-fields', clear, () =>
    mutatePoa(admin, 'update', clear, meta()),
  );
  const cleared = await report('poa-movement-card', { poa: String(first.id) });
  for (const key of ['number', 'year', 'issuer', 'sourceLawyers'])
    assert.deepEqual(cleared.rows[0]!.cells[cleared.columns.findIndex((c) => c.key === key)], {
      type: 'null',
    });
  assert.deepEqual(cleared.rows[0]!.cells[cleared.columns.findIndex((c) => c.key === 'notes')], {
    type: 'text',
    value: '',
  });
  const archive = await readPoaMutation(admin, 'archive', first.id);
  const archiveInput = {
    operation: 'archive',
    id: first.id,
    version: archive.record!.version,
    submission: randomUUID(),
    values: {},
    lawyers: null,
    facts: archive.facts,
  };
  await execute('archive-native-poa', archiveInput, () =>
    mutatePoa(admin, 'archive', archiveInput, meta()),
  );
  assert.ok((await report('poa-inventory')).rows.some((r) => r.id === `poa:${first.id}`));
  assert.deepEqual(
    (await report('poa-movement-card', { poa: String(first.id) })).data,
    cleared.data,
  );
  checks.push({
    phase: 'poa-flags-counts-members-clear-archive',
    client,
    created,
    namedLawyers: people.map((p) => ({ id: p.id, staff: p.staff })),
  });
  save();

  const docsBefore = await report('document-inventory');
  const docs: { id: number; version: string }[] = [];
  for (let i = 0; i < 2; i++) {
    const input = {
      operation: 'create',
      id: null,
      version: null,
      submission: randomUUID(),
      values: {
        client_id: client,
        matter_id: null,
        responsible_person_id: active.find((p) => p.staff)!.id,
        description: `TEST ONLY TASK6567 document ${i}\r\n001 / 140J / 140ق\r\nأَإِ ثانٍ`,
        document_date: '2024-02-29',
        deposit_date: i === 0 ? null : '2026-10-01',
        page_count: i === 0 ? 0 : null,
        storage_location: 'TEST ONLY',
        movement_card: '=TEST ONLY descriptive reference',
        notes: '=TEST ONLY\r\n0001',
        mfiles_id: '=1+1',
      },
      related: null,
      facts: null,
    };
    docs.push(
      await execute(`create-document-${i}`, input, () =>
        mutateDocument(admin, 'create', input, meta()),
      ),
    );
  }
  assert.equal((await report('document-inventory')).rows.length - docsBefore.rows.length, 2);
  for (const [i, document] of docs.entries()) {
    const result = await report('document-movement-card', { document: String(document.id) });
    assert.equal(result.rows.length, 1);
    const cell = (key: string) =>
      result.rows[0]!.cells[result.columns.findIndex((c) => c.key === key)];
    assert.deepEqual(cell('pages'), i === 0 ? { type: 'integer', value: '0' } : { type: 'null' });
    assert.deepEqual(cell('serial'), { type: 'null' });
    assert.deepEqual(cell('mfiles'), { type: 'identifier', value: '=1+1' });
    const state = await readDocumentMutation(admin, 'archive', document.id);
    const input = {
      operation: 'archive',
      id: document.id,
      version: state.record!.version,
      submission: randomUUID(),
      values: {},
      related: null,
      facts: state.record!.facts,
    };
    await execute(`archive-document-${i}`, input, () =>
      mutateDocument(admin, 'archive', input, meta()),
    );
    assert.deepEqual(
      (await report('document-movement-card', { document: String(document.id) })).data,
      result.data,
    );
    assert.ok(
      (await report('client-documents', { client: String(client) })).rows.some(
        (r) => r.id === `document:${document.id}`,
      ),
    );
  }
  checks.push({ phase: 'native-documents-null-zero-literal-fields-archive', docs });
  save();
  writeFileSync(
    join(out, 'document-edge-proof.json'),
    JSON.stringify({ status: 'PASS', attempts, checks }, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log('PASS native document/POA report edges; exact writes ' + attempts.length);
}
main()
  .finally(() => db.$disconnect())
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
