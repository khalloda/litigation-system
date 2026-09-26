import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import type { Session } from 'next-auth';
import { createDatabaseClient } from '../src/lib/db';
import { authenticateCredentials } from '../src/lib/auth/service';
import { createSessionClaims } from '../src/lib/auth/session';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { mutateClient, readClientMutation } from '../src/lib/client-mutations';
import { mutateMatter, readMatterMutation } from '../src/lib/matter-mutations';
import { mutateHearing } from '../src/lib/hearing-mutations';
import { readMatterLifecycle, mutateMatterLifecycle } from '../src/lib/matter-lifecycle';
import { readHearingLifecycle, mutateHearingLifecycle } from '../src/lib/hearing-lifecycle';
import { clientMatterReports } from '../src/lib/reports/client-matter-reports';
import { activeClientContacts } from '../src/lib/reports/client-contacts';
import { clientJudgments } from '../src/lib/reports/client-judgments';
import { parseReportInput } from '../src/lib/reports/input';
import { reportSnapshot } from '../src/lib/reports/authority';
import { reportFilterLabels, reportOptions } from '../src/lib/reports/options';
import { renderReportExcel } from '../src/lib/reports/excel';
import { renderReportPdf } from '../src/lib/reports/pdf';
import { validateReportData } from '../src/lib/reports/result';
import type { ReportData, ReportDefinition, ReportResult } from '../src/lib/reports/types';
import { t } from '../src/strings';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

type Journal = {
  client?: number;
  contact?: number;
  matters: Record<string, number>;
  hearings: Record<string, number>;
  operations: unknown[];
  lawyer?: number;
  role?: number;
};
async function main() {
  const out = process.env['TASK51_OUTPUT']!,
    priv = process.env['TASK51_PRIVATE']!;
  const f = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  const journalPath = `${priv}/family-edge-journal.json`;
  const journal: Journal = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, 'utf8'))
    : { matters: {}, hearings: {}, operations: [] };
  const save = () => writeFileSync(journalPath, JSON.stringify(journal, null, 2));
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (c) => {
        await assertIsolatedTestCluster(c, new URL(f.migrationUrl), f.environment);
        return work(c);
      },
      {
        databaseUrl: f.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
  await inspect(async () => undefined);
  const runtime = createDatabaseClient(f.runtimeUrl),
    dependencies = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
  const records: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    records.push({ name, details });
    writeFileSync(`${out}/results.json`, JSON.stringify(records, null, 2));
    console.log('PASS ' + name);
  };
  try {
    const login = JSON.parse(readFileSync(`${priv}/logins.json`, 'utf8')).find(
      (x: { role: string }) => x.role === 'Administrator',
    );
    const user = await authenticateCredentials(login, dependencies);
    assert.ok(user);
    const session: Session = {
      user,
      expires: new Date(createSessionClaims(user).absoluteExpiresAt).toISOString(),
    };
    const defs = [
      activeClientContacts,
      ...clientMatterReports.slice(0, 6),
      clientJudgments,
      ...clientMatterReports.slice(6),
    ];
    const params = (def: ReportDefinition, extra: Record<string, string> = {}) =>
      parseReportInput(
        def.descriptor,
        new URLSearchParams({
          format: 'preview',
          ...(def.descriptor.parameters.client ? { client: String(journal.client) } : {}),
          ...(def.descriptor.parameters.branch ? { branch: 'unassigned' } : {}),
          ...(def.descriptor.id === 'client-judgments'
            ? { from: '0001-01-01', to: '9998-12-31' }
            : {}),
          ...extra,
        }),
      ).parameters;
    const query = (def: ReportDefinition, extra: Record<string, string> = {}) =>
      reportSnapshot(session, runtime, 'run', def.descriptor.permissions, (tx) =>
        def.query(tx, params(def, extra)),
      );
    const rows = (data: ReportData) =>
      data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
    const status = defs.find((d) => d.descriptor.id === 'client-status')!;
    if (process.argv.includes('--setup')) {
      assert.equal(
        journal.client,
        undefined,
        'Setup is one-shot; establish any uncertain outcome before manual resume',
      );
      const refs = await inspect(async (c) => ({
        lawyer: (
          await c.query('SELECT id FROM people WHERE is_staff AND is_active ORDER BY id LIMIT 1')
        ).rows[0].id,
        role: (await c.query('SELECT id FROM lookup_party_role ORDER BY id LIMIT 1')).rows[0].id,
      }));
      journal.lawyer = refs.lawyer;
      journal.role = refs.role;
      save();
      const create = await mutateClient(
        session,
        'client-create',
        {
          submission: randomUUID(),
          name_ar: 'TEST ONLY Task62 edge client',
          name_en: 'TEST ONLY Task62 edge client',
          status: 'Active',
          cash_or_probono: 'Cash',
        },
        dependencies,
      );
      journal.client = create.id;
      journal.operations.push({ operation: 'client-create', result: create });
      save();
      const contact = await mutateClient(
        session,
        'contact-create',
        {
          submission: randomUUID(),
          clientId: String(create.id),
          contact_name: 'TEST ONLY =1+1',
          mobile_phone: '001234\n005678',
        },
        dependencies,
      );
      journal.contact = contact.id;
      journal.operations.push({ operation: 'contact-create', result: contact });
      save();
      for (const [name, businessStatus] of [
        ['blank', t.values.active],
        ['tie', t.values.active],
        ['undated', t.values.active],
        ['no-hearing', t.values.active],
        ['null-status', null],
        ['closed', t.values.closed],
      ] as const) {
        const result = await mutateMatter(
          session,
          'create',
          {
            id: null,
            version: null,
            submission: randomUUID(),
            values: {
              client_id: create.id,
              status: businessStatus,
              case_number_ar: '001-' + name + '\n=1+1\nTEST ONLY',
              subject:
                'TEST ONLY ' +
                name +
                '\n' +
                'long mixed العربية 0001 '.repeat(name === 'tie' ? 50 : 1),
              evaluation: name === 'tie' ? '=SUM(A1:A2)\nTEST ONLY' : name === 'blank' ? '' : null,
            },
            parties:
              name === 'tie'
                ? [
                    {
                      id: null,
                      side: 'client',
                      party_name: 'TEST ONLY current client party',
                      gender: 'f',
                      ordinal: 1,
                      roles: [{ id: null, role_id: refs.role, ordinal: 1 }],
                    },
                    {
                      id: null,
                      side: 'opponent',
                      party_name: 'TEST ONLY opponent\n@literal',
                      gender: 'm',
                      ordinal: 1,
                      roles: [],
                    },
                  ]
                : [],
            lawyers:
              name === 'tie'
                ? [{ id: null, person_id: refs.lawyer, role: 'support', position: 1 }]
                : [],
          },
          dependencies,
        );
        journal.matters[name] = result.id;
        journal.operations.push({ operation: 'matter-create', name, result });
        save();
      }
      const fixtures: [string, string, string | null, string | null, string | null][] = [
        ['blank-jan', 'blank', '2026-01-31', 'TEST ONLY January', 'TEST ONLY unknown outcome'],
        ['blank-sep', 'blank', '2026-09-01', '', 'TEST ONLY unknown outcome'],
        ['tie-old', 'tie', '2024-02-29', 'TEST ONLY equal date older', null],
        [
          'tie-new',
          'tie',
          '2024-02-29',
          'TEST ONLY equal date latest\n' + 'Arabic العربية 0001 '.repeat(40),
          'TEST ONLY unknown outcome',
        ],
        ['undated', 'undated', null, 'TEST ONLY undated', null],
        ['null-status', 'null-status', '2026-09-30', 'TEST ONLY null-status', null],
        ['closed', 'closed', '2026-09-30', 'TEST ONLY closed', null],
      ];
      for (const [name, matter, date, decision, outcome] of fixtures) {
        const result = await mutateHearing(
          session,
          'create',
          {
            id: null,
            version: null,
            submission: randomUUID(),
            values: { matter_id: journal.matters[matter], hearing_date: date, decision, outcome },
          },
          dependencies,
        );
        journal.hearings[name] = result.id;
        journal.operations.push({ operation: 'hearing-create', name, result });
        save();
      }
      pass('native fixtures created through actual restricted runtime gateways', {
        client: journal.client,
        contact: journal.contact,
        matters: journal.matters,
        hearings: journal.hearings,
      });
    }
    assert.ok(journal.client && Object.keys(journal.hearings).length === 7);
    const getIds = async (extra: Record<string, string> = {}) =>
      rows(await query(status, extra)).map((r) => Number(r.id.split(':')[1]));
    const all = await getIds({ extra_status: 'all' });
    assert.deepEqual(new Set(all), new Set(Object.values(journal.matters)));
    const active = await getIds();
    assert.equal(active.length, 4);
    assert.ok(!active.includes(journal.matters['null-status']!));
    assert.ok(!active.includes(journal.matters['closed']!));
    assert.deepEqual(await getIds({ from: '2026-01-01', to: '2026-01-31' }), []);
    assert.deepEqual(await getIds({ from: '2026-09-01', to: '2026-09-30' }), [
      journal.matters.blank,
    ]);
    assert.deepEqual(await getIds({ from: '2024-02-29', to: '2024-02-29' }), [journal.matters.tie]);
    assert.deepEqual(await getIds({ to: '2024-02-29' }), [journal.matters.tie]);
    assert.deepEqual(
      new Set(await getIds({ from: '2024-02-29' })),
      new Set([journal.matters.tie, journal.matters.blank]),
    );
    const complete = rows(await query(status, { extra_status: 'all' }));
    assert.ok(
      complete.find((r) => r.id === 'matter:' + journal.matters.blank)!.cells.at(-1)!.type ===
        'text',
    );
    assert.equal(
      (
        complete.find((r) => r.id === 'matter:' + journal.matters.blank)!.cells.at(-1) as {
          value: string;
        }
      ).value,
      '2026/09/01\n' + t.reports.emptyValue,
    );
    assert.ok(
      (
        complete.find((r) => r.id === 'matter:' + journal.matters.tie)!.cells.at(-1) as {
          value: string;
        }
      ).value.includes('equal date latest'),
    );
    assert.equal(
      (
        complete.find((r) => r.id === 'matter:' + journal.matters['no-hearing'])!.cells.at(-1) as {
          value: string;
        }
      ).value,
      t.clientReports.noHearing,
    );
    assert.ok(
      (
        complete.find((r) => r.id === 'matter:' + journal.matters.undated)!.cells.at(-1) as {
          value: string;
        }
      ).value.startsWith(t.clientReports.undated),
    );
    assert.deepEqual(await getIds({ lawyer: String(journal.lawyer) }), [journal.matters.tie]);
    for (const def of clientMatterReports.slice(0, 6)) {
      const actual = rows(await query(def)),
        ids = actual.map((r) => Number(r.id.split(':')[1]));
      const fixed = ['client-matters', 'client-evaluation'].includes(def.descriptor.id);
      const expected = [
        journal.matters.tie,
        journal.matters.undated,
        ...(fixed ? [] : [journal.matters['null-status'], journal.matters.closed]),
        ...(def.descriptor.id === 'client-branches' ? [journal.matters.blank] : []),
      ];
      assert.deepEqual(new Set(ids), new Set(expected));
      assert.equal(ids.length, new Set(ids).size);
    }
    const judgments = rows(await query(clientJudgments));
    assert.deepEqual(
      judgments.map((r) => r.id),
      [
        'hearing:' + journal.hearings['tie-new'],
        'hearing:' + journal.hearings['blank-jan'],
        'hearing:' + journal.hearings['blank-sep'],
      ],
    );
    assert.ok(
      rows(await query(activeClientContacts)).some((r) => r.id === 'contact:' + journal.contact),
    );
    pass(
      'native/null-status/blank latest/no-hearing/undated/date tie/leap/open bounds and distinct contact/judgment grain',
    );

    if (process.argv.includes('--archive')) {
      const baseline = new Map<string, ReportData>();
      for (const def of defs) baseline.set(def.descriptor.id, await query(def));
      const compare = async (label: string) => {
        for (const def of defs) {
          const data = await query(def);
          assert.deepEqual(data, baseline.get(def.descriptor.id));
        }
        pass(label + ' every ordered typed report/group/total unchanged');
      };
      const outputs = async (label: string) => {
        for (const def of defs) {
          const p = params(def),
            data = await query(def),
            labels = await reportSnapshot(
              session,
              runtime,
              'run',
              def.descriptor.permissions,
              async (tx) =>
                reportFilterLabels(def.descriptor, p, await reportOptions(tx, def.descriptor)),
            );
          const result: ReportResult = {
            descriptor: def.descriptor,
            parameters: p,
            data,
            filterLabels: labels,
            rowCount: validateReportData(def.descriptor, data),
            generatedAt: '2026-09-26T22:30:00.000Z',
            operationId: '00000000-0000-4000-8000-000000000062',
          };
          for (const format of ['xlsx', 'pdf'] as const) {
            const bytes =
              format === 'xlsx'
                ? await renderReportExcel(result)
                : await renderReportPdf(result, session);
            const file = label + '-' + def.descriptor.id + '.' + format;
            writeFileSync(`${out}/${file}`, bytes);
            pass('actual archive comparison file', {
              file,
              bytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            });
          }
          writeFileSync(`${out}/${label}-${def.descriptor.id}.json`, JSON.stringify(result));
        }
      };
      await outputs('before');
      const hearingId = journal.hearings['tie-new']!,
        matterId = journal.matters.tie!,
        clientId = journal.client;
      const hearing = async (action: 'archive' | 'restore') => {
        const s = await readHearingLifecycle(session, action, hearingId, runtime);
        const result = await mutateHearingLifecycle(
          session,
          action,
          {
            id: hearingId,
            confirmation: hearingId,
            version: s.version,
            submission: randomUUID(),
            action,
            facts: s.facts,
          },
          dependencies,
        );
        journal.operations.push({ operation: 'hearing-' + action, result });
        save();
      };
      const matter = async (action: 'archive' | 'restore') => {
        const s = await readMatterLifecycle(session, action, matterId, runtime);
        const result = await mutateMatterLifecycle(
          session,
          action,
          {
            id: matterId,
            confirmation: matterId,
            version: s.version,
            submission: randomUUID(),
            action,
            counts: s.counts,
          },
          dependencies,
        );
        journal.operations.push({ operation: 'matter-' + action, result });
        save();
      };
      const client = async (action: 'archive' | 'restore') => {
        const op = action === 'archive' ? 'client-archive' : 'client-restore';
        const s = await readClientMutation(session, op, String(clientId), null, runtime);
        const result = await mutateClient(
          session,
          op,
          { id: String(clientId), confirmation: String(clientId), version: s.record!.version },
          dependencies,
        );
        journal.operations.push({ operation: 'client-' + action, result });
        save();
      };
      await hearing('archive');
      await compare('hearing archived');
      await matter('archive');
      await compare('matter archived');
      await client('archive');
      await compare('client archived');
      const wrong = { ...baseline.get(status.descriptor.id)!, sections: [] };
      assert.notDeepEqual(wrong, await query(status));
      pass('intentionally wrong archived-client exclusion detected');
      await outputs('archived');
      await client('restore');
      await matter('restore');
      await hearing('restore');
      await compare('all restored');
      pass('actual client/matter/hearing archive and restore through guarded runtime gateways', {
        clientId,
        matterId,
        hearingId,
      });
    }
    if (process.argv.includes('--retire')) {
      const id = journal.matters.tie!,
        s = await readMatterMutation(session, 'update', id, runtime);
      const result = await mutateMatter(
        session,
        'update',
        {
          id,
          version: s.record!.version,
          submission: randomUUID(),
          values: {},
          parties: [],
          lawyers: [],
        },
        dependencies,
      );
      journal.operations.push({ operation: 'retire-current-relations', result });
      save();
      assert.deepEqual(await getIds({ lawyer: String(journal.lawyer) }), []);
      const row = rows(await query(status)).find((r) => r.id === 'matter:' + id)!;
      assert.deepEqual(row.cells[2], { type: 'null' });
      assert.deepEqual(row.cells[3], { type: 'null' });
      pass('retired parties/capacities/lawyer excluded without source fallback');
    }
    writeFileSync(
      `${out}/fixture-identities.json`,
      JSON.stringify(
        {
          client: journal.client,
          contact: journal.contact,
          matters: journal.matters,
          hearings: journal.hearings,
          operations: journal.operations,
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
