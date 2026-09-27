import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import { createDatabaseClient } from '../src/lib/db';
import { authenticateCredentials } from '../src/lib/auth/service';
import { createSessionClaims } from '../src/lib/auth/session';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { mutateClient } from '../src/lib/client-mutations';
import { mutateMatter } from '../src/lib/matter-mutations';
import { mutateHearing } from '../src/lib/hearing-mutations';
import { readHearingLifecycle, mutateHearingLifecycle } from '../src/lib/hearing-lifecycle';
import { clientMatterReports } from '../src/lib/reports/client-matter-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { reportSnapshot } from '../src/lib/reports/authority';
import { t } from '../src/strings';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

// Literal expectations deliberately do not import courtText or production configuration.
// The two court labels are pinned existing lookup values, not invented legal vocabulary.
const cases = [
  'different',
  'matter-null',
  'latest-null',
  'latest-empty',
  'undated',
  'none',
] as const;
type Case = (typeof cases)[number];
type Journal = {
  client?: number;
  matters: Partial<Record<Case, number>>;
  hearings: Record<string, number>;
  operations: unknown[];
  ready?: boolean;
};
async function main() {
  const priv = process.env['TASK51_PRIVATE']!,
    out = process.env['TASK51_OUTPUT']!;
  const f = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  await withApprovedMigrationClient(
    async (c) => {
      await assertIsolatedTestCluster(c, new URL(f.migrationUrl), f.environment);
      assert.deepEqual(
        (await c.query('SELECT id,label_ar FROM lookup_court WHERE id IN (1,2) ORDER BY id')).rows,
        [
          { id: 1, label_ar: 'القاهرة الاقتصادية' },
          { id: 2, label_ar: 'شمال القاهرة' },
        ],
      );
    },
    {
      databaseUrl: f.migrationUrl,
      clientConfig: { options: '-c default_transaction_read_only=on' },
    },
  );
  const path = `${priv}/status-court-journal.json`;
  const journal: Journal = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { matters: {}, hearings: {}, operations: [] };
  const save = () => writeFileSync(path, JSON.stringify(journal, null, 2));
  const runtime = createDatabaseClient(f.runtimeUrl);
  const dependencies = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
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
    if (process.argv.includes('--setup')) {
      assert.equal(
        journal.client,
        undefined,
        'One-shot setup; inspect uncertain writes before resuming',
      );
      const created = await mutateClient(
        session,
        'client-create',
        {
          submission: randomUUID(),
          name_ar: 'TEST ONLY T62-O1 court regression',
          name_en: 'TEST ONLY T62-O1 court regression',
          status: 'Active',
          cash_or_probono: 'Cash',
        },
        dependencies,
      );
      journal.client = created.id;
      journal.operations.push({ operation: 'client-create', result: created });
      save();
      for (const name of cases) {
        const result = await mutateMatter(
          session,
          'create',
          {
            id: null,
            version: null,
            submission: randomUUID(),
            values: {
              client_id: journal.client,
              status: t.values.active,
              case_number_ar: `TEST ONLY O1-${name}\n001`,
              court_id: name === 'matter-null' ? null : 1,
              circuit: name === 'matter-null' ? null : 'TEST ONLY MATTER',
            },
            parties: [],
            lawyers: [],
          },
          dependencies,
        );
        journal.matters[name] = result.id;
        journal.operations.push({ operation: 'matter-create', name, result });
        save();
      }
      const fixtures: [string, Case, string | null, number | null, string | null][] = [
        ['different-old', 'different', '2026-01-01', 1, 'TEST ONLY OLD'],
        ['different-tie-low', 'different', '2026-02-01', 1, 'TEST ONLY TIE LOW'],
        ['different-selected', 'different', '2026-02-01', 2, 'TEST ONLY SELECTED'],
        ['matter-null-selected', 'matter-null', '2026-02-02', 2, 'TEST ONLY HEARING'],
        ['latest-null-old', 'latest-null', '2026-01-01', 2, 'TEST ONLY OLD'],
        ['latest-null-selected', 'latest-null', '2026-02-03', null, null],
        ['latest-empty-old', 'latest-empty', '2026-01-01', 2, 'TEST ONLY OLD'],
        ['latest-empty-selected', 'latest-empty', '2026-02-04', null, ''],
        ['undated-low', 'undated', null, 1, 'TEST ONLY UNDATED LOW'],
        ['undated-selected', 'undated', null, 2, 'TEST ONLY UNDATED'],
      ];
      for (const [name, matter, date, court, circuit] of fixtures) {
        const result = await mutateHearing(
          session,
          'create',
          {
            id: null,
            version: null,
            submission: randomUUID(),
            values: {
              matter_id: journal.matters[matter],
              hearing_date: date,
              decision: `TEST ONLY ${name}`,
              court_id: court,
              circuit,
            },
          },
          dependencies,
        );
        journal.hearings[name] = result.id;
        journal.operations.push({ operation: 'hearing-create', name, result });
        save();
      }
      const id = journal.hearings['different-selected']!;
      const state = await readHearingLifecycle(session, 'archive', id, runtime);
      const archived = await mutateHearingLifecycle(
        session,
        'archive',
        {
          id,
          confirmation: id,
          version: state.version,
          submission: randomUUID(),
          action: 'archive',
          facts: state.facts,
        },
        dependencies,
      );
      journal.operations.push({ operation: 'hearing-archive', result: archived });
      journal.ready = true;
      save();
    }
    assert.equal(journal.ready, true);
    const definition = clientMatterReports.find((d) => d.descriptor.id === 'client-status')!;
    const query = async (extra: Record<string, string> = {}) => {
      const parameters = parseReportInput(
        definition.descriptor,
        new URLSearchParams({ format: 'preview', client: String(journal.client), ...extra }),
      ).parameters;
      return reportSnapshot(session, runtime, 'run', definition.descriptor.permissions, (tx) =>
        definition.query(tx, parameters),
      );
    };
    const data = await query(),
      rows = data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
    assert.equal(rows.length, 6);
    const expected = {
      different: { type: 'text', value: 'شمال القاهرة\n(TEST ONLY SELECTED)' },
      'matter-null': { type: 'text', value: 'شمال القاهرة\n(TEST ONLY HEARING)' },
      'latest-null': { type: 'null' },
      'latest-empty': { type: 'null' },
      undated: { type: 'text', value: 'شمال القاهرة\n(TEST ONLY UNDATED)' },
      none: { type: 'null' },
    };
    // Persist observations before assertions so the original mapping failure is reviewable.
    writeFileSync(
      `${out}/literal-observations.json`,
      JSON.stringify({ journal, expected, data }, null, 2),
    );
    for (const name of cases) {
      const row = rows.find((r) => r.id === `matter:${journal.matters[name]}`)!;
      assert.deepEqual(
        row.cells[1],
        expected[name],
        `${name}: selected hearing pair; no matter/older/raw fallback`,
      );
      if (name !== 'none') assert.ok(JSON.stringify(row.cells[5]).includes(`${name}-selected`));
      else assert.deepEqual(row.cells[5], { type: 'text', value: t.clientReports.noHearing });
    }
    const period = await query({ from: '2026-01-01', to: '2026-01-31' });
    assert.deepEqual(
      period.sections.flatMap((s) => s.groups.flatMap((g) => g.rows)),
      [],
    );
    writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          status: 'PASS',
          client: journal.client,
          cases: cases.length,
          literalCourtExpectations: expected,
          latestBeforePeriod: true,
          archivedEqualDateWinnerIncluded: true,
          data,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS six independent literal court cases, equal-date/undated/no-hearing/archive and period ordering',
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
