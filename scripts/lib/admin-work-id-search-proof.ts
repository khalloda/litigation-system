import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClientBase } from 'pg';
import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  readAdminWorks,
  readAdminWork,
  parseAdminFilters,
  AdminFilterError,
} from '../../src/lib/admin-work-query';
import { AuthorizationError } from '../../src/lib/auth/authorization-core';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { staffReadOnlyState } from './staff-read-only-state';

type Row = {
  id: number;
  legacy_id: number | null;
  matter_id: number | null;
  client_id: number | null;
  assigned_to_person_id: number | null;
  status: string | null;
  text: (string | null)[];
};
export type IdCase = {
  branch: 'id' | 'legacy_id';
  id: number;
  western: string;
  arabic: string;
  expectedIds: number[];
  filters: Record<string, string>;
};

export async function proveAdminIdSearch(
  runtime: PrismaClient,
  inspect: <T>(work: (db: ClientBase) => Promise<T>) => Promise<T>,
  output: string,
  expectRed: boolean,
) {
  // This independent baseline does not import the production query builders.
  const rows = await inspect(
    async (db) =>
      (
        await db.query<Row>(`SELECT a.id,a.legacy_id,a.matter_id,m.client_id,a.assigned_to_person_id,a.status,
    ARRAY[ar_normalise(a.required_work),ar_normalise(a.result),ar_normalise(a.last_followup),ar_normalise(a.legacy_assignee_raw),ar_normalise(p.name_ar),m.case_number_ar_normalised,m.subject_normalised,c.name_ar_normalised,c.full_name_normalised,ar_normalise(c.name_en)] ||
    ARRAY(SELECT ar_normalise(n.alias_ar) FROM person_name_alias n WHERE n.person_id=a.assigned_to_person_id AND NOT n.is_retired) AS text
    FROM admin_tasks a LEFT JOIN matters m ON m.id=a.matter_id LEFT JOIN clients c ON c.id=m.client_id LEFT JOIN people p ON p.id=a.assigned_to_person_id
    ORDER BY a.task_created_date DESC NULLS LAST,a.id DESC`)
      ).rows,
  );
  assert.equal(rows.length, 3694);
  const normalize = (q: string) =>
    inspect(
      async (db) =>
        (await db.query<{ n: string }>('SELECT public.ar_normalise($1) n', [q])).rows[0]!.n,
    );
  assert.equal(await normalize('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(await normalize('JTI'), 'jti');
  assert.notEqual(await normalize('140J'), await normalize('140ق'));
  const textMatches = (r: Row, n: string) => r.text.some((v) => v?.includes(n));
  const expected = (n: string) =>
    rows.filter(
      (r) =>
        textMatches(r, n) ||
        String(r.id) === n ||
        (r.legacy_id !== null && String(r.legacy_id) === n),
    );
  const cases: IdCase[] = [];
  for (const branch of ['id', 'legacy_id'] as const) {
    const covered = new Set<string>();
    for (const row of rows) {
      const value = row[branch];
      if (value === null) continue;
      const western = String(value),
        other = branch === 'id' ? row.legacy_id : row.id;
      if (
        textMatches(row, western) ||
        String(other) === western ||
        [...western].every((d) => covered.has(d))
      )
        continue;
      const negatives = [western + 'x', '0' + western, western.slice(0, -1)];
      if (
        negatives.some(
          (n) =>
            !n ||
            textMatches(row, n) ||
            String(row.id) === n ||
            (row.legacy_id !== null && String(row.legacy_id) === n),
        )
      )
        continue;
      const arabic = western.replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + Number(d)));
      assert.equal(await normalize(arabic), western);
      cases.push({
        branch,
        id: row.id,
        western,
        arabic,
        expectedIds: expected(western).map((r) => r.id),
        filters: { matter: row.matter_id === null ? 'missing' : String(row.matter_id) },
      });
      for (const digit of western) covered.add(digit);
      if (covered.size === 10) break;
    }
    assert.equal(
      covered.size,
      10,
      'Existing branch-exclusive candidates cover every digit including zero: ' + branch,
    );
  }
  writeFileSync(
    join(output, 'id-candidates.json'),
    JSON.stringify(
      {
        sourceRows: rows.length,
        selection:
          'Existing IDs; selected row has zero incidental text/alias matches and no equal opposite ID. No source row modified.',
        allDigitsPerBranch: true,
        cases,
      },
      null,
      2,
    ),
  );
  const before = await inspect(staffReadOnlyState),
    sessions = await lifecycleSessions(runtime);
  const collect = async (session: (typeof sessions)[number], params: Record<string, string>) => {
    const first = await readAdminWorks(session, params, runtime),
      all = [...first.rows];
    for (let page = 2; page <= first.pages; page++) {
      const next = await readAdminWorks(session, { ...params, page: String(page) }, runtime);
      assert.equal(next.total, first.total);
      all.push(...next.rows);
    }
    const ids = all.map((r) => r.id);
    assert.equal(ids.length, first.total);
    assert.equal(new Set(ids).size, ids.length);
    return ids;
  };
  const failures: unknown[] = [];
  for (const session of sessions)
    for (const c of cases)
      for (const q of [c.western, c.arabic]) {
        const actual = await collect(session, { q });
        try {
          assert.deepEqual(actual, c.expectedIds);
        } catch (error) {
          if (!expectRed) throw error;
          failures.push({
            role: session.user.role,
            branch: c.branch,
            q,
            selectedId: c.id,
            selectedIdMissing: !actual.includes(c.id),
            expectedIds: c.expectedIds,
            actualIds: actual,
          });
        }
        if (!expectRed) {
          const n = await normalize(q),
            expectedFiltered = expected(n)
              .filter((r) =>
                c.filters.matter === 'missing'
                  ? r.matter_id === null
                  : String(r.matter_id) === c.filters.matter,
              )
              .map((r) => r.id);
          assert.deepEqual(await collect(session, { q, ...c.filters }), expectedFiltered);
        }
      }
  if (expectRed) {
    for (const branch of ['id', 'legacy_id'])
      assert.ok(failures.some((f) => (f as { branch: string }).branch === branch));
    assert.ok(failures.every((f) => (f as { selectedIdMissing: boolean }).selectedIdMissing));
    writeFileSync(
      join(output, 'red-results.json'),
      JSON.stringify({ expectedRegressionFailures: failures, productionUnchanged: true }, null, 2),
    );
  } else {
    const viewer = sessions[0]!;
    for (const q of [
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
      '__NO_TASK__',
      'null',
      ...cases.flatMap((c) => [c.western + 'x', '0' + c.western, c.western.slice(0, -1)]),
    ]) {
      const n = await normalize(q);
      assert.deepEqual(
        await collect(viewer, { q }),
        expected(n).map((r) => r.id),
      );
      for (const c of cases)
        if ([c.western + 'x', '0' + c.western, c.western.slice(0, -1)].includes(q)) {
          const selected = rows.find((r) => r.id === c.id)!;
          assert.ok(
            !textMatches(selected, n),
            'Negative selected ID must not be concealed by text',
          );
          assert.ok(
            !expected(n).some((r) => r.id === c.id),
            'No partial/suffixed/numerically coerced selected ID',
          );
        }
    }
    assert.deepEqual(
      await collect(viewer, {}),
      rows.map((r) => r.id),
    );
    for (const q of ['\u0000', 'x'.repeat(161)])
      assert.throws(() => parseAdminFilters({ q }), AdminFilterError);
    for (const session of [
      null,
      { ...viewer, expires: new Date(0).toISOString() },
      { ...viewer, user: { ...viewer.user, sessionVersion: viewer.user.sessionVersion + 100 } },
      { ...viewer, user: { ...viewer.user, mustChangePassword: true } },
    ]) {
      await assert.rejects(readAdminWorks(session, {}, runtime), AuthorizationError);
      await assert.rejects(readAdminWork(session, '1', '1', runtime), AuthorizationError);
    }
    writeFileSync(
      join(output, 'green-results.json'),
      JSON.stringify(
        {
          fourRoles: true,
          candidates: cases.length,
          allDigitsPerBranch: true,
          independentFullResultIdsAndCounts: true,
          allPagesAndFilters: true,
          exactNegativeCases: true,
          existingSearchControls: true,
          directRefusals: true,
        },
        null,
        2,
      ),
    );
  }
  assert.deepEqual(await inspect(staffReadOnlyState), before);
  console.log(
    expectRed
      ? 'PASS regression detects both reviewed raw-ID defects (expected red)'
      : 'PASS normalized ID regression, four roles, independent counts/IDs, controls and no read effects',
  );
  return cases;
}
