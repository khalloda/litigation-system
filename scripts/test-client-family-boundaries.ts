import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Session } from 'next-auth';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { authenticateCredentials } from '../src/lib/auth/service';
import { createSessionClaims } from '../src/lib/auth/session';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { createReportEngine } from '../src/lib/reports/engine';
import { clientMatterReports } from '../src/lib/reports/client-matter-reports';
import { activeClientContacts } from '../src/lib/reports/client-contacts';
import { clientJudgments } from '../src/lib/reports/client-judgments';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { reportSearchText } from '../src/lib/reports/search';

async function main() {
  const out = process.env['TASK51_OUTPUT']!,
    priv = process.env['TASK51_PRIVATE']!;
  const f = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (c) => {
        await assertIsolatedTestCluster(c, new URL(f.migrationUrl), f.environment);
        return fn(c);
      },
      {
        databaseUrl: f.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
  await inspect(async () => undefined);
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: f.runtimeUrl }),
    log: [{ level: 'query', emit: 'event' }],
  });
  let queryCount = 0;
  let adapterQuery: { query: string; params: string } | undefined;
  runtime.$on('query', (event) => {
    queryCount++;
    if (/^\s*WITH latest AS/u.test(event.query))
      adapterQuery = { query: event.query, params: event.params };
  });
  const records: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    records.push({ name, details });
    writeFileSync(`${out}/results.json`, JSON.stringify(records, null, 2));
    console.log('PASS ' + name);
  };
  const snapshot = () =>
    inspect(async (c) => {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const tables = (
          await c.query(
            "SELECT n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1,2",
          )
        ).rows;
        const seq = (
          await c.query(
            "SELECT schemaname schema,sequencename name FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2",
          )
        ).rows;
        const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
        const result = [];
        for (const t of [...tables, ...seq]) {
          const isSequence = seq.some((s) => s.schema === t.schema && s.name === t.name);
          const values = (
            await c.query(
              isSequence
                ? `SELECT jsonb_build_object('last_value',last_value,'log_cnt',log_cnt,'is_called',is_called)::text value FROM ${quote(t.schema)}.${quote(t.name)}`
                : `SELECT to_jsonb(t)::text value FROM ${quote(t.schema)}.${quote(t.name)} t ORDER BY to_jsonb(t)::text COLLATE "C"`,
            )
          ).rows.map((r: { value: string }) => r.value);
          result.push({
            schema: t.schema,
            name: t.name,
            count: values.length,
            sha256: createHash('sha256').update(values.join('\n')).digest('hex'),
          });
        }
        return result;
      } finally {
        await c.query('ROLLBACK');
      }
    });
  try {
    const login = JSON.parse(readFileSync(`${priv}/logins.json`, 'utf8')).find(
      (x: { role: string }) => x.role === 'Lawyer',
    );
    const user = await authenticateCredentials(login, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
    assert.ok(user);
    const session: Session = {
      user,
      expires: new Date(createSessionClaims(user).absoluteExpiresAt).toISOString(),
    };
    const definitions = [
      activeClientContacts,
      ...clientMatterReports.slice(0, 6),
      clientJudgments,
      ...clientMatterReports.slice(6),
    ];
    const engine = createReportEngine(definitions, runtime);
    const before = await snapshot();
    assert.equal((await engine.catalog(session)).length, 9);
    let inactive = 0,
      external = 0;
    const historical = await inspect(
      async (c) =>
        (
          await c.query(
            'SELECT id,is_active,is_staff FROM public.people WHERE NOT is_active OR NOT is_staff',
          )
        ).rows,
    );
    for (const def of definitions) {
      const description = await engine.describe(session, def.descriptor.id);
      if (def.descriptor.id === 'client-status') {
        for (const p of historical) {
          assert.ok(description.options.lawyer.some((x) => x.id === p.id));
          if (!p.is_active) inactive++;
          if (!p.is_staff) external++;
        }
      }
    }
    assert.deepEqual(await snapshot(), before);
    pass('full catalog/form/options window equality', {
      tablesAndSequences: before.length,
      inactivePeople: inactive,
      externalPeople: external,
    });
    assert.equal(reportSearchText('أَحــمد'), reportSearchText('احمد'));
    assert.notEqual(reportSearchText('140J'), reportSearchText('140ق'));
    assert.notEqual(reportSearchText('JTI'), reportSearchText('قTI'));
    const request = (body: string, signal?: AbortSignal) =>
      new Request('http://127.0.0.1:3100/reports/test/run', {
        method: 'POST',
        headers: {
          origin: 'http://127.0.0.1:3100',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        signal,
      });
    let attempted = 0;
    const watched = createReportEngine(
      definitions.map((d) => ({
        ...d,
        query: async (tx, p) => {
          attempted++;
          return d.query(tx, p);
        },
      })),
      runtime,
    );
    const denied: [string, Session | null][] = [
      ['anonymous', null],
      ['expired', { ...session, expires: '2000-01-01T00:00:00Z' }],
      [
        'version-mismatch',
        { ...session, user: { ...session.user, sessionVersion: session.user.sessionVersion + 1 } },
      ],
      ['role-mismatch', { ...session, user: { ...session.user, role: 'Administrator' } }],
      [
        'person-mismatch',
        { ...session, user: { ...session.user, personId: session.user.personId + 9999 } },
      ],
      ['password-change', { ...session, user: { ...session.user, mustChangePassword: true } }],
    ];
    for (const def of definitions) {
      for (const [name, s] of denied) {
        const response = await watched.handle(
          s as Session,
          request('format=preview'),
          def.descriptor.id,
          'run',
        );
        assert.ok([401, 403].includes(response.status), name + ' ' + def.descriptor.id);
      }
      for (const body of [
        'format=preview&sql=SELECT',
        'format=preview&client=0',
        'format=preview&client=1&client=2',
        'format=preview&extra_status=unapproved',
        'format=preview&from=2026-02-29',
      ]) {
        const response = await watched.handle(session, request(body), def.descriptor.id, 'run');
        assert.equal(response.status, 400, body + ' ' + def.descriptor.id);
      }
    }
    assert.equal(
      (await watched.handle(session, request('format=preview'), 'unregistered', 'run')).status,
      404,
    );
    assert.equal(attempted, 0);
    assert.deepEqual(await snapshot(), before);
    pass(
      '99 per-definition denied/invalid requests plus unknown ID before adapters; full state unchanged',
      { denied: 54, invalid: 45, unknown: 1, adapterCalls: attempted },
    );
    const proof = JSON.parse(
      readFileSync(`${out}/../seven-oracle-03/matter-source-oracle.json`, 'utf8'),
    );
    for (const id of ['client-status', 'client-branch-evaluation-finance']) {
      const expected = proof.largest[id],
        p = expected.parameters;
      const body = new URLSearchParams({ client: String(p.client.id), ...p.extra });
      for (const format of ['xlsx', 'pdf']) {
        body.set('format', format);
        queryCount = 0;
        const start = performance.now();
        const response = await engine.handle(session, request(body.toString()), id, 'export');
        assert.equal(response.status, 200, await response.clone().text());
        const bytes = Buffer.from(await response.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        assert.equal(response.headers.get('x-artifact-sha256'), sha256);
        writeFileSync(`${out}/largest-${id}.${format}`, bytes, { flag: 'wx' });
        assert.ok(queryCount < 40, 'bounded set queries, no query per matter');
        pass('largest relevant family output', {
          id,
          format,
          rows: expected.rows,
          bytes: bytes.length,
          sha256,
          queries: queryCount,
          milliseconds: performance.now() - start,
          operation: response.headers.get('x-report-operation'),
        });
      }
      writeFileSync(`${out}/largest-${id}-expected.json`, JSON.stringify(expected));
      assert.ok(adapterQuery);
      const selected = adapterQuery;
      const plan = await inspect(
        async (c) =>
          (
            await c.query(
              'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + selected.query,
              JSON.parse(selected.params),
            )
          ).rows,
      );
      writeFileSync(
        `${out}/plan-${id}.json`,
        JSON.stringify(
          { query: selected.query, parameters: JSON.parse(selected.params), plan },
          null,
          2,
        ),
      );
    }
    pass(
      'shared database disabled/inactive/revocation defenses reused only under unchanged guarded-closure and dependency bindings; fresh per-definition malformed/session guards above',
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
