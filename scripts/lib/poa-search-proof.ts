import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '../../src/generated/prisma/client';
import type { IsolatedPostgres } from './isolated-postgres-fixture';
import { withApprovedMigrationClient } from './migration-principal';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { mutatePoa } from '../../src/lib/poa-mutations';
import { readPoa, readPoas } from '../../src/lib/poa-query';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import type { ClientSearchParams } from '../../src/lib/client-query';

/** Independent in-memory D29 search oracle; never imports production predicates. */
function normal(value: unknown) {
  const from = 'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    to = 'ااااهيوي01234567890123456789';
  return String(value ?? '')
    .replace(/[ًٌٍَُِّْـٰ ]/gu, '')
    .replace(/[أإآٱةىؤئ٠-٩۰-۹]/gu, (c) => to.charAt(from.indexOf(c)))
    .toLowerCase();
}
export async function provePoaSearch(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  output: string,
) {
  const sessions = await lifecycleSessions(runtime),
    admin = sessions.find((s) => s.user.role === 'Administrator')!;
  const controls = [];
  for (const values of [
    { principal_name: 'TEST ONLY Ω control', poa_number: null },
    { principal_name: 'TEST ONLY أحمد ١٤٠ق', poa_number: '140J' },
    {
      principal_name: 'TEST ONLY literal % _ \\',
      poa_number: 'notnumeric',
      poa_year: 'A/B',
      serial_no: 'A',
      issue_date: '0001-01-01',
    },
  ]) {
    controls.push(
      await mutatePoa(
        admin,
        'create',
        {
          operation: 'create',
          id: null,
          version: null,
          submission: randomUUID(),
          values,
          lawyers: [],
          facts: null,
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      ),
    );
  }
  const state = await withApprovedMigrationClient(
    async (db) => ({
      poas: (
        await db.query('SELECT to_jsonb(p) value FROM powers_of_attorney p ORDER BY id DESC')
      ).rows.map((r) => r.value),
      clients: (await db.query('SELECT id,name_ar,full_name,name_en FROM clients')).rows,
      people: (await db.query('SELECT id,name_ar,is_active,is_staff FROM people')).rows,
      aliases: (await db.query('SELECT person_id,alias_ar,is_retired FROM person_name_alias')).rows,
      links: (await db.query('SELECT * FROM power_of_attorney_lawyers ORDER BY id')).rows,
    }),
    { databaseUrl: fixture.migrationUrl },
  );
  const results: unknown[] = [];
  const all = async (params: ClientSearchParams, session = admin) => {
    const first = await readPoas(session, params, runtime),
      rows = [...first.rows];
    for (let page = 2; page <= first.pages; page++)
      rows.push(...(await readPoas(session, { ...params, page: String(page) }, runtime)).rows);
    assert.equal(rows.length, first.total);
    return rows;
  };
  for (const session of sessions) {
    const actual = await all({ archive: 'all' }, session);
    assert.deepEqual(
      actual.map((r) => r.id),
      state.poas.map((p) => p.id),
    );
    for (const r of actual) {
      const p = state.poas.find((p) => p.id === r.id)!;
      assert.equal(r.principal, p.principal_name);
      assert.equal(r.sourceClient, p.client_name);
      assert.equal(r.sourceLawyers, p.legacy_lawyers_raw);
      assert.equal(r.copies, p.copies_count);
      assert.equal(r.report, p.show_on_poa_report);
      assert.equal(r.clientId, p.client_id);
      assert.deepEqual(
        r.lawyers.map((l) => l.id).sort((a, b) => a - b),
        state.links.filter((l) => l.power_of_attorney_id === p.id).map((l) => l.id),
      );
    }
    results.push({ role: session.user.role, allIds: actual.map((r) => r.id) });
  }
  const searchFields = [
    'principal_name',
    'poa_capacity',
    'poa_number',
    'poa_letter',
    'poa_year',
    'serial_no',
    'issuing_authority',
    'notes',
    'client_name',
    'legacy_lawyers_raw',
  ];
  for (const q of [
    'أحمد',
    'احمد',
    'أَحْمَد',
    '140J',
    '140ق',
    'JTI',
    '%',
    '_',
    '\\',
    String(controls[0]!.id),
    '0' + controls[0]!.id,
    String(controls[0]!.id) + 'x',
    String(controls[0]!.id).slice(0, -1),
    String(controls[0]!.id).replace(/\d/gu, (d) => '٠١٢٣٤٥٦٧٨٩'.charAt(Number(d))),
    String(controls[0]!.id).replace(/\d/gu, (d) => '۰۱۲۳۴۵۶۷۸۹'.charAt(Number(d))),
  ]) {
    const expected = state.poas
      .filter((p) => {
        const client = state.clients.find((c) => c.id === p.client_id),
          fields = [
            ...searchFields.map((f) => p[f]),
            [p.poa_number, p.poa_letter, p.poa_year].filter((v) => v !== null).join(' / '),
            client?.name_ar,
            client?.full_name,
            client?.name_en,
          ];
        for (const link of state.links.filter(
          (l) =>
            l.power_of_attorney_id === p.id &&
            (!l.is_retired || l.legacy_source_record_key !== null),
        )) {
          fields.push(
            state.people.find((person) => person.id === link.person_id)?.name_ar,
            ...state.aliases
              .filter((a) => a.person_id === link.person_id && !a.is_retired)
              .map((a) => a.alias_ar),
          );
        }
        return (
          String(p.id) === normal(q) ||
          fields.some((f) => f !== null && f !== undefined && normal(f).includes(normal(q)))
        );
      })
      .map((p) => p.id);
    assert.deepEqual(
      (await all({ q, archive: 'all' })).map((r) => r.id),
      expected,
      q,
    );
    results.push({ query: q, expectedIds: expected });
  }
  for (const p of state.poas) {
    const detail = await readPoa(admin, String(p.id), runtime);
    assert.ok(detail);
    for (const [key, column] of [
      ['principal', 'principal_name'],
      ['capacity', 'poa_capacity'],
      ['number', 'poa_number'],
      ['letter', 'poa_letter'],
      ['year', 'poa_year'],
      ['serial', 'serial_no'],
      ['issuer', 'issuing_authority'],
      ['issueDate', 'issue_date'],
      ['notes', 'notes'],
    ] as const)
      assert.equal(detail[key], p[column]);
  }
  for (const copies of ['all', 'zero', 'positive', 'unknown'])
    for (const report of ['all', 'shown', 'hidden', 'unknown']) {
      const expected = state.poas
        .filter(
          (p) =>
            (copies === 'all' ||
              (copies === 'unknown'
                ? p.copies_count === null
                : copies === 'zero'
                  ? p.copies_count === 0
                  : p.copies_count > 0)) &&
            (report === 'all' ||
              (report === 'unknown'
                ? p.show_on_poa_report === null
                : p.show_on_poa_report === (report === 'shown'))),
        )
        .map((p) => p.id);
      assert.deepEqual(
        (await all({ copies, report, archive: 'all' })).map((r) => r.id),
        expected,
      );
      results.push({ copies, report, expectedIds: expected });
    }
  writeFileSync(
    join(output, 'independent-search-results.json'),
    JSON.stringify(
      { nativeControlIds: controls.map((r) => r.id), population: state.poas.length, results },
      null,
      2,
    ),
  );
  console.log(
    'PASS independent complete four-role sets, all detail fields, normalization/literals/exact IDs and 16 filter intersections',
  );
}
