import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDatabaseClient } from '../src/lib/db';
import {
  readOpenDecisions,
  openDecisionCountQuery,
  openDecisionRowsQuery,
} from '../src/lib/open-decisions-query';
import {
  readHearings,
  parseHearingFilters,
  hearingListHref,
  hearingDetailHref,
  hearingReturnHref,
  HearingFilterError,
} from '../src/lib/hearing-query';
import { readTodayHearings } from '../src/lib/today-hearings-query';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { AuthorizationError } from '../src/lib/auth/authorization-core';

/** Explicit isolated descriptor is mandatory; this entry never creates or targets an owner fixture. */
async function main() {
  const output = process.env['TASK51_OUTPUT'];
  assert.ok(output);
  const privateRoot = process.env['TASK51_PRIVATE'];
  assert.ok(privateRoot);
  const f = JSON.parse(readFileSync(`${privateRoot}/fixture.json`, 'utf8'));
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(f.migrationUrl), f.environment),
    { databaseUrl: f.migrationUrl },
  );
  const runtime = createDatabaseClient(f.runtimeUrl);
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(work, {
      databaseUrl: f.migrationUrl,
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
  try {
    const baseline = await inspect(
      async (db) =>
        (
          await db.query(
            `SELECT h.id,h.next_hearing_date::text next,h.hearing_date::text date,h.report,h.is_archived archived,m.status,m.is_archived parent_archived,m.client_id FROM hearings h LEFT JOIN matters m ON m.id=h.matter_id ORDER BY h.next_hearing_date,h.id`,
          )
        ).rows,
    );
    const sessions = await lifecycleSessions(runtime);
    assert.equal(sessions.length, 4);
    const dates = ['0001-01-01', '2020-01-01', '2026-09-22', '9999-01-01'];
    const results = [];
    for (const date of dates) {
      // Independent oracle reads individual stored attributes, no production predicate reuse.
      const expected = baseline
        .filter(
          (h) =>
            h.next !== null &&
            h.next < date &&
            h.report === true &&
            h.status === 'سارية' &&
            h.archived === false,
        )
        .map((h) => h.id);
      const clock = () => new Date(`${date}T12:00:00Z`);
      for (const session of sessions) {
        const view = await readOpenDecisions(session, runtime, clock);
        assert.equal(view.date, date);
        assert.equal(view.total, expected.length);
        assert.deepEqual(
          view.rows.map((h) => h.id),
          expected.slice(0, 25),
        );
      }
      const all = [];
      for (let page = 1; ; page++) {
        const listing = await readHearings(
          sessions[0]!,
          { openBefore: date, page: String(page) },
          runtime,
        );
        assert.equal(listing.total, expected.length);
        all.push(...listing.rows.map((h) => h.id));
        if (page === listing.pages) break;
      }
      assert.deepEqual(all, expected);
      results.push({ date, total: expected.length, preview: expected.slice(0, 25), allIds: all });
    }
    const filters = parseHearingFilters({ openBefore: '2026-09-22', page: '2' });
    assert.equal(hearingReturnHref(hearingListHref(filters)), hearingListHref(filters));
    assert.ok(hearingDetailHref(1, filters).includes('openBefore=2026-09-22'));
    for (const bad of [
      { openBefore: '2026-02-29' },
      { openBefore: ['2026-01-01', '2026-01-02'] },
      { openBefore: '2026-01-01', archive: 'all' },
      { openBefore: "2026-01-01' OR true" },
    ])
      assert.throws(() => parseHearingFilters(bad), HearingFilterError);
    for (const denied of [
      null,
      { ...sessions[0]!, expires: '2000-01-01T00:00:00Z' },
      { ...sessions[0]!, user: { ...sessions[0]!.user, sessionVersion: -1 } },
      { ...sessions[0]!, user: { ...sessions[0]!.user, personId: -1 } },
      { ...sessions[0]!, user: { ...sessions[0]!.user, mustChangePassword: true } },
    ])
      await assert.rejects(readOpenDecisions(denied, runtime), AuthorizationError);
    const today = await readTodayHearings(
      sessions[0]!,
      runtime,
      () => new Date('2026-09-22T12:00:00Z'),
    );
    const todayIds = baseline
      .filter((h) => h.next === '2026-09-22' && !h.archived)
      .sort((a, b) =>
        a.date === b.date
          ? b.id - a.id
          : a.date === null
            ? 1
            : b.date === null
              ? -1
              : b.date.localeCompare(a.date),
      )
      .map((h) => h.id);
    assert.equal(today.total, todayIds.length);
    assert.deepEqual(
      today.rows.map((h) => h.id),
      todayIds.slice(0, 25),
    );
    const plans = await inspect(async (db) =>
      Promise.all(
        [openDecisionCountQuery('2026-09-22'), openDecisionRowsQuery('2026-09-22')].map(
          async (q) => ({
            sql: q.text,
            values: q.values,
            plan: (await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + q.text, q.values))
              .rows[0]['QUERY PLAN'],
          }),
        ),
      ),
    );
    writeFileSync(
      `${output}/open-results.json`,
      JSON.stringify(
        {
          status: 'PASS',
          cluster: f.clusterId,
          roles: sessions.map((s) => s.user.role),
          baselineHearings: baseline.length,
          results,
          plans,
          todayRegression: true,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS open-decision independent full-volume oracle, all roles, exact list population, parsing/navigation and Today query regression',
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Dashboard test failed');
  process.exitCode = 1;
});
