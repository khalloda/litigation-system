import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createDatabaseClient } from '../src/lib/db';
import { AUTH_ROLES } from '../src/lib/auth/constants';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import {
  readMatter,
  readMatters,
  parseMatterFilters,
  matterListHref,
  matterReturnHref,
  matterClientReturn,
  MatterFilterError,
  matterRowsQuery,
} from '../src/lib/matter-query';
import { readClient, readLogoMetadata } from '../src/lib/client-query';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  withIsolatedPostgres,
  assertIsolatedTestCluster,
  type IsolatedPostgres,
} from './lib/isolated-postgres-fixture';
import { assertCurrentClientSource } from './lib/client-regression-source';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { clientLogoFixtureState } from './lib/client-logo-fixture-state';
import { archiveVisibilityTargets, visibilityDigest } from './lib/client-archive-visibility';
import { initialiseActors } from './test-client-contacts';

export function matterViewer(role: string): Session {
  return {
    expires: new Date(Date.now() + 3600000).toISOString(),
    user: {
      id: '1',
      personId: 1,
      name: 'TEST ONLY',
      username: 'TEST_ONLY',
      role,
      mustChangePassword: false,
      sessionVersion: 1,
      auditSessionId: randomUUID(),
    },
  } as Session;
}
export async function setMatterClientArchive(
  fixture: IsolatedPostgres,
  id: number,
  archived: boolean,
) {
  await withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      const actors = (
        await db.query(
          "SELECT id FROM user_accounts WHERE role_code='Administrator' AND is_enabled",
        )
      ).rows;
      assert.equal(actors.length, 1);
      await db.query('BEGIN');
      try {
        await db.query('SELECT audit_set_human_context($1)', [actors[0].id]);
        await db.query(
          "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY matter archive visibility','system')",
          [randomUUID(), randomUUID(), randomUUID()],
        );
        const rows = (await db.query('SELECT row_version FROM clients WHERE id=$1', [id])).rows;
        assert.equal(rows.length, 1);
        await db.query("SELECT client_contact_set_archived('clients',$1,$2,$3)", [
          id,
          rows[0].row_version,
          archived,
        ]);
        await db.query('COMMIT');
      } catch (e) {
        await db.query('ROLLBACK');
        throw e;
      }
    },
    { databaseUrl: fixture.migrationUrl },
  );
}
export async function proveMatterReads(fixture: IsolatedPostgres, output: string) {
  const database = createDatabaseClient(fixture.runtimeUrl);
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(fn, {
      databaseUrl: fixture.migrationUrl,
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
  const results: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    results.push({ name, details });
    console.log('PASS ' + name);
    writeFileSync(join(output, 'matter-service-results.json'), JSON.stringify(results, null, 2));
  };
  try {
    let calls = 0;
    const never = {
      $transaction() {
        calls++;
        throw new Error('Protected read');
      },
    } as unknown as PrismaClient;
    for (const session of [
      null,
      { ...matterViewer('Lawyer'), expires: new Date(0).toISOString() },
      matterViewer('Unknown'),
      {
        ...matterViewer('Lawyer'),
        user: { ...matterViewer('Lawyer').user, mustChangePassword: true },
      },
    ]) {
      await assert.rejects(readMatters(session, {}, never), AuthorizationError);
      await assert.rejects(readMatter(session, '1', never), AuthorizationError);
    }
    assert.equal(calls, 0);
    for (const params of [
      { q: ['a', 'b'] },
      { q: 'x'.repeat(161) },
      { q: '\0' },
      { page: '0' },
      { page: '1e2' },
      { page: '2147483648' },
      { client: '01' },
      { lawyer: '-1' },
      { branch: ['1', '2'] },
    ])
      assert.throws(() => parseMatterFilters(params), MatterFilterError);
    for (const raw of ['0', '01', '-1', '2147483648', 'new'])
      assert.equal(await readMatter(matterViewer('Lawyer'), raw, never), null);
    for (const raw of [
      'https://example.invalid/',
      '//evil',
      '/clients/1/evil',
      '/clients/1?q=a&q=b',
    ])
      assert.throws(() => matterClientReturn(raw));
    for (const raw of [
      '//evil',
      '/matters/1/evil',
      '/matters?q=a&q=b',
      '/matters/2147483648',
      '/matters?unknown=1',
    ])
      assert.throws(() => matterReturnHref(raw));
    const nav = parseMatterFilters({
      q: 'أحمد',
      client: '7',
      page: '2',
      fromClient: '/clients/7?q=JTI&archive=all&page=2&contactsPage=3',
    });
    assert.deepEqual(
      parseMatterFilters(
        Object.fromEntries(new URL(matterListHref(nav), 'http://localhost').searchParams),
      ),
      nav,
    );
    pass(
      'Authorization before protected work; input bounds, duplicates and local return allowlists',
    );
    const baseline = await inspect(async (db) => ({
      matters: (
        await db.query(
          'SELECT *,start_date::text start_date_text,end_date::text end_date_text,asked_amount::text asked_amount_text,judged_amount::text judged_amount_text FROM matters ORDER BY case_number_ar COLLATE "arabic" NULLS LAST,id',
        )
      ).rows,
      clients: (
        await db.query(
          'SELECT id,name_ar,name_en,full_name,is_archived,ar_normalise(name_ar) n,ar_normalise(full_name) f,ar_normalise(name_en) e FROM clients',
        )
      ).rows,
      lawyers: (
        await db.query(
          "SELECT ml.id,ml.matter_id,ml.person_id,ml.role,ml.position,p.name_ar,p.is_active FROM matter_lawyers ml JOIN people p ON p.id=ml.person_id ORDER BY CASE ml.role WHEN 'lead' THEN 0 WHEN 'co_lead' THEN 1 ELSE 2 END,ml.position NULLS LAST,ml.id",
        )
      ).rows,
      parties: (await db.query('SELECT * FROM matter_parties ORDER BY side,ordinal NULLS LAST,id'))
        .rows,
      roles: (
        await db.query(
          'SELECT r.id,r.party_id,r.role_id,r.ordinal,l.label_ar_m,l.label_ar_f FROM matter_party_roles r JOIN lookup_party_role l ON l.id=r.role_id ORDER BY r.ordinal NULLS LAST,r.id',
        )
      ).rows,
      aliases: (
        await db.query(
          'SELECT person_id,alias_ar,alias_ar_normalised FROM person_name_alias WHERE NOT is_retired',
        )
      ).rows,
      targets: await archiveVisibilityTargets(db),
      lookups: (
        await db.query(`SELECT 'type' kind,id,label_ar FROM lookup_matter_type
        UNION ALL SELECT 'category',id,label_ar FROM lookup_matter_category
        UNION ALL SELECT 'degree',id,label_ar FROM lookup_degree
        UNION ALL SELECT 'venue',id,label_ar FROM lookup_venue
        UNION ALL SELECT 'branch',id,label_ar FROM lookup_client_branch
        UNION ALL SELECT 'court',id,label_ar FROM lookup_court
        UNION ALL SELECT 'importance',id,label_ar FROM lookup_importance
        UNION ALL SELECT 'destination',id,label_ar FROM lookup_matter_destination`)
      ).rows,
    }));
    assert.equal(baseline.matters.length, 1744);
    const unassigned = baseline.matters.filter(
      (m) => !baseline.lawyers.some((l) => l.matter_id === m.id),
    );
    assert.equal(unassigned.length, 1000);
    const before = await inspect(staffReadOnlyState);
    const collect = async (session: Session, params: Record<string, string> = {}) => {
      const first = await readMatters(session, params, database);
      const all = [...first.rows];
      for (let page = 2; page <= first.pages; page++) {
        const next = await readMatters(session, { ...params, page: String(page) }, database);
        assert.equal(next.total, first.total);
        all.push(...next.rows);
      }
      assert.equal(all.length, first.total);
      assert.equal(new Set(all.map((m) => m.id)).size, first.total);
      return all;
    };
    for (const role of AUTH_ROLES)
      assert.deepEqual(
        (await collect(matterViewer(role))).map((m) => m.id),
        baseline.matters.map((m) => m.id),
      );
    let multiline = 0,
      multiRoles = 0,
      multiLawyers = 0;
    const scalar = {
      caseNumber: 'case_number_ar',
      subject: 'subject',
      clientId: 'client_id',
      status: 'status',
      circuit: 'circuit',
      circuitSecretary: 'circuit_secretary',
      courtFloor: 'court_floor',
      courtHall: 'court_hall',
      courtShelf: 'court_shelf',
      courtSecretaryRoom: 'court_secretary_room',
      currentStatus: 'current_status',
      notes1: 'notes_1',
      notes2: 'notes_2',
      evaluation: 'evaluation',
      legalOpinion: 'legal_opinion',
      legacyId: 'legacy_id',
      startDate: 'start_date_text',
      endDate: 'end_date_text',
      askedAmount: 'asked_amount_text',
      judgedAmount: 'judged_amount_text',
    } as const;
    for (const m of baseline.matters) {
      const d = await readMatter(matterViewer('Lawyer'), String(m.id), database);
      assert.ok(d);
      for (const [key, source] of Object.entries(scalar))
        assert.equal(d[key as keyof typeof scalar], m[source], `exact ${key}, matter ${m.id}`);
      for (const [key, column] of Object.entries({
        type: 'matter_type_id',
        category: 'matter_category_id',
        degree: 'degree_id',
        venue: 'venue_id',
        branch: 'branch_id',
        court: 'court_id',
        importance: 'importance_id',
        destination: 'destination_id',
      }))
        assert.equal(
          d[key as 'type'],
          baseline.lookups.find((l) => l.kind === key && l.id === m[column])?.label_ar ?? null,
          `lookup ${key}, matter ${m.id}`,
        );
      const client = baseline.clients.find((c) => c.id === m.client_id);
      assert.equal(d.clientName, client?.name_ar ?? null);
      assert.equal(d.clientArchived, client?.is_archived ?? null);
      const parties = baseline.parties
        .filter((p) => p.matter_id === m.id)
        .map((p) => ({
          id: p.id,
          side: p.side,
          name: p.party_name,
          gender: p.gender,
          ordinal: p.ordinal,
          roles: baseline.roles
            .filter((r) => r.party_id === p.id)
            .map((r) => ({
              id: r.id,
              roleId: r.role_id,
              name: p.gender === 'f' ? r.label_ar_f : r.label_ar_m,
              ordinal: r.ordinal,
            })),
        }));
      const lawyers = baseline.lawyers
        .filter((l) => l.matter_id === m.id)
        .map((l) => ({
          id: l.id,
          personId: l.person_id,
          name: l.name_ar,
          role: l.role,
          position: l.position,
          active: l.is_active,
        }));
      assert.deepEqual(d.parties, parties);
      assert.deepEqual(d.lawyers, lawyers);
      assert.equal(d.lawyerCount, lawyers.length);
      assert.ok(!JSON.stringify(d).includes('legacy_source_payload'));
      if (/\r|\n/u.test(d.caseNumber ?? '')) multiline++;
      if (parties.some((p) => p.roles.length > 1)) multiRoles++;
      if (lawyers.length > 1) multiLawyers++;
    }
    assert.ok(multiline && multiRoles && multiLawyers);
    pass(
      'All 1744 identities, every page for four roles, every detail scalar and ordered party/capacity/lawyer relationship',
      { unassigned: unassigned.length, multiline, multiRoles, multiLawyers },
    );
    const queries = [
      'احمد',
      'أحمد',
      'أَحْمَد',
      '١٤٠',
      '140J',
      '140ق',
      'JTI',
      '%',
      '_',
      '\\',
      '__NO_SUCH_MATTER__',
      ...baseline.aliases
        .filter(
          (a) =>
            baseline.lawyers.some((l) => l.person_id === a.person_id) &&
            a.alias_ar !== baseline.lawyers.find((l) => l.person_id === a.person_id)?.name_ar,
        )
        .slice(0, 12)
        .map((a) => a.alias_ar),
    ];
    for (const q of queries) {
      const n = await inspect(
        async (db) => (await db.query('SELECT ar_normalise($1) n', [q])).rows[0].n as string,
      );
      const expected = baseline.matters.filter((m) =>
        [
          m.case_number_ar_normalised,
          m.subject_normalised,
          ...baseline.clients.filter((c) => c.id === m.client_id).flatMap((c) => [c.n, c.f, c.e]),
          ...baseline.aliases
            .filter((a) =>
              baseline.lawyers.some((l) => l.matter_id === m.id && l.person_id === a.person_id),
            )
            .map((a) => a.alias_ar_normalised),
        ].some((s) => s?.includes(n)),
      );
      assert.deepEqual(
        (await collect(matterViewer('Lawyer'), { q })).map((m) => m.id),
        expected.map((m) => m.id),
      );
    }
    const first = await readMatters(matterViewer('Lawyer'), {}, database);
    for (const option of first.options) {
      const column = {
        client: 'client_id',
        status: 'status',
        type: 'matter_type_id',
        category: 'matter_category_id',
        degree: 'degree_id',
        venue: 'venue_id',
        branch: 'branch_id',
      };
      const expected = baseline.matters.filter((m) =>
        option.kind === 'lawyer'
          ? baseline.lawyers.some(
              (l) => l.matter_id === m.id && String(l.person_id) === option.value,
            )
          : String(m[column[option.kind]]) === option.value,
      );
      assert.deepEqual(
        (await collect(matterViewer('Lawyer'), { [option.kind]: option.value })).map((m) => m.id),
        expected.map((m) => m.id),
      );
    }
    assert.deepEqual(
      (await collect(matterViewer('Lawyer'), { lawyer: 'missing' })).map((m) => m.id),
      unassigned.map((m) => m.id),
    );
    for (const [key, column] of Object.entries({
      client: 'client_id',
      status: 'status',
      type: 'matter_type_id',
      category: 'matter_category_id',
      degree: 'degree_id',
      venue: 'venue_id',
      branch: 'branch_id',
    }))
      assert.deepEqual(
        (await collect(matterViewer('Lawyer'), { [key]: 'missing' })).map((m) => m.id),
        baseline.matters
          .filter((m) => m[column] === null || (key === 'status' && m[column] === ''))
          .map((m) => m.id),
      );
    const finalPage = await readMatters(matterViewer('Lawyer'), { page: '2147483647' }, database);
    assert.equal(finalPage.filters.page, finalPage.pages);
    assert.deepEqual(
      finalPage.rows.map((m) => m.id),
      baseline.matters.slice((finalPage.pages - 1) * 25).map((m) => m.id),
    );
    const combination = baseline.matters.find(
      (m) => m.client_id && m.branch_id && m.matter_type_id && m.degree_id,
    )!;
    const combined = {
      client: String(combination.client_id),
      branch: String(combination.branch_id),
      type: String(combination.matter_type_id),
      degree: String(combination.degree_id),
    };
    assert.deepEqual(
      (await collect(matterViewer('Lawyer'), combined)).map((m) => m.id),
      baseline.matters
        .filter(
          (m) =>
            m.client_id === combination.client_id &&
            m.branch_id === combination.branch_id &&
            m.matter_type_id === combination.matter_type_id &&
            m.degree_id === combination.degree_id,
        )
        .map((m) => m.id),
    );
    await assert.rejects(
      readMatters(matterViewer('Lawyer'), { client: '2147483647' }, database),
      MatterFilterError,
    );
    assert.equal(await readMatter(matterViewer('Lawyer'), '2147483647', database), null);
    assert.deepEqual(await inspect(staffReadOnlyState), before);
    pass(
      'Independent normalized substring oracle, literal J and wildcard characters, real aliases, every lookup choice and combined filters; read preservation',
      { searches: queries.length, options: first.options.length },
    );
    const plans = await inspect(async (db) => {
      const rows = [];
      for (const params of [
        {},
        { q: 'احمد' },
        { client: String(baseline.targets[1]!.id) },
        { lawyer: 'missing' },
      ]) {
        const query = matterRowsQuery(parseMatterFilters(params), 1);
        rows.push({
          params,
          plan: (
            await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query.text, query.values)
          ).rows[0]['QUERY PLAN'],
        });
      }
      return rows;
    });
    writeFileSync(join(output, 'matter-query-plans.json'), JSON.stringify(plans, null, 2));
    for (const target of baseline.targets) {
      const original = await collect(matterViewer('Lawyer'), { client: String(target.id) });
      const details = await Promise.all(
        original.map((m) => readMatter(matterViewer('Lawyer'), String(m.id), database)),
      );
      for (const archived of [true, false]) {
        await setMatterClientArchive(fixture, target.id, archived);
        for (const role of AUTH_ROLES) {
          const rows = await collect(matterViewer(role), { client: String(target.id) });
          assert.deepEqual(
            rows.map((m) => ({ ...m, clientArchived: false })),
            original,
          );
          assert.ok(rows.every((m) => m.clientArchived === archived));
          const actual = await Promise.all(
            rows.map((m) => readMatter(matterViewer(role), String(m.id), database)),
          );
          assert.deepEqual(
            actual.map((m) => ({ ...m, clientArchived: false })),
            details,
          );
          assert.equal(
            (await readClient(matterViewer(role), String(target.id), database))?.isArchived,
            archived,
          );
          if (archived)
            assert.throws(() =>
              assert.equal(rows.filter((m) => !m.clientArchived).length, target.matters),
            );
        }
      }
      pass(
        'Archive-independent new matter query/detail for all four roles, active/archive/restore and exclusion counterexample',
        {
          clientId: target.id,
          count: target.matters,
          identities: original.map((m) => m.id),
          contentDigest: visibilityDigest(details),
        },
      );
    }
    // Client detail/logo read dependencies remain valid after the navigation edit.
    for (const role of AUTH_ROLES)
      for (const target of baseline.targets) {
        assert.equal(
          (await readClient(matterViewer(role), String(target.id), database))?.matterCount,
          target.matters,
        );
        await readLogoMetadata(matterViewer(role), String(target.id), database);
      }
    return {
      targets: baseline.targets,
      multilineId: baseline.matters.find(
        (m) =>
          (m.case_number_ar ?? '').split(/\r\n|\r|\n/u).filter((line: string) => line.trim())
            .length > 1,
      )!.id,
      complexId: baseline.matters.find(
        (m) => baseline.lawyers.filter((l) => l.matter_id === m.id).length > 1,
      )!.id,
      noLawyerId: unassigned[0]!.id,
    };
  } finally {
    await database.$disconnect();
  }
}

async function main() {
  const output = resolve(process.env.MATTER_EVIDENCE_DIR ?? '');
  assert.ok(
    process.env.MATTER_EVIDENCE_DIR &&
      isAbsolute(output) &&
      (relative(process.cwd(), output).startsWith('..') ||
        isAbsolute(relative(process.cwd(), output))),
    'Explicit external evidence directory required',
  );
  mkdirSync(output, { recursive: true });
  const source = await withApprovedMigrationClient(
    async (db) => {
      assert.equal(await assertCurrentClientSource(db), 63);
      return { state: await staffReadOnlyState(db), portable: await clientLogoFixtureState(db) };
    },
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  await withIsolatedPostgres(async (fixture) => {
    writeFileSync(
      join(output, 'isolation.json'),
      JSON.stringify(
        {
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          port: new URL(fixture.runtimeUrl).port,
          checkpoint: 63,
        },
        null,
        2,
      ),
    );
    await fixture.restoreProject();
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        assert.equal(await assertCurrentClientSource(db), 63);
        assert.deepEqual((await staffReadOnlyState(db)).tables, source.state.tables);
        assert.deepEqual(await clientLogoFixtureState(db), source.portable);
      },
      {
        databaseUrl: fixture.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    writeFileSync(
      join(output, 'restore-equivalence.json'),
      JSON.stringify(
        {
          completeRows: true,
          portableCatalogAndLogicalSequences: true,
          sourceDigest: source.state.tableDigest,
          exceptions:
            'Only previously reviewed three constraint renderings; restore log_cnt excluded from portable state, retained in live preservation.',
        },
        null,
        2,
      ),
    );
    const browserOnly = process.argv.includes('--browser-only');
    if (!browserOnly) {
      const verify = spawnSync(
        'docker',
        [
          'exec',
          '-i',
          '-e',
          'PGOPTIONS=-c default_transaction_read_only=on',
          fixture.container,
          'psql',
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'litigation',
          '-d',
          'litigation',
        ],
        { input: readFileSync('docker/postgres/verify.sql'), windowsHide: true, encoding: 'utf8' },
      );
      writeFileSync(join(output, 'database-setup.log'), verify.stdout + verify.stderr);
      assert.equal(verify.status, 0, 'Isolated database setup checks failed');
      const checks = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'scripts/check-db.ts'],
        {
          env: { ...fixture.environment, PGOPTIONS: '-c default_transaction_read_only=on' },
          windowsHide: true,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      writeFileSync(
        join(output, 'database-invariants.log'),
        (checks.stdout + checks.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
      );
      assert.equal(checks.status, 0, 'Current-63 isolated invariants failed');
      const permissions = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'scripts/test-permissions.ts', '--restored-fixture'],
        {
          env: fixture.environment,
          windowsHide: true,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      writeFileSync(
        join(output, 'permissions-isolated.log'),
        (permissions.stdout + permissions.stderr).replace(
          /postgres(?:ql)?:\/\/[^\s"']+/gu,
          '[redacted]',
        ),
      );
      assert.equal(permissions.status, 0, 'Isolated permissions suite failed; see retained log');
      console.log('PASS existing permission suite through restored isolated descriptor');
    }
    await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
    const cases = browserOnly
      ? await withApprovedMigrationClient(
          async (db) => {
            await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
            const rows = (
              await db.query(`SELECT m.id,m.case_number_ar,
        (SELECT count(*)::int FROM matter_lawyers l WHERE l.matter_id=m.id) lawyers
        FROM matters m ORDER BY case_number_ar COLLATE "arabic" NULLS LAST,id`)
            ).rows;
            assert.equal(rows.length, 1744);
            return {
              targets: await archiveVisibilityTargets(db),
              multilineId: rows.find(
                (m) =>
                  (m.case_number_ar ?? '')
                    .split(/\r\n|\r|\n/u)
                    .filter((line: string) => line.trim()).length > 1,
              )!.id,
              complexId: rows.find((m) => m.lawyers > 1)!.id,
              noLawyerId: rows.find((m) => m.lawyers === 0)!.id,
            };
          },
          {
            databaseUrl: fixture.migrationUrl,
            clientConfig: { options: '-c default_transaction_read_only=on' },
          },
        )
      : await proveMatterReads(fixture, output);
    if (process.argv.includes('--browser') || browserOnly) {
      const { proveMatterBrowser } = await import('./test-matter-browser.mjs');
      await proveMatterBrowser(fixture, output, cases);
    }
  });
  assert.deepEqual(
    await withApprovedMigrationClient(staffReadOnlyState, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    }),
    source.state,
  );
  writeFileSync(
    join(output, 'fixture-cleanup.json'),
    JSON.stringify({ removedOwnedClusterVolumeNetwork: true, sourceStateExact: true }, null, 2),
  );
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/test-matter-read-only.ts'))
  void main().catch((error) => {
    console.error(
      error instanceof Error
        ? (error.stack ?? error.message).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]')
        : 'Matter proof failed',
    );
    process.exitCode = 1;
  });
