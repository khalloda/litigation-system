/** Genuine-session retry and lost-acknowledgement proof on owned full-data fixtures. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, statfsSync } from 'node:fs';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { boundedHash, prepareBoundedJournal, runBoundedTask62 } from './lib/task62-bounded-runner';
import { task62SourceFailures } from './lib/task62-source-checkpoint';
import type { ClientBase } from 'pg';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const input = read(process.argv[2]!);
const fixture = read(input.fixturePath);
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const records: Record<string, unknown>[] = [];
const write = (path: string, body: unknown) =>
  writeFileSync(path, JSON.stringify(body, null, 2), { flag: 'wx', mode: 0o600 });
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
    const tables = [];
    for (const t of (
      await db.query(
        "SELECT schemaname,tablename FROM pg_tables WHERE schemaname !~ '^pg_' AND schemaname<>'information_schema' ORDER BY 1,2",
      )
    ).rows) {
      tables.push({
        schema: t.schemaname,
        table: t.tablename,
        ...(
          await db.query(
            `SELECT count(*)::int n,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text COLLATE "C"),''),'UTF8')),'hex') sha256 FROM ${quote(t.schemaname)}.${quote(t.tablename)} t`,
          )
        ).rows[0],
      });
    }
    const sequences = [];
    for (const s of (
      await db.query(
        "SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname !~ '^pg_' ORDER BY 1,2",
      )
    ).rows)
      sequences.push({
        schema: s.schemaname,
        name: s.sequencename,
        ...(
          await db.query(
            `SELECT last_value::text,log_cnt::text,is_called FROM ${quote(s.schemaname)}.${quote(s.sequencename)}`,
          )
        ).rows[0],
      });
    await db.query('COMMIT');
    assert.equal(tables.length, 145);
    assert.equal(sequences.length, 48);
    return { tables, sequences };
  });
}
async function main() {
  mkdirSync(input.privateRoot);
  const baseUrl = new URL(fixture.migrationUrl);
  await connection(baseUrl.href, async (db) =>
    assert.deepEqual(await task62SourceFailures(db), []),
  );
  const originalWrapper = read(input.completedWrapper),
    originalJournal = read(input.completedJournal);
  assert.equal(originalWrapper.scope, 'fixture-readiness');
  assert.equal(originalWrapper.cluster, fixture.clusterId);
  assert.equal(originalWrapper.database, baseUrl.pathname.slice(1));
  assert.equal(originalJournal.wrapperSha256, boundedHash(readFileSync(input.completedWrapper)));
  // Preserve original journal and wrapper. Only the observed Docker endpoint changes;
  // cluster/database, approved payload, runner and operation identity remain exact.
  const wrapperPath = input.privateRoot + '/completed-wrapper.json',
    journalPath = input.privateRoot + '/completed-journal.json';
  write(wrapperPath, {
    ...originalWrapper,
    port: Number(baseUrl.port),
    fixtureEnvironment: fixture.environment,
  });
  write(journalPath, { ...originalJournal, wrapperSha256: boundedHash(readFileSync(wrapperPath)) });
  const args = {
    planPath: input.planPath,
    wrapperPath,
    journalPath,
    mode: 'apply' as const,
    sessionPath: input.adminSession,
    databaseUrl: baseUrl.href,
  };
  const before = await snapshot(baseUrl.href),
    retry = await runBoundedTask62(args);
  assert.equal(retry.status, 'ALREADY_APPLIED');
  assert.equal(retry.changed, false);
  assert.equal(retry.operation, originalJournal.operationId);
  assert.deepEqual(await snapshot(baseUrl.href), before);
  records.push({
    name: 'exact committed retry after verified fixture endpoint reconciliation',
    status: 'PASS',
    operation: retry.operation,
    all145TablesAnd48SequencesExact: true,
    originalWrapperSha256: boundedHash(readFileSync(input.completedWrapper)),
    originalJournalSha256: boundedHash(readFileSync(input.completedJournal)),
    reconciledWrapperSha256: boundedHash(readFileSync(wrapperPath)),
    reconciledJournalSha256: boundedHash(readFileSync(journalPath)),
  });
  const alteredPlan = input.privateRoot + '/altered-plan.json';
  writeFileSync(alteredPlan, readFileSync(input.planPath, 'utf8') + ' ', { flag: 'wx' });
  await assert.rejects(runBoundedTask62({ ...args, planPath: alteredPlan }), /strictly equal/u);
  const alteredJournal = input.privateRoot + '/altered-journal.json';
  write(alteredJournal, {
    ...read(journalPath),
    operationId: '62620075-1111-5111-8111-111111111111',
  });
  await assert.rejects(
    runBoundedTask62({ ...args, journalPath: alteredJournal }),
    /false|true|assert/iu,
  );
  const alteredWrapper = input.privateRoot + '/altered-wrapper.json';
  write(alteredWrapper, { ...read(wrapperPath), runnerSha256: '0'.repeat(64) });
  await assert.rejects(
    runBoundedTask62({ ...args, wrapperPath: alteredWrapper }),
    /Reviewed runner bytes/u,
  );
  assert.deepEqual(await snapshot(baseUrl.href), before);
  records.push({
    name: 'altered plan, operation journal and runner binding refuse',
    status: 'PASS',
    all145TablesAnd48SequencesExact: true,
  });
  const name = 'litigation_task62_bounded_lost_ack1',
    lostUrl = new URL(baseUrl);
  lostUrl.pathname = '/' + name;
  await connection(baseUrl.href, async (db) => {
    assert.equal(
      (await db.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1', [name])).rows[0]
        .n,
      0,
    );
    const disk = statfsSync(process.platform === 'win32' ? 'C:/' : process.cwd());
    assert.ok(disk.bavail * disk.bsize > 18 * 1024 ** 3, 'Preserve shared Docker storage headroom');
    assert.match(input.templateDatabase, /^litigation_task62_bounded_[a-z0-9_]+$/u);
    await db.query(`CREATE DATABASE "${name}" TEMPLATE "${input.templateDatabase}"`);
    await db.query(`REVOKE TEMPORARY ON DATABASE "${name}" FROM PUBLIC`);
  });
  const lostWrapper = input.privateRoot + '/lost-wrapper.json',
    lostJournal = input.privateRoot + '/lost-journal.json';
  write(lostWrapper, { ...read(wrapperPath), database: name });
  prepareBoundedJournal(input.planPath, lostWrapper, lostJournal);
  const lostArgs = {
    ...args,
    wrapperPath: lostWrapper,
    journalPath: lostJournal,
    databaseUrl: lostUrl.href,
  };
  await assert.rejects(
    (async () => {
      const applied = await runBoundedTask62(lostArgs);
      assert.equal(applied.status, 'APPLIED');
      throw new Error('TASK-OWNED SIMULATED LOST COMMIT ACKNOWLEDGEMENT');
    })(),
    /SIMULATED LOST COMMIT ACKNOWLEDGEMENT/u,
  );
  // Observe the durable outcome before any retry. No output receipt from the
  // successful client call is available to this recovery path.
  const durable = await connection(lostUrl.href, async (db) => {
    assert.deepEqual(await task62SourceFailures(db), []);
    return (
      await db.query(
        'SELECT operation_id,count(*)::int receipts FROM _migration.task62_source_receipt GROUP BY operation_id',
      )
    ).rows;
  });
  assert.deepEqual(durable, [{ operation_id: read(lostJournal).operationId, receipts: 31 }]);
  const committed = await snapshot(lostUrl.href),
    recovered = await runBoundedTask62(lostArgs);
  assert.equal(recovered.status, 'ALREADY_APPLIED');
  assert.equal(recovered.changed, false);
  assert.deepEqual(await snapshot(lostUrl.href), committed);
  records.push({
    name: 'commit acknowledgement loss, observed durable outcome, exact no-write recovery',
    status: 'PASS',
    operation: recovered.operation,
    receipts: 31,
    all145TablesAnd48SequencesExact: true,
    simulation:
      'Client-side acknowledgement discarded after actual commit on separate fresh full-data fixture; no successful operation replayed as a new write.',
  });
  write(input.output, { status: 'PASS', cases: records });
  console.log('PASS committed retry, three altered inputs, and lost-acknowledgement recovery');
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Retry test failed');
  process.exitCode = 1;
});
