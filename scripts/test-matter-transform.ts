import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { setMaintenanceAuditContext } from './lib/audit-maintenance-context';
import {
  asBigInt,
  MATTER_RECONCILIATION_SQL,
  MATTER_STRUCTURE_SQL,
  matterReconciliationFailures,
  matterStructureFailures,
  type MatterReconciliationRow,
  type MatterStructureRow,
} from './lib/matter-reconciliation';
import { compare, type Baseline, type CrosswalkLink } from './lib/reviewed-links';
import { runMatterTransform } from './transform-matters';

const FINGERPRINT = 'A'.repeat(64);

type FixtureMatter = {
  matterID: string;
  clientID?: string | null;
  matterCategory?: string | null;
  matterDegree?: string | null;
  matterImportance?: string | null;
  clientBranch?: string | null;
  matterCourt?: string | null;
  matterCircut?: string | null;
  matterStartDate?: string | null;
  matterNotes1?: string | null;
  matterNotes2?: string | null;
};

function quoteIdentifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/);
  return `"${value}"`;
}

function quoteColumn(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function migrateFixture(databaseUrl: string) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `fixture migrations failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  );
}

async function oneText(db: Client, sql: string): Promise<string> {
  const result = await db.query<{ value: string }>(sql);
  assert.equal(result.rowCount, 1, `expected one reviewed fixture value for: ${sql}`);
  return result.rows[0]!.value;
}

async function insertMatter(db: Client, row: FixtureMatter, sequence: number) {
  const placeholder = `${sequence.toString(16).padStart(64, '0')}:000001`;
  await db.query(
    `INSERT INTO staging."الدعاوى" (
       src_file, src_row_num, src_record_key, src_extraction_sha256,
       "clientID", "matterID", "matterAR", "matterSubject",
       "matterCategory", "matterDegree", "matterImportance", "clientBranch",
       "matterCourt", "matterCircut", "matterStartDate", "matterSelect",
       "matterNotes1", "matterNotes2"
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, 'صف اختبار واضح', $8, $9, $10, $11,
       $12, $13, $14, 'false', $15, $16
     )`,
    [
      'fixture/matters.csv',
      sequence,
      placeholder,
      FINGERPRINT,
      row.clientID === undefined ? '1' : row.clientID,
      row.matterID,
      `اختبار-${row.matterID}`,
      row.matterCategory === undefined ? 'عمال' : row.matterCategory,
      row.matterDegree === undefined ? 'ابتدائي' : row.matterDegree,
      row.matterImportance === undefined ? 'عادية' : row.matterImportance,
      row.clientBranch ?? null,
      row.matterCourt ?? null,
      row.matterCircut ?? null,
      row.matterStartDate ?? null,
      row.matterNotes1 ?? null,
      row.matterNotes2 ?? null,
    ],
  );
}

async function assignDurableKeys(db: Client) {
  const columns = await db.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'staging' AND table_name = 'الدعاوى'
       AND column_name NOT IN ('src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256')
     ORDER BY ordinal_position`);
  assert.equal(columns.rows.length, 38, 'fixture must hash all 38 source matter columns');
  const expressions = columns.rows.map((row) => `s.${quoteColumn(row.column_name)}`).join(', ');
  await db.query(`
    WITH identified AS (
      SELECT src_file, src_row_num,
             _migration.source_record_hash('الدعاوى', ARRAY[${expressions}]::text[]) AS content_hash
        FROM staging."الدعاوى" s
    ), ranked AS (
      SELECT src_file, src_row_num, content_hash,
             row_number() OVER (PARTITION BY content_hash ORDER BY src_file, src_row_num) AS occurrence
        FROM identified
    )
    UPDATE staging."الدعاوى" s
       SET src_record_key = ranked.content_hash || ':' || lpad(ranked.occurrence::text, 6, '0')
      FROM ranked
     WHERE ranked.src_file = s.src_file AND ranked.src_row_num = s.src_row_num`);
}

async function resultDigest(db: Client): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(payload, E'\n' ORDER BY kind, source_key), ''), 'UTF8')), 'hex') AS digest
      FROM (
        SELECT 'M' kind, legacy_source_record_key source_key, to_jsonb(m)::text payload FROM matters m
        UNION ALL
        SELECT 'Q', src_record_key, to_jsonb(q)::text FROM quarantine.matter_transform q
      ) result`);
  return result.rows[0]!.digest;
}

async function reconciliation(db: Client): Promise<MatterReconciliationRow> {
  const result = await db.query<MatterReconciliationRow>(MATTER_RECONCILIATION_SQL);
  assert.equal(result.rowCount, 1, 'matter reconciliation must return exactly one result row');
  return result.rows[0]!;
}

async function assertReconciliationClean(db: Client) {
  assert.deepEqual(
    matterReconciliationFailures(await reconciliation(db)),
    [],
    'fixture must return to a fully reconciled state after a negative proof',
  );
}

async function proveReconciliationFailure(
  db: Client,
  message: string,
  mutate: () => Promise<unknown>,
  expectedFields: string[],
) {
  await db.query('BEGIN');
  try {
    await setMaintenanceAuditContext(db, 'test-matter-reconciliation-negative');
    await mutate();
    const changed = await reconciliation(db);
    for (const field of expectedFields) {
      assert.ok(asBigInt(changed[field]!) > 0n, `${message}: ${field} did not fail`);
    }
  } finally {
    await db.query('ROLLBACK');
  }
  await assertReconciliationClean(db);
  console.log(`  ok    ${message}`);
}

async function runFixture() {
  const protectedRule: CrosswalkLink = {
    sourceField: 'court',
    sourceValue: 'fixture split',
    targetField: 'SPLIT',
    targetValue: 'fixture court',
    reviewerNote: "Split: court='fixture court', circuit='1'",
  };
  const baseline: Baseline = {
    generatedAt: '2026-08-24',
    counts: { aliases: 0, crosswalk: 1 },
    digest: 'fixture',
    aliases: [],
    crosswalk: [protectedRule],
  };
  const noteDrift = compare(baseline, {
    aliases: [],
    crosswalk: [{ ...protectedRule, reviewerNote: "Split: court='fixture court', circuit='2'" }],
  });
  assert.equal(noteDrift.length, 1);
  assert.match(noteDrift[0]!.actual, /reviewer note is now/);
  console.log('  ok    changing an operational split note fails the reviewed-link baseline');

  const projectUrlText = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(projectUrlText, 'MIGRATION_DATABASE_URL is required for the isolated matter fixture');
  const databaseName = `matter_transform_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrlText);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrlText);
  fixtureUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;

  await admin.connect();
  try {
    const existing = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM pg_database WHERE datname = $1',
      [databaseName],
    );
    assert.equal(existing.rows[0]?.count, '0', 'fixture database name already exists');
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    created = true;
    migrateFixture(fixtureUrl.toString());

    const db = new Client({ connectionString: fixtureUrl.toString() });
    await db.connect();
    try {
      const structure = await db.query<MatterStructureRow>(MATTER_STRUCTURE_SQL);
      assert.equal(structure.rowCount, 1);
      assert.deepEqual(matterStructureFailures(structure.rows[0]!), []);
      console.log(
        '  ok    catalog verification accepts the exact constraint, index, foreign key and triggers',
      );

      await db.query('BEGIN');
      try {
        await setMaintenanceAuditContext(db, 'test-matter-client-fixture');
        await db.query(
          `INSERT INTO clients (legacy_id, name_ar, updated_at)
           VALUES (1, 'عميل اختبار تقني — ليس بيانات حقيقية', CURRENT_TIMESTAMP)`,
        );
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

      const separateClients = await db.query<{ source_value: string }>(`
        SELECT source_value FROM migration_crosswalk
         WHERE source_field = 'client_branch' AND target_field = 'separate_client'
         ORDER BY source_value`);
      assert.equal(separateClients.rows.length, 3);

      const branchReview = await oneText(
        db,
        `SELECT source_value AS value FROM migration_crosswalk
          WHERE source_field = 'client_branch' AND target_field = 'quarantine' LIMIT 1`,
      );
      const branchCategory = await oneText(
        db,
        `SELECT source_value AS value FROM migration_crosswalk
          WHERE source_field = 'client_branch' AND target_field = 'matter_category'
            AND target_value <> 'مدني' LIMIT 1`,
      );
      const branchType = await db.query<{ source_value: string; target_value: string }>(`
        SELECT source_value, target_value FROM migration_crosswalk
         WHERE source_field = 'client_branch' AND target_field = 'matter_type'
         ORDER BY source_value LIMIT 1`);
      assert.equal(branchType.rowCount, 1);
      const categoryType = await oneText(
        db,
        `SELECT source_value AS value FROM migration_crosswalk
          WHERE source_field = 'matterCategory' AND target_field = 'matter_type'
            AND target_value <> '${branchType.rows[0]!.target_value.replaceAll("'", "''")}' LIMIT 1`,
      );
      const hearingNoteCourt = await oneText(
        db,
        `SELECT source_value AS value FROM migration_crosswalk
          WHERE source_field = 'court' AND target_field = 'SPLIT'
            AND reviewer_note LIKE '%hearing_note=%' LIMIT 1`,
      );
      const circuitCourt = await oneText(
        db,
        `SELECT source_value AS value FROM migration_crosswalk
          WHERE source_field = 'court' AND target_field = 'SPLIT'
            AND reviewer_note LIKE '%circuit=%' LIMIT 1`,
      );
      const splitCategory = await oneText(
        db,
        `SELECT source_value AS value FROM migration_crosswalk
          WHERE source_field = 'matterCategory' AND target_field = 'SPLIT'`,
      );

      const rows: FixtureMatter[] = [
        { matterID: '1001', matterCategory: ' عمال', matterNotes1: '', matterNotes2: null },
        { matterID: '1002', matterCourt: 'القضاء الإداري' },
        { matterID: '1003', matterCourt: 'القضاء الإداري بالعباسية' },
        { matterID: '1004', matterCourt: '/' },
        { matterID: '1005', matterCategory: splitCategory },
        { matterID: '1006', matterCourt: circuitCourt },
        ...separateClients.rows.map((row, index) => ({
          matterID: String(1101 + index),
          clientBranch: row.source_value,
        })),
        { matterID: '1201', clientBranch: branchReview },
        { matterID: '1202', matterCategory: 'مدني', clientBranch: branchCategory },
        {
          matterID: '1203',
          matterCategory: categoryType,
          clientBranch: branchType.rows[0]!.source_value,
        },
        { matterID: '1204', matterImportance: 'سارية' },
        { matterID: '1205', clientID: null },
        { matterID: '1206', matterCourt: hearingNoteCourt },
        { matterID: '1207', matterCourt: '26' },
        { matterID: '1208', matterStartDate: '2026-99-99 00:00:00' },
      ];
      for (const [index, row] of rows.entries()) await insertMatter(db, row, index + 1);
      await assignDurableKeys(db);

      const sourceCount = await db.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM staging."الدعاوى"',
      );
      assert.equal(sourceCount.rows[0]!.count, '17');

      const forced = runMatterTransform({
        database: databaseName,
        forceFailure: true,
      });
      assert.notEqual(forced.status, 0, 'late fixture failure must make psql fail');
      assert.match(forced.output, /fixture forced late matter-transform failure/);
      assert.equal(forced.proved, 12, 'the forced failure must happen after all assertions');
      const afterFailure = await db.query<{ matters: string; quarantine: string }>(`
        SELECT (SELECT count(*)::text FROM matters) matters,
               (SELECT count(*)::text FROM quarantine.matter_transform) quarantine`);
      assert.deepEqual(afterFailure.rows[0], { matters: '0', quarantine: '0' });
      console.log('  ok    a late failure rolls back every transformed and quarantined row');

      const first = runMatterTransform({ database: databaseName });
      assert.equal(first.status, 0, first.output);
      assert.equal(first.proved, 12);

      const counts = await db.query<{ matters: string; quarantine: string }>(`
        SELECT (SELECT count(*)::text FROM matters) matters,
               (SELECT count(*)::text FROM quarantine.matter_transform) quarantine`);
      assert.deepEqual(counts.rows[0], { matters: '6', quarantine: '11' });
      console.log('  ok    17 source rows reconcile to 6 transformed + 11 quarantined');

      const reasons = await db.query<{ reason: string; count: string }>(`
        SELECT reason, count(*)::text AS count
          FROM quarantine.matter_transform q, unnest(q.reason_codes) reason
         GROUP BY reason ORDER BY reason`);
      assert.deepEqual(reasons.rows, [
        { reason: 'branch_requires_review', count: '1' },
        { reason: 'classification_conflict:matter_category', count: '1' },
        { reason: 'classification_conflict:matter_type', count: '1' },
        { reason: 'court_remainder_is_hearing_note', count: '1' },
        { reason: 'court_rule_reserved_for_task_2_9', count: '1' },
        { reason: 'invalid_scalar_value', count: '1' },
        { reason: 'matter_no_client', count: '1' },
        { reason: 'separate_client', count: '3' },
        { reason: 'unmapped_importance', count: '1' },
      ]);
      console.log(
        '  ok    conflicts, wrong clients, unknown values and unsafe remainders quarantine',
      );

      await assertReconciliationClean(db);
      console.log('  ok    the permanent reconciliation accepts the untouched fixture result');

      await proveReconciliationFailure(
        db,
        'permanent reconciliation catches swapped direct note fields',
        () =>
          db.query(`
            UPDATE matters
               SET notes_1 = notes_2, notes_2 = notes_1
             WHERE legacy_id = 1001`),
        ['notes_1_mismatch', 'notes_2_mismatch'],
      );

      await proveReconciliationFailure(
        db,
        'permanent reconciliation catches a changed typed date',
        () => db.query(`UPDATE matters SET start_date = DATE '2026-01-01' WHERE legacy_id = 1001`),
        ['start_date_mismatch'],
      );

      await proveReconciliationFailure(
        db,
        'permanent reconciliation catches a changed extraction fingerprint',
        () =>
          db.query(
            `UPDATE matters SET legacy_source_extraction_sha256 = $1 WHERE legacy_id = 1001`,
            ['B'.repeat(64)],
          ),
        ['legacy_source_extraction_sha256_mismatch'],
      );

      await proveReconciliationFailure(
        db,
        'permanent reconciliation catches incorrect quarantine reasons and details',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.matter_transform DISABLE TRIGGER matter_transform_source_immutable',
          );
          await db.query(`
            UPDATE quarantine.matter_transform
               SET reason_codes = ARRAY['incorrect_fixture_reason'],
                   reason_details = jsonb_build_array(jsonb_build_object('changed', true))
             WHERE legacy_matter_id = '1201'`);
        },
        ['quarantine_reason_codes_mismatch', 'quarantine_reason_details_mismatch'],
      );

      await proveReconciliationFailure(
        db,
        'permanent reconciliation catches changed quarantine trace evidence',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.matter_transform DISABLE TRIGGER matter_transform_source_immutable',
          );
          await db.query(`
            UPDATE quarantine.matter_transform
               SET src_file = 'fixture/changed-trace.csv', src_row_num = 777
             WHERE legacy_matter_id = '1201'`);
        },
        ['quarantine_src_file_mismatch', 'quarantine_src_row_mismatch'],
      );

      const raw = await db.query<{
        category: string;
        note_empty: boolean;
        note_null: boolean;
        payload_equal: boolean;
      }>(`
        SELECT m.legacy_category_raw AS category,
               m.notes_1 = '' AS note_empty,
               m.notes_2 IS NULL AND m.legacy_source_payload->'matterNotes2' = 'null'::jsonb AS note_null,
               m.legacy_source_payload = to_jsonb(s) - ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] AS payload_equal
          FROM matters m JOIN staging."الدعاوى" s
            ON s.src_record_key = m.legacy_source_record_key
         WHERE m.legacy_id = 1001`);
      assert.deepEqual(raw.rows[0], {
        category: ' عمال',
        note_empty: true,
        note_null: true,
        payload_equal: true,
      });
      console.log('  ok    edge spaces, Arabic, empty text and NULL survive without alteration');

      const courts = await db.query<{ legacy_id: number; label_ar: string | null }>(`
        SELECT m.legacy_id, c.label_ar FROM matters m
          LEFT JOIN lookup_court c ON c.id = m.court_id
         WHERE m.legacy_id IN (1002,1003,1004) ORDER BY m.legacy_id`);
      assert.deepEqual(courts.rows, [
        { legacy_id: 1002, label_ar: 'القضاء الإداري' },
        { legacy_id: 1003, label_ar: 'القضاء الإداري بالعباسية' },
        { legacy_id: 1004, label_ar: null },
      ]);
      console.log('  ok    the two administrative courts stay distinct and / stays discarded');

      const wrongClients = await db.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM matters WHERE legacy_id BETWEEN 1101 AND 1103`);
      assert.equal(wrongClients.rows[0]!.count, '0');
      const conflicts = await db.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM matters WHERE legacy_id IN (1202,1203)`);
      assert.equal(conflicts.rows[0]!.count, '0');
      console.log('  ok    separate_client and classification conflicts never reach matters');

      await assert.rejects(
        db.query('DELETE FROM quarantine.matter_transform'),
        /migration evidence; resolve rows, never delete or truncate them/,
      );
      await assert.rejects(
        db.query('TRUNCATE quarantine.matter_transform'),
        // Migration 60's resolution FK refuses TRUNCATE before the original
        // erasure trigger. Its exact trigger definition is still checked above.
        /migration evidence; resolve rows, never delete or truncate them|cannot truncate a table referenced in a foreign key constraint/,
      );
      console.log('  ok    quarantine evidence refuses both DELETE and TRUNCATE');

      const digestBeforeRerun = await resultDigest(db);
      const rerun = runMatterTransform({ database: databaseName });
      assert.equal(rerun.status, 0, rerun.output);
      assert.equal(rerun.proved, 12);
      assert.equal(await resultDigest(db), digestBeforeRerun);
      console.log('  ok    an identical rerun changes no row, timestamp or identifier');

      const keyBeforeMove = await db.query<{ src_record_key: string }>(`
        SELECT src_record_key FROM staging."الدعاوى" WHERE "matterID" = '1001'`);
      await db.query(`
        UPDATE staging."الدعاوى" SET src_file = 'fixture/reordered.csv', src_row_num = 9999
         WHERE "matterID" = '1001'`);
      const keyAfterMove = await db.query<{ src_record_key: string }>(`
        SELECT src_record_key FROM staging."الدعاوى" WHERE "matterID" = '1001'`);
      assert.equal(keyAfterMove.rows[0]!.src_record_key, keyBeforeMove.rows[0]!.src_record_key);
      const afterMove = runMatterTransform({ database: databaseName });
      assert.equal(afterMove.status, 0, afterMove.output);
      assert.equal(await resultDigest(db), digestBeforeRerun);
      console.log(
        '  ok    filename and row-order changes do not change durable identity or results',
      );
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      const identity = await admin.query<{ datname: string }>(
        `SELECT datname FROM pg_database WHERE datname = $1 AND datname LIKE 'matter_transform_fixture_%'`,
        [databaseName],
      );
      assert.equal(identity.rows[0]?.datname, databaseName);
      // Rule 14: this database did not exist before this test, and every table
      // and row in it was created by this fixture's migration/setup above.
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await admin.query(`DROP DATABASE ${quoteIdentifier(databaseName)}`);
    }
    await admin.end();
  }
}

runFixture()
  .then(() => console.log('\ntest:matter-transform -- all fixture cases correct.\n'))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
