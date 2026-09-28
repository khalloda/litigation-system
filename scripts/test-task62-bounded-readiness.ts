/** Fixture-only adversarial runner proof. Input contains private fixture/session
 * paths; neither genuine tokens nor the approved business payload belongs in Git. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, statfsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { decode } from 'next-auth/jwt';
import { readSessionClaims } from '../src/lib/auth/session';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { boundedHash, prepareBoundedJournal, runBoundedTask62 } from './lib/task62-bounded-runner';
import { task62SourceFailures } from './lib/task62-source-checkpoint';
import type { ClientBase } from 'pg';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const input = read(process.argv[2]!);
const fixture = read(input.fixturePath);
const plan = read(input.planPath);
const output = input.output;
const records: Record<string, unknown>[] = [];
const caseNames = [
  'unauthorized_role',
  'stale_parent',
  'existing_party',
  'retired_party',
  'native_hearing',
  'stale_hearing',
  'existing_selection',
  'revoked_session',
  'password_reset_required',
  'forced_mid_operation',
];
const requestedCases: string[] = input.caseNames ?? caseNames;
assert.ok(requestedCases.length > 0);
assert.equal(new Set(requestedCases).size, requestedCases.length);
assert.ok(requestedCases.every((name) => caseNames.includes(name)));
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const put = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
async function connection<T>(url: string, work: (db: ClientBase) => Promise<T>) {
  return withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(url), fixture.environment);
      return work(db);
    },
    { databaseUrl: url },
  );
}
async function snapshot(url: string) {
  return connection(url, async (db) => {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const rows = [];
    for (const r of (
      await db.query(
        "SELECT schemaname,tablename FROM pg_tables WHERE schemaname !~ '^pg_' AND schemaname<>'information_schema' ORDER BY 1,2",
      )
    ).rows) {
      const name = `${r.schemaname}.${r.tablename}`;
      rows.push({
        name,
        ...(
          await db.query(
            `SELECT count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text COLLATE "C"),''),'UTF8')),'hex') sha256 FROM ${quote(r.schemaname)}.${quote(r.tablename)} t`,
          )
        ).rows[0],
      });
    }
    const sequences = [];
    for (const r of (
      await db.query(
        "SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname !~ '^pg_' ORDER BY 1,2",
      )
    ).rows) {
      const name = `${r.schemaname}.${r.sequencename}`;
      sequences.push({
        name,
        ...(
          await db.query(
            `SELECT last_value::text,is_called,log_cnt::text FROM ${quote(r.schemaname)}.${quote(r.sequencename)}`,
          )
        ).rows[0],
      });
    }
    await db.query('COMMIT');
    return { rows, sequences };
  });
}
async function authority(path: string) {
  const cookie = read(path);
  const value = await decode({
    token: cookie.token,
    salt: cookie.cookieName,
    secret: process.env.AUTH_SECRET!,
  });
  assert.ok(value);
  const a = readSessionClaims(value);
  assert.ok(a);
  return a;
}
async function context(db: ClientBase, a: Awaited<ReturnType<typeof authority>>) {
  await db.query('SELECT public.audit_set_human_context($1)', [a.userId]);
  await db.query(
    "SELECT public.audit_set_event_context($1::uuid,$1::uuid,$2::uuid,NULL,'task62-readiness-fixture-conflict','system')",
    [randomUUID(), a.auditSessionId],
  );
}
async function clone(label: string) {
  assert.match(label, /^[a-z0-9_]+$/u);
  const prefix = input.casePrefix ?? '';
  assert.match(prefix, /^[a-z0-9_]*$/u);
  const name = `litigation_task62_bounded_${prefix}${label}`;
  await connection(fixture.migrationUrl, async (db) => {
    assert.equal(
      (await db.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1', [name])).rows[0]
        .n,
      0,
    );
    assert.match(input.templateDatabase, /^litigation_task62_bounded_[a-z0-9_]+$/u);
    const templateBytes = Number(
      (await db.query('SELECT pg_database_size($1) bytes', [input.templateDatabase])).rows[0].bytes,
    );
    assert.ok(Number.isSafeInteger(templateBytes) && templateBytes > 0);
    // Docker Desktop stores its data disk on C: on the approved Windows host.
    // Preserve shared-engine headroom before each full-data fixture clone.
    const disk = statfsSync(process.platform === 'win32' ? 'C:/' : process.cwd());
    assert.ok(
      disk.bavail * disk.bsize > 16 * 1024 ** 3 + 2 * templateBytes,
      'Insufficient Docker host storage headroom for another fixture clone',
    );
    await db.query(`CREATE DATABASE "${name}" TEMPLATE "${input.templateDatabase}"`);
    await db.query(`REVOKE TEMPORARY ON DATABASE "${name}" FROM PUBLIC`);
  });
  const url = new URL(fixture.migrationUrl);
  url.pathname = '/' + name;
  return url.href;
}
function parameters(url: string, label: string, sessionPath = input.adminSession) {
  const target = new URL(url),
    wrapperPath = `${input.privateRoot}/${label}-wrapper.json`,
    journalPath = `${input.privateRoot}/${label}-journal.json`;
  writeFileSync(
    wrapperPath,
    JSON.stringify({
      scope: 'fixture-readiness',
      cluster: fixture.clusterId,
      database: target.pathname.slice(1),
      host: target.hostname,
      port: Number(target.port),
      planSha256: boundedHash(readFileSync(input.planPath)),
      runnerSha256: boundedHash(readFileSync('scripts/lib/task62-bounded-runner.ts')),
      fixtureEnvironment: fixture.environment,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  prepareBoundedJournal(input.planPath, wrapperPath, journalPath);
  return {
    planPath: input.planPath,
    wrapperPath,
    journalPath,
    mode: 'apply' as const,
    sessionPath,
    databaseUrl: url,
  };
}
async function rejected(
  label: string,
  pattern: RegExp,
  prepare?: (db: ClientBase, a: Awaited<ReturnType<typeof authority>>) => Promise<void>,
  sessionPath?: string,
  midWrite = false,
) {
  if (!requestedCases.includes(label)) return;
  const url = await clone(label);
  if (prepare)
    await connection(url, async (db) => {
      await db.query('BEGIN');
      await context(db, await authority(input.adminSession));
      await prepare(db, await authority(input.adminSession));
      await db.query('COMMIT');
    });
  const before = await snapshot(url),
    args = parameters(url, label, sessionPath);
  await assert.rejects(runBoundedTask62(args), pattern);
  const after = await snapshot(url);
  assert.deepEqual(after.rows, before.rows, 'Rejected run changed committed rows');
  if (!midWrite) assert.deepEqual(after.sequences, before.sequences);
  else
    assert.notDeepEqual(
      after.sequences,
      before.sequences,
      'Expected preserved rollback reservations',
    );
  const record = {
    label,
    status: 'PASS',
    all145TablesUnchangedByRejectedRun: true,
    sequences: midWrite ? { before: before.sequences, after: after.sequences } : 'exact',
    database: new URL(url).pathname.slice(1),
  };
  put(label, record);
  records.push(record);
  console.log('PASS ' + label);
}
async function main() {
  mkdirSync(output);
  await connection(fixture.migrationUrl, async (db) => {
    assert.deepEqual(await task62SourceFailures(db), []);
  });
  const admin = await authority(input.adminSession);
  const matterSave = async (db: ClientBase, id: number, values: unknown, parties?: unknown) => {
    const a = admin,
      expiry = new Date(a.absoluteExpiresAt).toISOString();
    const state = (
      await db.query('SELECT public.matter_edit_state($1,$2,$3,$4::timestamptz,$5) s', [
        a.userId,
        a.sessionVersion,
        a.role,
        expiry,
        id,
      ])
    ).rows[0].s;
    return (
      await db.query('SELECT public.matter_edit_save($1,$2,$3,$4::timestamptz,$5::jsonb) r', [
        a.userId,
        a.sessionVersion,
        a.role,
        expiry,
        JSON.stringify({
          id,
          version: state.record.version,
          submission: randomUUID(),
          values,
          ...(parties ? { parties } : {}),
        }),
      ])
    ).rows[0].r;
  };
  await rejected('unauthorized_role', /false|true|assert/iu, undefined, input.lawyerSession);
  await rejected('stale_parent', /strictly equal|version/iu, (db) =>
    matterSave(db, plan.parentMatterUnion[0], { notes_1: 'TASK-OWNED READINESS CONFLICT' }),
  );
  const q = plan.payloads.partyReleases[0];
  await rejected('existing_party', /strictly equal|version|party side conflict/iu, (db) =>
    matterSave(db, q.sourceRow.matterId, {}, [
      { ...q.approvedParty, roles: [{ id: null, role_id: 2, ordinal: 1 }] },
    ]),
  );
  await rejected('retired_party', /strictly equal|version|party side conflict/iu, async (db) => {
    await matterSave(db, q.sourceRow.matterId, {}, [
      { ...q.approvedParty, roles: [{ id: null, role_id: 2, ordinal: 1 }] },
    ]);
    await matterSave(db, q.sourceRow.matterId, {}, []);
  });
  const h = plan.payloads.hearingAdditions[0].sourceRow;
  await rejected('native_hearing', /indistinguishable native hearing/u, async (db) => {
    const court = (
      await db.query('SELECT id FROM public.lookup_court WHERE label_ar=$1', [h.lookupRaw.court_id])
    ).rows;
    assert.equal(court.length, 1);
    const action = (
      await db.query('SELECT id FROM public.lookup_hearing_action WHERE label_ar=$1', [
        h.lookupRaw.action_id,
      ])
    ).rows;
    assert.equal(action.length, 1);
    await db.query('SELECT public.hearing_edit_save($1,$2,$3,$4::timestamptz,$5::jsonb)', [
      admin.userId,
      admin.sessionVersion,
      admin.role,
      new Date(admin.absoluteExpiresAt).toISOString(),
      JSON.stringify({
        id: null,
        version: null,
        submission: randomUUID(),
        values: { ...h.currentFields, court_id: court[0].id, action_id: action[0].id },
        attendees: [],
      }),
    ]);
  });
  const s = plan.payloads.selectionInitialization.find(
    (x: { approvedSelection: { existingHearingId: number | null } }) =>
      x.approvedSelection.existingHearingId !== null,
  ).approvedSelection;
  await rejected('stale_hearing', /strictly equal|version/iu, async (db) => {
    await db.query('SELECT public.hearing_edit_save($1,$2,$3,$4::timestamptz,$5::jsonb)', [
      admin.userId,
      admin.sessionVersion,
      admin.role,
      new Date(admin.absoluteExpiresAt).toISOString(),
      JSON.stringify({
        id: s.existingHearingId,
        version: '1',
        submission: randomUUID(),
        values: { decision: 'TASK-OWNED READINESS CONFLICT' },
      }),
    ]);
  });
  await rejected('existing_selection', /Existing current selection conflict/u, async (db) => {
    await db.query(
      'SELECT public.client_report_selection_save($1,$2,$3,$4,$5::timestamptz,$6::jsonb)',
      [
        admin.userId,
        admin.personId,
        admin.sessionVersion,
        admin.role,
        new Date(admin.absoluteExpiresAt).toISOString(),
        JSON.stringify({
          client: 245,
          id: s.matterId,
          version: '0',
          matterVersion: s.baselineMatterVersion,
          hearingId: s.existingHearingId,
          hearingVersion: '1',
          selected: true,
          submission: randomUUID(),
        }),
      ],
    );
  });
  await rejected('revoked_session', /Current authorized matter session/u, async (db) => {
    await db.query(
      'UPDATE public.user_accounts SET session_version=session_version+1 WHERE id=$1',
      [admin.userId],
    );
  });
  await rejected('password_reset_required', /Current authorized matter session/u, async (db) => {
    await db.query('UPDATE public.user_accounts SET must_change_password=true WHERE id=$1', [
      admin.userId,
    ]);
  });
  await rejected(
    'forced_mid_operation',
    /Task-owned forced hearing failure/u,
    async (db) => {
      await db.query(
        "CREATE FUNCTION _migration.task62_test_abort() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Task-owned forced hearing failure'; END$$",
      );
      await db.query(
        'CREATE TRIGGER task62_test_abort BEFORE INSERT ON public.hearings FOR EACH ROW EXECUTE FUNCTION _migration.task62_test_abort()',
      );
    },
    undefined,
    true,
  );
  assert.deepEqual(records.map((record) => record.label).sort(), [...requestedCases].sort());
  put('result', {
    status: 'PASS',
    requestedCases,
    completeSuite: requestedCases.length === caseNames.length,
    cases: records,
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
