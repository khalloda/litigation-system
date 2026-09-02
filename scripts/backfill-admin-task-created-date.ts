import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client, type ClientBase } from 'pg';
import { assertApprovedMigrationPrincipalSession } from './lib/migration-principal';
import {
  ADMIN_TASK_CREATION_DATE_BASELINE,
  type AdminTaskCreationDateBaseline,
  reconcileAdminWorks,
} from './lib/admin-reconciliation';
import { adminWorkStructureFailures } from './lib/admin-structure';
import { buildAdminTransformPlan, type AdminTaskTargetPlan } from './lib/admin-transform-plan';
import { task29ProtectedState } from './lib/task29-protected-state';
import { adminWorkResultDigest } from './transform-admin-works';

const ADMIN_WORK_EXISTING_RESULT_DIGEST =
  'ab0cc3727705a6df865d88d7fb9b3c65c21c9cc1b13e708cf12edcf4212132c1';

type RunOptions = {
  databaseUrl?: string;
  apply?: boolean;
  expectedBaseline?: AdminTaskCreationDateBaseline;
  fixtureOnly?: boolean;
  forceFailure?: boolean;
};

type DateSummary = AdminTaskCreationDateBaseline & { digest: string };

function assertProjectDatabaseUrl(connectionString: string): void {
  const url = new URL(connectionString);
  assert.ok(
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1',
    `administrative date backfill refuses non-local host ${url.hostname}`,
  );
  assert.equal(url.port, '5433', 'administrative date backfill requires PostgreSQL port 5433');
  assert.equal(
    decodeURIComponent(url.pathname),
    '/litigation',
    'administrative date backfill requires the litigation database',
  );
}

function dateSummary(rows: readonly AdminTaskTargetPlan[]): DateSummary {
  const ordered = [...rows].sort((left, right) =>
    left.srcRecordKey.localeCompare(right.srcRecordKey, 'en'),
  );
  const dates = ordered
    .map((row) => row.taskCreatedDate)
    .filter((value): value is string => value !== null)
    .sort((left, right) => left.localeCompare(right, 'en'));
  return {
    transformedTasks: ordered.length,
    populatedDates: dates.length,
    nullDates: ordered.length - dates.length,
    minimumDate: dates[0] ?? '',
    maximumDate: dates.at(-1) ?? '',
    digest: createHash('sha256')
      .update(
        ordered
          .map((row) => `${row.srcRecordKey}\u0000${row.taskCreatedDate ?? '\u2400'}`)
          .join('\n'),
        'utf8',
      )
      .digest('hex'),
  };
}

function assertBaseline(actual: DateSummary, expected: AdminTaskCreationDateBaseline): void {
  for (const key of [
    'transformedTasks',
    'populatedDates',
    'nullDates',
    'minimumDate',
    'maximumDate',
  ] as const)
    assert.equal(actual[key], expected[key], `administrative creation-date baseline ${key}`);
}

async function adminStateIgnoringTaskCreatedDate(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(payload,E'\\n' ORDER BY kind,identity),''),'UTF8')),'hex') digest
      FROM (
        SELECT 'T' kind,id::text identity,
               CASE WHEN legacy_source_record_key IS NOT NULL
                    THEN (to_jsonb(t)-ARRAY['task_created_date','updated_at','updated_by'])::text
                    ELSE to_jsonb(t)::text END payload
          FROM admin_tasks t
        UNION ALL SELECT 'A',id::text,to_jsonb(a)::text FROM task_actions a
        UNION ALL SELECT 'QT',src_record_key,to_jsonb(q)::text FROM quarantine.admin_task_transform q
        UNION ALL SELECT 'QA',src_record_key,to_jsonb(q)::text FROM quarantine.task_action_transform q
      ) protected`);
  return result.rows[0]?.digest ?? '';
}

async function assertStructure(db: ClientBase): Promise<void> {
  const failures = await adminWorkStructureFailures(db);
  assert.deepEqual(
    failures,
    [],
    `administrative task safeguards differ from reviewed definitions:\n${failures.join('\n')}`,
  );
}

export async function runAdminTaskCreatedDateBackfill(options: RunOptions = {}): Promise<{
  summary: DateSummary;
  changedRows: number | null;
}> {
  const connectionString = options.databaseUrl ?? process.env['MIGRATION_DATABASE_URL'];
  assert.ok(connectionString, 'MIGRATION_DATABASE_URL is required');
  if (options.fixtureOnly !== true) assertProjectDatabaseUrl(connectionString);
  const expected = options.expectedBaseline ?? ADMIN_TASK_CREATION_DATE_BASELINE;
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await assertApprovedMigrationPrincipalSession(db);
    await assertStructure(db);
    const preview = await buildAdminTransformPlan(db);
    const previewSummary = dateSummary(preview.tasks);
    assertBaseline(previewSummary, expected);
    if (options.fixtureOnly !== true) {
      assert.equal(preview.taskSourceCount, 4_238, 'administrative source task baseline');
      assert.equal(preview.taskQuarantine.length, 544, 'administrative task quarantine baseline');
    }
    if (options.apply !== true) return { summary: previewSummary, changedRows: null };

    const priorBefore = await task29ProtectedState(db);
    const adminBefore = await adminStateIgnoringTaskCreatedDate(db);
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await db.query(`
        LOCK TABLE staging."admin work table",public.matters,
                   quarantine.matter_transform,public.lookup_court,
                   public.lookup_matter_destination,public.migration_crosswalk,
                   public.person_name_alias,quarantine.review_value IN SHARE MODE;
        LOCK TABLE public.admin_tasks IN SHARE ROW EXCLUSIVE MODE`);
      await assertStructure(db);
      const plan = await buildAdminTransformPlan(db);
      const summary = dateSummary(plan.tasks);
      assertBaseline(summary, expected);
      assert.equal(
        summary.digest,
        previewSummary.digest,
        'creation-date plan changed before write',
      );

      const mapping = await db.query<{
        planned: string;
        matched: string;
        distinct_targets: string;
        native_targets: string;
      }>(
        `WITH planned AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb)
             AS x("srcRecordKey" text,"taskCreatedDate" text)
         )
         SELECT count(*)::text planned,count(t.id)::text matched,
                count(DISTINCT t.id)::text distinct_targets,
                count(*) FILTER (WHERE t.legacy_source_record_key IS NULL)::text native_targets
           FROM planned p LEFT JOIN admin_tasks t
             ON t.legacy_source_record_key=p."srcRecordKey"`,
        [
          JSON.stringify(
            plan.tasks.map((row) => ({
              srcRecordKey: row.srcRecordKey,
              taskCreatedDate: row.taskCreatedDate,
            })),
          ),
        ],
      );
      assert.equal(mapping.rows[0]?.planned, String(expected.transformedTasks));
      assert.equal(mapping.rows[0]?.matched, String(expected.transformedTasks));
      assert.equal(mapping.rows[0]?.distinct_targets, String(expected.transformedTasks));
      assert.equal(mapping.rows[0]?.native_targets, '0');

      const update = await db.query<{ changed: string }>(
        `WITH planned AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb)
             AS x("srcRecordKey" text,"taskCreatedDate" text)
         ),changed AS (
           UPDATE admin_tasks t
              SET task_created_date=p."taskCreatedDate"::date
             FROM planned p
            WHERE t.legacy_source_record_key=p."srcRecordKey"
              AND t.legacy_source_record_key IS NOT NULL
              AND t.task_created_date IS DISTINCT FROM p."taskCreatedDate"::date
           RETURNING t.id
         ) SELECT count(*)::text changed FROM changed`,
        [
          JSON.stringify(
            plan.tasks.map((row) => ({
              srcRecordKey: row.srcRecordKey,
              taskCreatedDate: row.taskCreatedDate,
            })),
          ),
        ],
      );
      if (options.forceFailure === true)
        throw new Error('forced late administrative creation-date backfill failure');

      const reconciliation = await reconcileAdminWorks(db, { creationDateBaseline: expected });
      assert.deepEqual(
        reconciliation.defects,
        [],
        `administrative creation-date reconciliation failed:\n${reconciliation.defects.join('\n')}`,
      );
      assert.equal(await task29ProtectedState(db), priorBefore, 'prior migration state changed');
      assert.equal(
        await adminStateIgnoringTaskCreatedDate(db),
        adminBefore,
        'an administrative value other than task_created_date changed',
      );
      if (options.fixtureOnly !== true)
        assert.equal(
          await adminWorkResultDigest(db),
          ADMIN_WORK_EXISTING_RESULT_DIGEST,
          'existing Task 2.9A result digest changed',
        );
      await assertStructure(db);
      await db.query('COMMIT');
      return { summary, changedRows: Number(update.rows[0]?.changed ?? '0') };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } finally {
    await db.end();
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const result = await runAdminTaskCreatedDateBackfill({ apply });
  console.log(
    apply
      ? 'ADMINISTRATIVE TASK CREATION DATES APPLIED'
      : 'ADMINISTRATIVE TASK CREATION DATE DRY RUN — no database writes',
  );
  console.log(
    `${result.summary.transformedTasks} migrated tasks: ${result.summary.populatedDates} dated + ` +
      `${result.summary.nullDates} null; ${result.summary.minimumDate} to ${result.summary.maximumDate}`,
  );
  console.log(`Plan digest: ${result.summary.digest}`);
  if (result.changedRows !== null) console.log(`Rows changed: ${result.changedRows}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
