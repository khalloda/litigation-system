import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  readFileSync,
  chmodSync,
  statSync,
} from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import type { Session } from 'next-auth';
import sharp from 'sharp';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createDatabaseClient } from '../src/lib/db';
import { AUTH_ROLES } from '../src/lib/auth/constants';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import {
  clientId,
  parseClientFilters,
  clientListHref,
  ClientFilterError,
  readClients,
  readClient,
  readClientContacts,
  readContact,
  readLogoMetadata,
  clientCountQuery,
  clientRowsQuery,
  clientDetailQuery,
  type LogoMetadata,
} from '../src/lib/client-query';
import { readClientLogoFile } from '../src/lib/client-logo-file';
import { inspectLogo } from '../src/lib/client-logo-image';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  withIsolatedPostgres,
  assertIsolatedTestCluster,
  type IsolatedPostgres,
} from './lib/isolated-postgres-fixture';
import { assertCurrentClientSource } from './lib/client-regression-source';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { initialiseActors } from './test-client-contacts';

export function clientViewer(role: string): Session {
  return {
    expires: new Date(Date.now() + 60000).toISOString(),
    user: {
      id: '1',
      personId: 1,
      name: 'TEST ONLY',
      username: 'test',
      role,
      mustChangePassword: false,
      sessionVersion: 1,
      auditSessionId: '00000000-0000-4000-8000-000000000000',
    },
  } as Session;
}
export async function setupClientCases(fixture: IsolatedPostgres) {
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
    { databaseUrl: fixture.migrationUrl },
  );
  return withApprovedMigrationClient(
    async (db) => {
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
          "SELECT audit_set_event_context($1::uuid,$2::uuid,$3::uuid,NULL,'Task41 Phase2 TEST ONLY','system')",
          [randomUUID(), randomUUID(), randomUUID()],
        );
        const create = async (table: string, parent: number | null, values: object) =>
          (
            await db.query('SELECT client_contact_create($1,$2,$3,$4::jsonb) id', [
              table,
              parent,
              randomUUID(),
              JSON.stringify(values),
            ])
          ).rows[0].id as number;
        const ids: number[] = [];
        for (let i = 0; i < 28; i++)
          ids.push(
            await create('clients', null, {
              name_ar: '__PHASE2_TEST_DUPLICATE',
              status: 'Disabled',
              cash_or_probono: '',
            }),
          );
        const primary = ids[0]!;
        const literal = await create('clients', null, {
          name_ar: '__PHASE2_TEST_%_\\ JTI أحمد',
          name_en: '__PHASE2_ENGLISH',
          full_name: '__PHASE2_FULL\nsecond line',
          client_start: '2026-09-09',
        });
        const contacts: number[] = [];
        for (let i = 0; i < 28; i++)
          contacts.push(
            await create('contacts', primary, {
              contact_name: '__PHASE2_CONTACT أحمد',
              full_name: '__PHASE2_SECONDARY',
              email: 'fixture@example.invalid',
              address: 'TEST ONLY\nSecond line',
            }),
          );
        const archivedContact = contacts[1]!;
        await db.query("SELECT client_contact_set_archived('contacts',$1,1,true)", [
          archivedContact,
        ]);
        await db.query("SELECT client_contact_update('clients',$1,1,$2::jsonb)", [
          primary,
          JSON.stringify({ contact_person_id: contacts[0] }),
        ]);
        const archived = ids[2]!;
        const archivedParentContact = await create('contacts', archived, {
          contact_name: '__PHASE2_ARCHIVED_PARENT_CONTACT',
        });
        await db.query("SELECT client_contact_set_archived('clients',$1,1,true)", [archived]);
        await db.query('COMMIT');
        return {
          ids,
          primary,
          literal,
          contacts,
          archived,
          archivedContact,
          archivedParentContact,
        };
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    },
    { databaseUrl: fixture.migrationUrl },
  );
}
export async function proveClientReads(
  fixture: IsolatedPostgres,
  logoRoot: string,
  output: string,
) {
  const database = createDatabaseClient(fixture.runtimeUrl);
  const viewer = clientViewer('Lawyer');
  try {
    let calls = 0;
    const never = {
      $transaction: () => {
        calls++;
        throw new Error('protected read');
      },
    } as unknown as PrismaClient;
    for (const denied of [
      null,
      clientViewer('Unknown'),
      { ...viewer, user: { ...viewer.user, mustChangePassword: true } },
    ]) {
      for (const work of [
        () => readClients(denied, {}, never),
        () => readClient(denied, '1', never),
        () => readClientContacts(denied, '1', '1', never),
        () => readContact(denied, '1', '1', never),
        () => readLogoMetadata(denied, '1', never),
        () => readClientLogoFile(denied, undefined, null),
      ])
        await assert.rejects(work, AuthorizationError);
    }
    assert.equal(calls, 0);
    for (const bad of [
      { q: ['a', 'b'] },
      { q: 'x'.repeat(161) },
      { q: '\0' },
      { status: 'active' },
      { archive: 'yes' },
      { page: '0' },
      { page: '1e2' },
      { page: '2147483648' },
    ])
      assert.throws(() => parseClientFilters(bad), ClientFilterError);
    for (const bad of ['0', '-1', '01', '1e2', '2147483648', 'new']) {
      assert.equal(clientId(bad), null);
      assert.equal(await readClient(viewer, bad, never), null);
      assert.equal(await readContact(viewer, '1', bad, never), null);
    }
    const f = parseClientFilters({ q: 'أحمد', status: 'Disabled', archive: 'all', page: '2' });
    assert.deepEqual(
      parseClientFilters(
        Object.fromEntries(new URL(clientListHref(f), 'http://localhost').searchParams),
      ),
      f,
    );
    console.log(
      'PASS denied service calls before protected reads; bounded inputs and filter navigation',
    );
    const baseline = await withApprovedMigrationClient(
      async (db) => ({
        clients: (
          await db.query(
            'SELECT id,name_ar,legacy_id FROM clients ORDER BY name_ar COLLATE "arabic",id',
          )
        ).rows,
        contacts: (await db.query('SELECT id,client_id,contact_name FROM contacts ORDER BY id'))
          .rows,
        logos: (await db.query('SELECT client_id FROM client_logos ORDER BY client_id')).rows,
      }),
      { databaseUrl: fixture.migrationUrl },
    );
    assert.equal(baseline.clients.length, 318);
    assert.equal(baseline.contacts.length, 188);
    assert.equal(baseline.logos.length, 54);
    const before = await withApprovedMigrationClient(staffReadOnlyState, {
      databaseUrl: fixture.migrationUrl,
    });
    for (const role of AUTH_ROLES) {
      const session = clientViewer(role);
      const all: number[] = [];
      for (let page = 1; page <= 13; page++) {
        const result = await readClients(session, { page: String(page) }, database);
        assert.equal(result.total, 318);
        all.push(...result.rows.map((row) => row.id));
      }
      assert.deepEqual(
        all,
        baseline.clients.map((row) => row.id),
      );
      for (const c of baseline.contacts) {
        const detail = await readContact(session, String(c.client_id), String(c.id), database);
        assert.ok(detail);
        assert.equal(detail.contactName, c.contact_name);
        assert.ok(!JSON.stringify(detail).includes('home_phone'));
        assert.equal(
          await readContact(session, String(c.client_id + 100000), String(c.id), database),
          null,
        );
      }
    }
    let noContacts = 0,
      maxMatters = 0;
    for (const c of baseline.clients) {
      const detail = await readClient(viewer, String(c.id), database);
      assert.ok(detail);
      assert.equal(detail.legacyId, c.legacy_id);
      assert.notEqual(detail.id, detail.legacyId);
      assert.equal(detail.mainContact, null);
      maxMatters = Math.max(maxMatters, detail.matterCount);
      const contacts = await readClientContacts(viewer, String(c.id), '1', database);
      assert.ok(contacts);
      if (!contacts.total) noContacts++;
    }
    assert.equal(noContacts, 207);
    assert.equal(maxMatters, 378);
    assert.equal(baseline.contacts.filter((c) => !c.contact_name?.trim()).length, 6);
    for (const l of baseline.logos) {
      const metadata = await readLogoMetadata(viewer, String(l.client_id), database);
      assert.ok(metadata);
      assert.ok(await readClientLogoFile(viewer, logoRoot, metadata));
    }
    assert.deepEqual(
      await withApprovedMigrationClient(staffReadOnlyState, { databaseUrl: fixture.migrationUrl }),
      before,
    );
    console.log(
      'PASS all four roles; all 318 clients, 188 contacts, six unnamed contacts, 207 no-contact clients, 378-matter maximum and 54 decoded logos; no row/audit/sequence/catalog changes',
    );
    const plans = await withApprovedMigrationClient(
      async (db) => {
        const output = [];
        for (const [label, query] of [
          ['list', clientRowsQuery(parseClientFilters({}), 1)],
          ['contact search', clientCountQuery(parseClientFilters({ q: 'احمد' }))],
          ['English search', clientRowsQuery(parseClientFilters({ q: 'JTI' }), 1)],
          [
            'largest detail',
            clientDetailQuery(
              (
                await db.query(
                  'SELECT client_id FROM matters GROUP BY client_id ORDER BY count(*) DESC LIMIT 1',
                )
              ).rows[0].client_id,
            ),
          ],
        ] as const) {
          output.push({
            label,
            plan: (
              await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query.text, query.values)
            ).rows[0]['QUERY PLAN'],
          });
        }
        return output;
      },
      { databaseUrl: fixture.migrationUrl },
    );
    writeFileSync(join(output, 'query-plans.json'), JSON.stringify(plans, null, 2));
    const cases = await setupClientCases(fixture);
    const nativeBefore = await withApprovedMigrationClient(staffReadOnlyState, {
      databaseUrl: fixture.migrationUrl,
    });
    const duplicate = await readClients(
      viewer,
      { q: '__PHASE2_TEST_DUPLICATE', archive: 'all' },
      database,
    );
    assert.equal(duplicate.total, 28);
    assert.equal(duplicate.rows.length, 25);
    const next = await readClients(
      viewer,
      { q: '__PHASE2_TEST_DUPLICATE', archive: 'all', page: '2' },
      database,
    );
    assert.deepEqual(
      [...duplicate.rows, ...next.rows].map((r) => r.id),
      cases.ids,
    );
    assert.equal((await readClients(viewer, { q: '__PHASE2_CONTACT احمد' }, database)).total, 1);
    assert.equal(
      (await readClients(viewer, { q: '__PHASE2_SECONDARY' }, database)).rows[0]?.matchedContact,
      true,
    );
    for (const q of ['__PHASE2_ENGLISH', '__PHASE2_FULL', '%_\\', '__PHASE2_TEST_%_\\ jti احمد'])
      assert.equal((await readClients(viewer, { q }, database)).rows[0]?.id, cases.literal);
    assert.equal((await readClients(viewer, { q: '__PHASE2_TEST_DUPLICATE' }, database)).total, 27);
    assert.equal(
      (await readClients(viewer, { q: '__PHASE2_TEST_DUPLICATE', archive: 'archived' }, database))
        .total,
      1,
    );
    assert.equal(
      (await readClients(viewer, { q: '__PHASE2_TEST_DUPLICATE', status: 'Disabled' }, database))
        .total,
      27,
    );
    const detail = await readClient(viewer, String(cases.primary), database);
    assert.equal(detail?.mainContact?.id, cases.contacts[0]);
    assert.equal(detail?.legacyId, null);
    assert.equal(
      (await readClient(viewer, String(cases.literal), database))?.startDate,
      '2026-09-09',
    );
    const collection = await readClientContacts(viewer, String(cases.primary), '1', database);
    assert.equal(collection?.total, 28);
    assert.equal(collection?.rows.length, 25);
    assert.equal(
      (await readClientContacts(viewer, String(cases.primary), '2', database))?.rows.length,
      3,
    );
    assert.equal(
      (await readContact(viewer, String(cases.primary), String(cases.archivedContact), database))
        ?.isArchived,
      true,
    );
    assert.equal(
      (
        await readContact(
          viewer,
          String(cases.archived),
          String(cases.archivedParentContact),
          database,
        )
      )?.parentArchived,
      true,
    );
    assert.ok(
      !JSON.stringify(
        await readContact(viewer, String(cases.primary), String(cases.contacts[0]), database),
      ).includes('HOME_PHONE'),
    );
    assert.deepEqual(
      await withApprovedMigrationClient(staffReadOnlyState, { databaseUrl: fixture.migrationUrl }),
      nativeBefore,
    );
    await proveLogoFailures(
      viewer,
      logoRoot,
      (await readLogoMetadata(viewer, String(baseline.logos[0].client_id), database))!,
    );
    console.log(
      'PASS native duplicate pagination, multiple contact matches, Arabic/English/full-name/literal-wildcard search, independent archives, optional main contact, date-only and hidden home phone',
    );
    return cases;
  } finally {
    await database.$disconnect();
  }
}
async function proveLogoFailures(viewer: Session, root: string, metadata: LogoMetadata) {
  assert.equal(await readClientLogoFile(viewer, root, null), null);
  for (const patch of [
    { relativePath: '../outside.png' },
    { clientId: metadata.clientId + 1 },
    { byteSize: 0 },
    { byteSize: 2097153 },
    { sha256: '0'.repeat(64) },
    { contentType: 'image/svg+xml' },
    { fileName: 'file:stream.png' },
  ])
    assert.equal(await readClientLogoFile(viewer, root, { ...metadata, ...patch }), null);
  const logoFixtureRoot = resolve(tmpdir());
  const dir = mkdtempSync(join(logoFixtureRoot, 'litigation-client-logos-'));
  console.log('TASK owned logo failure fixture: ' + dir);
  const parent = join(dir, String(metadata.clientId));
  mkdirSync(parent);
  const file = join(parent, metadata.fileName);
  try {
    for (const format of ['png', 'jpeg', 'gif'] as const) {
      const name = 'fixture.' + format;
      const data = await sharp({
        create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
      })
        .toFormat(format)
        .toBuffer();
      writeFileSync(join(parent, name), data);
      assert.ok(
        await readClientLogoFile(viewer, dir, {
          ...metadata,
          ...inspectLogo(data, name),
          fileName: name,
          relativePath: String(metadata.clientId) + '/' + name,
        }),
      );
      unlinkSync(join(parent, name));
    }
    assert.equal(await readClientLogoFile(viewer, dir, metadata), null);
    writeFileSync(file, Buffer.alloc(metadata.byteSize));
    assert.equal(await readClientLogoFile(viewer, dir, metadata), null);
    unlinkSync(file);
    mkdirSync(file);
    assert.equal(await readClientLogoFile(viewer, dir, metadata), null);
    rmSync(file, { recursive: true });
    cpSync(join(root, metadata.relativePath), file);
    assert.ok(await readClientLogoFile(viewer, dir, metadata));
    // A task-owned exclusive file handle proves unreadability without changing
    // Windows ACLs, the sandbox, or the source logo's permissions.
    if (process.platform === 'win32') {
      const holder = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$stream=[System.IO.File]::Open($env:TASK_CLIENT_LOGO_FILE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::None); try { [Console]::Out.WriteLine('held'); [Console]::Out.Flush(); [Console]::In.ReadLine() | Out-Null } finally { $stream.Dispose() }",
        ],
        {
          windowsHide: true,
          env: {
            NODE_ENV: 'test',
            SystemRoot: process.env.SystemRoot,
            PATH: process.env.PATH,
            TASK_CLIENT_LOGO_FILE: file,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      const exited = new Promise<number | null>((done) => holder.once('exit', done));
      try {
        await new Promise<void>((done, reject) => {
          const timer = setTimeout(
            () => reject(new Error('exclusive fixture handle was not established')),
            5000,
          );
          holder.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
          });
          holder.stdout.once('data', (value) => {
            clearTimeout(timer);
            if (value.toString().trim() === 'held') done();
            else reject(new Error('unexpected fixture readiness'));
          });
          holder.once('exit', () => {
            clearTimeout(timer);
            reject(new Error('fixture handle holder exited early'));
          });
        });
        assert.throws(() => readFileSync(file));
        assert.equal(await readClientLogoFile(viewer, dir, metadata), null);
      } finally {
        holder.stdin.end('\n');
        assert.equal(await exited, 0);
      }
    } else {
      const mode = statSync(file).mode;
      chmodSync(file, 0);
      try {
        assert.throws(() => readFileSync(file));
        assert.equal(await readClientLogoFile(viewer, dir, metadata), null);
      } finally {
        chmodSync(file, mode);
      }
    }
    const undecodable = Buffer.from('474946383961010001000000003b', 'hex');
    const brokenName = 'undecodable.gif';
    const inspected = inspectLogo(undecodable, brokenName);
    const brokenPath = join(parent, brokenName);
    writeFileSync(brokenPath, undecodable);
    assert.equal(
      await readClientLogoFile(viewer, dir, {
        ...metadata,
        ...inspected,
        fileName: brokenName,
        relativePath: String(metadata.clientId) + '/' + brokenName,
      }),
      null,
    );
    unlinkSync(brokenPath);
    const buffer = readFileSync(file);
    buffer[buffer.length >> 1] = buffer[buffer.length >> 1]! ^ 1;
    writeFileSync(file, buffer);
    assert.equal(await readClientLogoFile(viewer, dir, metadata), null);
    unlinkSync(file);
    rmSync(parent, { recursive: true });
    symlinkSync(join(root, String(metadata.clientId)), parent, 'junction');
    try {
      assert.equal(await readClientLogoFile(viewer, dir, metadata), null);
    } finally {
      unlinkSync(parent);
    }
    console.log(
      'PASS logo absent/unreadable/undecodable/corrupt/mismatch/size/path/ADS/directory/junction rejection and valid file',
    );
  } finally {
    assert.ok(resolve(dir).startsWith(logoFixtureRoot + sep + 'litigation-client-logos-'));
    rmSync(dir, { recursive: true });
    console.log('PASS owned logo failure fixture removed: ' + dir);
  }
}
async function main() {
  assert.ok(
    process.env.CLIENT_READ_EVIDENCE_DIR,
    'Explicit external read-proof evidence directory required',
  );
  const output = resolve(process.env.CLIENT_READ_EVIDENCE_DIR);
  assert.ok(
    relative(process.cwd(), output).startsWith('..') || isAbsolute(relative(process.cwd(), output)),
    'Evidence must remain outside repository',
  );
  mkdirSync(output, { recursive: true });
  const preservedSource = await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        assert.equal(await assertCurrentClientSource(db), 62);
        assert.deepEqual((await staffReadOnlyState(db)).tables, preservedSource.tables);
      },
      {
        databaseUrl: fixture.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    const copyRoot = mkdtempSync(join(tmpdir(), 'litigation-client-read-logos-'));
    writeFileSync(
      join(output, 'read-isolation.json'),
      JSON.stringify(
        {
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          port: new URL(fixture.runtimeUrl).port,
          database: 'litigation',
          runtimePrincipal: 'litigation_runtime',
          restoredTablesEqualBeforeActors: true,
          copiedLogos: copyRoot,
        },
        null,
        2,
      ),
    );
    try {
      cpSync(process.env.CLIENT_LOGO_ROOT!, copyRoot, { recursive: true });
      await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
      await proveClientReads(fixture, copyRoot, output);
    } finally {
      assert.ok(
        resolve(copyRoot).startsWith(resolve(tmpdir()) + sep + 'litigation-client-read-logos-'),
      );
      rmSync(copyRoot, { recursive: true });
      writeFileSync(
        join(output, 'read-cleanup.json'),
        JSON.stringify({ copiedLogos: copyRoot, removed: true }, null, 2),
      );
    }
  });
  assert.deepEqual(
    await withApprovedMigrationClient(staffReadOnlyState, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    }),
    preservedSource,
  );
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/test-client-read-only.ts'))
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Client proof failed');
    process.exitCode = 1;
  });
