import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { authenticateCredentials } from '../src/lib/auth/service';
import { createSessionClaims } from '../src/lib/auth/session';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { createDatabaseClient } from '../src/lib/db';
import { createReportEngine } from '../src/lib/reports/engine';
import { readHearingLifecycle, mutateHearingLifecycle } from '../src/lib/hearing-lifecycle';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { setMatterClientArchive } from './test-matter-read-only';
import { probeDefinitions, edgeDescriptor, edgeData } from './test-report-probes';
import { cairoDayStart, parseReportInput, readReportRequest } from '../src/lib/reports/input';
import { cairoDate } from '../src/lib/cairo-date';
async function main() {
  const out = process.env.TASK51_OUTPUT!,
    priv = process.env.TASK51_PRIVATE!;
  const fixture = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  const login = JSON.parse(readFileSync(`${priv}/logins.json`, 'utf8')).find(
    (x: { role: string }) => x.role === 'Administrator',
  );
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return work(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  await inspect(async () => undefined);
  const runtime = createDatabaseClient(fixture.runtimeUrl),
    records: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    records.push({ name, details });
    writeFileSync(`${out}/results.json`, JSON.stringify(records, null, 2));
    console.log('PASS ' + name);
  };
  const request = (format: string, body = '') =>
    new Request('http://127.0.0.1:3100/reports/probe/run', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3100',
        origin: 'http://127.0.0.1:3100',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: `format=${format}${body}`,
    });
  try {
    const user = await authenticateCredentials(login, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
    assert.ok(user);
    const session = {
        user,
        expires: new Date(createSessionClaims(user).absoluteExpiresAt).toISOString(),
      },
      engine = createReportEngine(probeDefinitions, runtime);
    for (const day of ['0001-01-01', '0001-01-02', '9998-12-31'])
      assert.equal(cairoDate(cairoDayStart(day)), day);
    await assert.rejects(readReportRequest(request('preview', '&client=%FF')));
    pass('calendar extrema and invalid percent-encoded UTF-8');
    const unsupported = { ...edgeDescriptor, parameters: {}, date: undefined };
    for (const body of [
      'format=preview&client=1',
      'format=preview&branch=unassigned',
      'format=preview&from=2026-01-01',
    ])
      assert.throws(() => parseReportInput(unsupported, new URLSearchParams(body)));
    pass('unsupported shared fields fail closed');
    const target = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT h.id,m.client_id FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id JOIN public.clients c ON c.id=m.client_id WHERE NOT h.is_archived AND NOT m.is_archived AND NOT c.is_archived ORDER BY h.id LIMIT 1',
          )
        ).rows[0],
    );
    assert.ok(target);
    const before = await engine.handle(session, request('preview'), 'probe-volume', 'run');
    assert.equal(before.status, 200);
    const original = await before.json();
    const h = await readHearingLifecycle(session, 'archive', target.id, runtime);
    await mutateHearingLifecycle(
      session,
      'archive',
      {
        id: target.id,
        confirmation: target.id,
        version: h.version,
        submission: randomUUID(),
        action: 'archive',
        facts: h.facts,
      },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
    let clientArchived = false;
    try {
      await setMatterClientArchive(fixture, target.client_id, true);
      clientArchived = true;
      const described = await engine.describe(session, 'probe-volume');
      assert.ok(described.options.client.some((x) => x.id === target.client_id));
      const response = await engine.handle(session, request('preview'), 'probe-volume', 'run');
      assert.equal(response.status, 200);
      const archived = await response.json();
      assert.equal(archived.rowCount, original.rowCount);
      assert.equal(
        archived.data.sections[0].groups[0].rows.find(
          (r: { id: string }) => r.id === String(target.id),
        ).cells[4].value,
        true,
      );
      const inactive = await inspect(async (db) =>
        (await db.query('SELECT id FROM public.people WHERE NOT is_active ORDER BY id')).rows.map(
          (x) => x.id,
        ),
      );
      assert.ok(inactive.length > 0);
      assert.ok(inactive.every((id) => described.options.lawyer.some((x) => x.id === id)));
      pass('persisted archive and inactive-reference coverage', {
        hearing: target.id,
        client: target.client_id,
        inactivePeople: inactive.length,
        rows: archived.rowCount,
      });
    } finally {
      if (clientArchived) await setMatterClientArchive(fixture, target.client_id, false);
      const current = await readHearingLifecycle(session, 'restore', target.id, runtime);
      await mutateHearingLifecycle(
        session,
        'restore',
        {
          id: target.id,
          confirmation: target.id,
          version: current.version,
          submission: randomUUID(),
          action: 'restore',
          facts: current.facts,
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      );
    }
    const count = () =>
      inspect(async (db) =>
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM public.audit_events WHERE resource_identifier LIKE 'report:%'",
            )
          ).rows[0].n,
        ),
      );
    const beforeFailure = await count();
    await inspect(async (db) => {
      await db.query(
        "CREATE FUNCTION public.task61_reject_query() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'task61 simulated query audit failure'; END $$",
      );
      await db.query(
        "CREATE TRIGGER task61_reject_query BEFORE INSERT ON public.audit_events FOR EACH ROW WHEN (NEW.action='report_executed' AND NEW.resource_identifier LIKE 'report:%') EXECUTE FUNCTION public.task61_reject_query()",
      );
    });
    try {
      assert.equal(
        (await engine.handle(session, request('preview'), 'probe-empty', 'run')).status,
        500,
      );
    } finally {
      await inspect(async (db) => {
        await db.query('DROP TRIGGER task61_reject_query ON public.audit_events');
        await db.query('DROP FUNCTION public.task61_reject_query()');
      });
    }
    assert.equal(await count(), beforeFailure);
    pass('query audit write failure releases no preview or success event');
    const denied = createReportEngine(
      [
        {
          descriptor: { ...edgeDescriptor, permissions: [{ area: 'billing', action: 'update' }] },
          query: async () => {
            throw Error('must never enter adapter');
          },
        },
      ],
      runtime,
    );
    assert.equal(
      (await denied.handle(session, request('preview'), 'probe-edge', 'run')).status,
      403,
    );
    pass('underlying read-only billing permission cannot be widened by report');
    let entered = 0;
    let release: () => void = () => {};
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    const bounded = createReportEngine(
      [
        {
          descriptor: edgeDescriptor,
          query: async () => {
            entered++;
            await barrier;
            return edgeData;
          },
        },
      ],
      runtime,
    );
    const first = bounded.handle(session, request('preview'), 'probe-edge', 'run'),
      second = bounded.handle(session, request('preview'), 'probe-edge', 'run');
    try {
      for (let i = 0; i < 100 && entered < 2; i++) await new Promise((r) => setTimeout(r, 10));
      assert.equal(entered, 2);
      assert.equal(
        (await bounded.handle(session, request('preview'), 'probe-edge', 'run')).status,
        429,
      );
    } finally {
      release();
    }
    assert.deepEqual(
      (await Promise.all([first, second])).map((r) => r.status),
      [200, 200],
    );
    pass('concurrency bound refuses third operation and cleans slots');
    if (process.argv.includes('--without-volume')) return;
    const at = performance.now(),
      pdf = await engine.handle(session, request('pdf'), 'probe-volume', 'export');
    assert.equal(pdf.status, 200, await pdf.clone().text());
    const bytes = Buffer.from(await pdf.arrayBuffer());
    writeFileSync(`${out}/probe-volume.pdf`, bytes, { flag: 'wx' });
    pass('full-volume PDF', {
      rows: original.rowCount,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      milliseconds: performance.now() - at,
    });
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  const priv = process.env.TASK51_PRIVATE!,
    out = process.env.TASK51_OUTPUT!;
  writeFileSync(`${priv}/boundaries-${out.split(/[\\/]/).at(-1)}-failure.txt`, String(e.stack), {
    flag: 'wx',
  });
  console.error('Boundary proof failed; private diagnostic retained');
  process.exitCode = 1;
});
