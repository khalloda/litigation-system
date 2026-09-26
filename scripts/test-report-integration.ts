import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import type { Session } from 'next-auth';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createReportEngine } from '../src/lib/reports/engine';
import { reportSearchText } from '../src/lib/reports/search';
import { reportSnapshot } from '../src/lib/reports/authority';
import { validateReportData } from '../src/lib/reports/result';
import { parseReportInput } from '../src/lib/reports/input';
import { authenticateCredentials, changeOwnPassword } from '../src/lib/auth/service';
import { disableManagedAccount, reactivateManagedAccount } from '../src/lib/auth/user-management';
import { createSessionClaims } from '../src/lib/auth/session';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { setMigrationAuditContext } from '../src/lib/audit';
import {
  withApprovedMigrationClient,
  createApprovedMigrationPrismaClient,
} from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import {
  probeDefinitions,
  edgeDescriptor,
  edgeData,
  edgeValues,
  volumeProbe,
} from './test-report-probes';

const out = process.env.TASK51_OUTPUT!,
  priv = process.env.TASK51_PRIVATE!;
const fixture = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
const logins = JSON.parse(readFileSync(`${priv}/logins.json`, 'utf8')) as {
  username: string;
  password: string;
  role: string;
  id: number;
}[];
const records: unknown[] = [];
const put = (n: string, x: unknown) =>
  writeFileSync(
    `${out}/${n}.json`,
    JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2),
  );
const pass = (name: string, details: unknown = {}) => {
  records.push({ name, details, at: new Date().toISOString() });
  put('results', records);
  console.log('PASS ' + name);
};
const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
  withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      return work(db);
    },
    { databaseUrl: fixture.migrationUrl },
  );
const request = (format: string, extra = '', signal?: AbortSignal) =>
  new Request('http://127.0.0.1:3100/reports/probe/run', {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3100',
      origin: 'http://127.0.0.1:3100',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: `format=${format}${extra}`,
    signal,
  });
async function main() {
  await inspect(async () => undefined);
  assert.equal(new URL(fixture.runtimeUrl).username, 'litigation_runtime');
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: fixture.runtimeUrl }),
    log: [{ emit: 'event', level: 'query' }],
  });
  let queries = 0;
  runtime.$on('query', () => queries++);
  const admin = await createApprovedMigrationPrismaClient(fixture.migrationUrl);
  const audit = () =>
    inspect(
      async (db) =>
        (
          await db.query(
            `SELECT id::text,action,resource_identifier,correlation_id::text,event_metadata,parameters FROM public.audit_events WHERE resource_identifier LIKE 'report:%' ORDER BY id`,
          )
        ).rows,
    );
  const sessions: Session[] = [];
  const change = async (id: number, data: Prisma.UserAccountUpdateInput) => {
    await inspect(async () => undefined);
    const current = await admin.userAccount.findUniqueOrThrow({ where: { id } });
    const actor = logins.find((x) => x.role === 'Administrator')!.id;
    if (typeof data.isEnabled === 'boolean' && data.isEnabled !== current.isEnabled) {
      const input = { accountId: id, expectedSessionVersion: current.sessionVersion };
      const dependencies = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
      if (!data.isEnabled) await disableManagedAccount(actor, input, dependencies);
      else {
        const temporaryPassword = randomBytes(32).toString('base64url');
        await reactivateManagedAccount(actor, { ...input, temporaryPassword }, dependencies);
        const account = await admin.userAccount.findUniqueOrThrow({ where: { id } });
        const login = logins.find((x) => x.id === id)!;
        assert.equal(
          await changeOwnPassword(
            {
              accountId: id,
              sessionVersion: account.sessionVersion,
              currentPassword: temporaryPassword,
              newPassword: login.password,
            },
            dependencies,
          ),
          'changed',
        );
        const user = await authenticateCredentials(login, dependencies);
        assert.ok(user);
        Object.assign(
          sessions.find((x) => Number(x.user.id) === id)!,
          { user, expires: new Date(createSessionClaims(user).absoluteExpiresAt).toISOString() },
        );
      }
      return;
    }
    await admin.$transaction(async (tx) => {
      await setMigrationAuditContext(tx, createMaintenanceAuditMetadata());
      await tx.userAccount.update({ where: { id }, data });
    });
  };
  try {
    for (const login of logins) {
      const u = await authenticateCredentials(login, {
        database: runtime,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      assert.ok(u);
      const c = createSessionClaims(u);
      sessions.push({ user: u, expires: new Date(c.absoluteExpiresAt).toISOString() });
    }
    pass('four real password authentications', { roles: sessions.map((s) => s.user.role) });
    const engine = createReportEngine(probeDefinitions, runtime),
      s = sessions.find((session) => session.user.role === 'Lawyer')!;
    let before = await audit();
    for (const session of sessions) {
      assert.equal((await engine.catalog(session)).length, probeDefinitions.length);
      await engine.describe(session, 'probe-volume');
    }
    assert.deepEqual(await audit(), before);
    pass('catalog/options do not emit report events');
    const searchPairs = [
      'أَحــمد',
      'احمد',
      'عبد العزيز',
      'عبدالعزيز',
      'محكمة',
      'محكمه',
      'الدعوى',
      'الدعوي',
      '١٤٠',
      '140',
      'JTI',
      'قTI',
      'Ā',
    ];
    for (const text of searchPairs) {
      const expected = await inspect(
        async (db) =>
          (await db.query('SELECT public.ar_normalise($1) value', [text])).rows[0].value,
      );
      assert.equal(reportSearchText(text), expected);
    }
    pass('selector normalization matches current database authority; J remains distinct');
    const oracle = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT h.id,h.hearing_date::text date,m.client_id,m.branch_id,h.is_archived archived,m.is_archived matter_archived,c.is_archived client_archived FROM public.hearings h LEFT JOIN public.matters m ON m.id=h.matter_id LEFT JOIN public.clients c ON c.id=m.client_id ORDER BY h.id',
          )
        ).rows,
    );
    put('volume-oracle', oracle);
    assert.ok(oracle.length > 13000);
    const probeData = await reportSnapshot(
      s,
      runtime,
      'run',
      volumeProbe.descriptor.permissions,
      (tx) =>
        volumeProbe.query(
          tx,
          parseReportInput(volumeProbe.descriptor, new URLSearchParams('format=preview'))
            .parameters,
        ),
    );
    assert.equal(validateReportData(volumeProbe.descriptor, probeData), oracle.length);
    pass('adapter and typed result validate independently before execution audit');
    queries = 0;
    const start = performance.now();
    const preview = await engine.handle(s, request('preview'), 'probe-volume', 'run');
    assert.equal(preview.status, 200, await preview.clone().text());
    const result = await preview.json();
    assert.equal(result.rowCount, oracle.length);
    assert.deepEqual(
      result.data.sections[0].groups[0].rows.map((r: { id: string }) => Number(r.id)),
      oracle.slice(0, 50).map((r) => r.id),
    );
    pass('real-volume preview uses complete query and bounded visible rows', {
      rows: result.rowCount,
      preview: 50,
      queries,
      milliseconds: performance.now() - start,
      archived: oracle.filter((r) => r.archived || r.matter_archived || r.client_archived).length,
    });
    before = await audit();
    for (const [name, session] of [
      ['anonymous', null],
      ['expired', { ...s, expires: '2000-01-01T00:00:00Z' }],
      [
        'version-mismatch',
        { ...s, user: { ...s.user, sessionVersion: s.user.sessionVersion + 1 } },
      ],
      ['role-mismatch', { ...s, user: { ...s.user, role: 'Administrator' } }],
      ['person-mismatch', { ...s, user: { ...s.user, personId: s.user.personId + 9999 } }],
      ['password-change', { ...s, user: { ...s.user, mustChangePassword: true } }],
    ] as const) {
      let called = 0;
      const guarded = createReportEngine(
        [
          {
            descriptor: edgeDescriptor,
            query: async () => {
              called++;
              return edgeData;
            },
          },
        ],
        runtime,
      );
      const r = await guarded.handle(session as Session, request('preview'), 'probe-edge', 'run');
      assert.ok([401, 403].includes(r.status), name);
      assert.equal(called, 0);
      pass('real service denial before adapter: ' + name);
    }
    for (const field of ['isEnabled', 'mustChangePassword'] as const) {
      const id = Number(s.user.id);
      const prior = await admin.userAccount.findUniqueOrThrow({ where: { id } });
      await change(id, field === 'isEnabled' ? { isEnabled: false } : { mustChangePassword: true });
      try {
        const r = await engine.handle(s, request('xlsx'), 'probe-volume', 'export');
        assert.equal(r.status, 401);
      } finally {
        await change(id, {
          isEnabled: prior.isEnabled,
          mustChangePassword: prior.mustChangePassword,
        });
      }
      pass('fresh database denial: ' + field);
    }
    const forged = [
      '&client=0',
      '&client=1&client=2',
      '&sql=SELECT',
      '&template=evil',
      '&client=2147483647',
      '&from=2026-02-29',
      '&from=2026-12-31&to=2026-01-01',
    ];
    for (const extra of forged)
      assert.equal(
        (await engine.handle(s, request('preview', extra), 'probe-volume', 'run')).status,
        400,
      );
    assert.equal((await engine.handle(s, request('preview'), 'not-registered', 'run')).status, 404);
    assert.deepEqual(await audit(), before);
    pass('forged/unknown inputs and denied sessions emit no report success');
    const variants = [
      ['branch-null', '&branch=unassigned', oracle.filter((r) => r.branch_id === null)],
      ['client-null', '&client=unassigned', oracle.filter((r) => r.client_id === null)],
      ['day', '&from=2026-09-21&to=2026-09-21', oracle.filter((r) => r.date === '2026-09-21')],
    ] as const;
    for (const [name, extra, rows] of variants) {
      const r = await engine.handle(s, request('preview', extra), 'probe-volume', 'run');
      assert.equal(r.status, 200);
      assert.equal((await r.json()).rowCount, rows.length);
      pass('independent filter oracle ' + name, { count: rows.length });
    }
    for (const session of sessions) {
      const r = await engine.handle(session, request('xlsx'), 'probe-empty', 'export');
      assert.equal(r.status, 200, await r.clone().text());
      pass('ordinary report export for ' + session.user.role);
    }
    for (const [id, format] of [
      ['probe-volume', 'xlsx'],
      ['probe-edge', 'xlsx'],
      ['probe-edge', 'pdf'],
      ['probe-empty', 'pdf'],
      ['probe-card', 'pdf'],
      ['probe-date', 'pdf'],
      ['probe-flat', 'pdf'],
    ] as const) {
      before = await audit();
      queries = 0;
      const at = performance.now();
      const r = await engine.handle(s, request(format), id, 'export');
      assert.equal(r.status, 200, await r.clone().text());
      const bytes = Buffer.from(await r.arrayBuffer());
      writeFileSync(`${out}/${id}.${format}`, bytes, { flag: 'wx' });
      const sha = createHash('sha256').update(bytes).digest('hex');
      assert.equal(sha, r.headers.get('x-artifact-sha256'));
      const events = (await audit()).slice(before.length);
      assert.deepEqual(
        events.map((x) => x.action),
        ['report_executed', 'export_completed'],
      );
      assert.equal(events[0]!.correlation_id, events[1]!.correlation_id);
      assert.equal(events[1]!.event_metadata.sha256, sha);
      pass('saved ' + id + '.' + format, {
        bytes: bytes.length,
        sha256: sha,
        queries,
        milliseconds: performance.now() - at,
        events,
      });
    }
    put('edge-values', edgeValues);
    // Missing mandatory asset: data execution happened, generation did not.
    before = await audit();
    const assets = process.env.REPORT_ASSET_ROOT;
    delete process.env.REPORT_ASSET_ROOT;
    try {
      assert.equal((await engine.handle(s, request('pdf'), 'probe-empty', 'export')).status, 500);
    } finally {
      process.env.REPORT_ASSET_ROOT = assets;
    }
    assert.deepEqual(
      (await audit()).slice(before.length).map((x) => x.action),
      ['report_executed'],
    );
    pass('mandatory asset failure emits only completed query');
    const failed = createReportEngine(
      [
        {
          descriptor: edgeDescriptor,
          query: async () => {
            throw Error('test-only query failure');
          },
        },
      ],
      runtime,
    );
    before = await audit();
    assert.equal((await failed.handle(s, request('preview'), 'probe-edge', 'run')).status, 500);
    assert.deepEqual(await audit(), before);
    pass('query failure has no success');
    // Add a task-owned failing trigger, never weaken or disable an existing guard.
    await inspect(async (db) => {
      await db.query(
        "CREATE FUNCTION public.task61_reject_export() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'task61 simulated unavailable audit storage'; END $$",
      );
      await db.query(
        "CREATE TRIGGER task61_reject_export BEFORE INSERT ON public.audit_events FOR EACH ROW WHEN (NEW.action='export_completed' AND NEW.resource_identifier LIKE 'report:%') EXECUTE FUNCTION public.task61_reject_export()",
      );
    });
    before = await audit();
    try {
      assert.equal((await engine.handle(s, request('xlsx'), 'probe-empty', 'export')).status, 500);
    } finally {
      await inspect(async (db) => {
        await db.query('DROP TRIGGER task61_reject_export ON public.audit_events');
        await db.query('DROP FUNCTION public.task61_reject_export()');
      });
    }
    assert.deepEqual(
      (await audit()).slice(before.length).map((x) => x.action),
      ['report_executed'],
    );
    pass('actual audit storage failure prevents artifact release');
    // Explicit retry is a new operation and each physical attempt has two phases.
    before = await audit();
    for (let i = 0; i < 2; i++)
      assert.equal((await engine.handle(s, request('xlsx'), 'probe-empty', 'export')).status, 200);
    const retries = (await audit()).slice(before.length);
    assert.deepEqual(
      retries.map((x) => x.action),
      ['report_executed', 'export_completed', 'report_executed', 'export_completed'],
    );
    assert.notEqual(retries[0]!.correlation_id, retries[2]!.correlation_id);
    pass('explicit retry has distinct truthful operations');
    for (const mode of ['cancel', 'revoke'] as const) {
      before = await audit();
      const abort = new AbortController();
      const pending = engine.handle(s, request('pdf', '', abort.signal), 'probe-edge', 'export');
      let seen = false;
      for (let i = 0; i < 400; i++) {
        if ((await audit()).length > before.length) {
          seen = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(seen);
      if (mode === 'cancel') abort.abort();
      else await change(Number(s.user.id), { isEnabled: false });
      let response: Response;
      try {
        response = await pending;
        assert.equal(response.status, mode === 'cancel' ? 409 : 401);
      } finally {
        if (mode === 'revoke') await change(Number(s.user.id), { isEnabled: true });
      }
      assert.deepEqual(
        (await audit()).slice(before.length).map((x) => x.action),
        ['report_executed'],
      );
      pass('mid-generation ' + mode + ' releases no file');
    }
    const all = await audit();
    assert.ok(all.every((x) => x.action !== 'download_completed'));
    put('audit-events', all);
    pass('complete integration', { reportEvents: all.length });
  } finally {
    await runtime.$disconnect();
    await admin.$disconnect();
  }
}
main().catch((error) => {
  writeFileSync(
    `${priv}/integration-${out.split(/[\\/]/).at(-1)}-failure.txt`,
    String(error.stack),
    { flag: 'wx' },
  );
  console.error('Report integration failed; private diagnostic retained');
  process.exitCode = 1;
});
