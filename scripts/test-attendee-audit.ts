import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { runAttendeeAudit } from './apply-attendee-decomposition';
import {
  attendeeAuditResultDigest,
  attendeeAuditStructureFailures,
  reconcileAttendeeAudit,
} from './lib/attendee-audit-reconciliation';
import {
  decomposeAttendeeCell,
  type AttendeeDecompositionRules,
} from './lib/attendee-decomposition';

const FINGERPRINT = 'A'.repeat(64);

function quoteIdentifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function migrateFixture(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `fixture migrations failed:\n${result.stdout}\n${result.stderr}`);
}

async function assertClean(db: Client): Promise<void> {
  assert.deepEqual((await reconcileAttendeeAudit(db)).defects, []);
}

async function proveFailure(
  db: Client,
  label: string,
  mutate: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await mutate();
    assert.match((await reconcileAttendeeAudit(db)).defects.join('\n'), expected, label);
  } finally {
    await db.query('ROLLBACK');
  }
  await assertClean(db);
  console.log(`  ok    ${label}`);
}

async function proveStructureFailure(
  db: Client,
  label: string,
  mutate: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await mutate();
    assert.match((await attendeeAuditStructureFailures(db)).join('\n'), expected, label);
  } finally {
    await db.query('ROLLBACK');
  }
  assert.deepEqual(await attendeeAuditStructureFailures(db), []);
  console.log(`  ok    ${label}`);
}

async function main(): Promise<void> {
  const projectUrlText = process.env['DATABASE_URL'];
  assert.ok(projectUrlText, 'DATABASE_URL is required for the fixture');
  const databaseName = `attendee_audit_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrlText);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrlText);
  fixtureUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;

  await admin.connect();
  try {
    assert.equal(
      (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName])).rowCount,
      0,
    );
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    created = true;
    migrateFixture(fixtureUrl.toString());

    const db = new Client({ connectionString: fixtureUrl.toString() });
    await db.connect();
    try {
      const aliases = await db.query<{
        alias_ar: string;
        person_id: number;
        name_ar: string;
      }>(`
        SELECT a.alias_ar, a.person_id, p.name_ar
          FROM person_name_alias a JOIN people p ON p.id=a.person_id
         WHERE a.is_primary ORDER BY a.person_id LIMIT 2`);
      assert.equal(aliases.rows.length, 2);
      const first = aliases.rows[0]!;
      const second = aliases.rows[1]!;
      const compound = `${first.alias_ar} و ${second.alias_ar}`;

      const sourceRows = [
        { key: `${'1'.repeat(64)}:000001`, first: first.alias_ar, second: compound },
        { key: `${'2'.repeat(64)}:000001`, first: '**', second: second.alias_ar },
      ];
      for (const [index, row] of sourceRows.entries()) {
        await db.query(
          `INSERT INTO staging."الجلسات" (
             src_file, src_row_num, src_record_key, src_extraction_sha256,
             "ID_hearings", "الحاضر", "حاضر 1"
           ) VALUES ('fixture/hearings.csv',$1,$2,$3,$4,$5,$6)`,
          [index + 1, row.key, FINGERPRINT, String(8000 + index), row.first, row.second],
        );
      }

      await db.query(
        `INSERT INTO quarantine.review_value (
           topic, value, occurrences, confidence, firm_answer, firm_person,
           answered_at, answered_by, extraction_sha256, legacy_workbook_id
         ) VALUES
           ('attendee_name',$1,1,'high','person',$2,CURRENT_TIMESTAMP,'fixture',$5,1),
           ('attendee_name',$3,1,'high','split',$4,CURRENT_TIMESTAMP,'fixture',$5,2),
           ('attendee_name','**',1,'none','not a name',NULL,CURRENT_TIMESTAMP,'fixture',$5,3)`,
        [
          first.alias_ar,
          first.name_ar,
          compound,
          `${first.name_ar} + ${second.name_ar}`,
          FINGERPRINT,
        ],
      );

      const dryRun = await runAttendeeAudit({
        databaseUrl: fixtureUrl.toString(),
        expectedAttendeeAnswers: 3,
        expectedTotalAnswers: 3,
      });
      assert.equal(dryRun.plan.sourceCellCount, 4);
      assert.equal(dryRun.plan.reviewedCellCount, 3);
      assert.equal(dryRun.plan.unreviewedExactAliasCellCount, 1);
      assert.equal(
        (await db.query('SELECT count(*) FROM _migration.attendee_source_cell')).rows[0]!.count,
        '0',
      );
      console.log('  ok    dry run reconciles every fixture answer and writes nothing');

      await assert.rejects(
        runAttendeeAudit({
          databaseUrl: fixtureUrl.toString(),
          apply: true,
          forceFailure: true,
          expectedAttendeeAnswers: 3,
          expectedTotalAnswers: 3,
        }),
        /fixture forced late attendee-audit failure/u,
      );
      assert.equal(
        (await db.query('SELECT count(*) FROM _migration.attendee_source_cell')).rows[0]!.count,
        '0',
      );
      console.log('  ok    a forced late failure rolls back every audit and quarantine row');

      const applied = await runAttendeeAudit({
        databaseUrl: fixtureUrl.toString(),
        apply: true,
        expectedAttendeeAnswers: 3,
        expectedTotalAnswers: 3,
      });
      assert.deepEqual(applied.reconciliation?.defects, []);
      await assertClean(db);
      assert.deepEqual(await attendeeAuditStructureFailures(db), []);

      const digest = await attendeeAuditResultDigest(db);
      const secondRun = await runAttendeeAudit({
        databaseUrl: fixtureUrl.toString(),
        apply: true,
        expectedAttendeeAnswers: 3,
        expectedTotalAnswers: 3,
      });
      assert.equal(secondRun.digest, digest);
      console.log('  ok    identical rerun preserves ids, timestamps and all audit evidence');

      const rules: AttendeeDecompositionRules = {
        knownPeople: new Map([
          [first.alias_ar, { personKey: String(first.person_id), canonicalName: first.name_ar }],
        ]),
        knownPlaceholders: new Set(),
        knownNotes: new Set(),
        knownRoles: new Set(),
        knownTitles: [],
      };
      const identityBefore = decomposeAttendeeCell(
        {
          sourceTable: 'الجلسات',
          sourceRecordKey: sourceRows[0]!.key,
          sourceExtractionSha256: FINGERPRINT,
          sourceColumn: 'الحاضر',
          originalCell: first.alias_ar,
          sourceFile: 'before.csv',
          sourceRowNumber: 1,
        },
        rules,
      );
      const identityAfter = decomposeAttendeeCell(
        {
          ...identityBefore.source,
          sourceFile: 'after.csv',
          sourceRowNumber: 999,
        },
        rules,
      );
      assert.equal(identityAfter.cellId, identityBefore.cellId);
      assert.equal(identityAfter.fragments[0]!.fragmentId, identityBefore.fragments[0]!.fragmentId);
      console.log('  ok    filename and row reordering do not change durable identities');

      assert.throws(
        () =>
          decomposeAttendeeCell(identityBefore.source, {
            ...rules,
            knownNotes: new Set([first.alias_ar]),
          }),
        /both a person alias and a note/u,
      );
      console.log('  ok    conflicting exact classifications are refused');

      await proveFailure(
        db,
        'changed source text is detected',
        () =>
          db.query(
            `UPDATE staging."الجلسات" SET "الحاضر"="الحاضر" || '!' WHERE src_record_key=$1`,
            [sourceRows[0]!.key],
          ),
        /source attendee cells missing, extra or changed/u,
      );
      await proveFailure(
        db,
        'altered offsets are detected',
        async () => {
          await db.query(
            'ALTER TABLE _migration.attendee_source_span DISABLE TRIGGER attendee_source_span_immutable',
          );
          await db.query(
            'ALTER TABLE _migration.attendee_source_span DROP CONSTRAINT attendee_source_span_fragment_id_matches',
          );
          await db.query(
            `UPDATE _migration.attendee_source_span SET start_offset=start_offset+1 WHERE fragment_id=(SELECT fragment_id FROM _migration.attendee_source_span ORDER BY fragment_id LIMIT 1)`,
          );
        },
        /gap, overlap, changed raw slice|constraint definition missing/u,
      );
      await proveFailure(
        db,
        'a missing span is detected',
        async () => {
          await db.query(
            'ALTER TABLE _migration.attendee_source_span DISABLE TRIGGER attendee_source_span_no_erasure',
          );
          await db.query(
            'DELETE FROM _migration.attendee_source_span WHERE fragment_id=(SELECT fragment_id FROM _migration.attendee_source_span ORDER BY fragment_id LIMIT 1)',
          );
        },
        /ordered spans do not reconstruct|gap, overlap/u,
      );
      await proveFailure(
        db,
        'an extra span is detected',
        () =>
          db.query(`
          INSERT INTO _migration.attendee_source_span (
            fragment_id,cell_id,source_table,src_record_key,extraction_sha256,
            source_column,original_cell_sha256,sequence,line,start_offset,end_offset,
            raw,value,kind,classification_rule,review_required
          ) SELECT _migration.attendee_fragment_id(cell_id,1,2,substring(original_cell from 2 for 1)),
                   cell_id,source_table,src_record_key,extraction_sha256,source_column,
                   original_cell_sha256,99,1,1,2,substring(original_cell from 2 for 1),
                   substring(original_cell from 2 for 1),'ambiguous','unclassified_review',true
              FROM _migration.attendee_source_cell ORDER BY cell_id LIMIT 1`),
        /ordered spans do not reconstruct|gap, overlap|ambiguous spans missing/u,
      );
      await proveFailure(
        db,
        'reordered spans are detected',
        async () => {
          await db.query(
            'ALTER TABLE _migration.attendee_source_span DISABLE TRIGGER attendee_source_span_immutable',
          );
          const spans = await db.query<{ fragment_id: string; sequence: number }>(`
            SELECT fragment_id,sequence FROM _migration.attendee_source_span
             WHERE cell_id=(SELECT cell_id FROM _migration.attendee_source_span GROUP BY cell_id HAVING count(*)>2 ORDER BY cell_id LIMIT 1)
             ORDER BY sequence LIMIT 2`);
          await db.query(
            'UPDATE _migration.attendee_source_span SET sequence=sequence+100 WHERE fragment_id=ANY($1)',
            [spans.rows.map((row) => row.fragment_id)],
          );
          await db.query(
            'UPDATE _migration.attendee_source_span SET sequence=$1 WHERE fragment_id=$2',
            [spans.rows[1]!.sequence, spans.rows[0]!.fragment_id],
          );
          await db.query(
            'UPDATE _migration.attendee_source_span SET sequence=$1 WHERE fragment_id=$2',
            [spans.rows[0]!.sequence, spans.rows[1]!.fragment_id],
          );
        },
        /ordered spans do not reconstruct|gap, overlap/u,
      );
      await proveFailure(
        db,
        'wrong person resolution is detected',
        async () => {
          await db.query(
            'ALTER TABLE _migration.attendee_source_span DISABLE TRIGGER attendee_source_span_immutable',
          );
          await db.query(
            `UPDATE _migration.attendee_source_span SET person_id=$1 WHERE fragment_id=(SELECT fragment_id FROM _migration.attendee_source_span WHERE person_id=$2 ORDER BY fragment_id LIMIT 1)`,
            [second.person_id, first.person_id],
          );
        },
        /person spans that do not resolve|ordered people differ/u,
      );
      await proveFailure(
        db,
        'missing quarantine evidence is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.attendee_span DISABLE TRIGGER attendee_span_no_erasure',
          );
          await db.query(
            'DELETE FROM quarantine.attendee_span WHERE fragment_id=(SELECT fragment_id FROM quarantine.attendee_span ORDER BY fragment_id LIMIT 1)',
          );
        },
        /ambiguous spans missing/u,
      );
      await proveFailure(
        db,
        'extra quarantine evidence is detected',
        () =>
          db.query(`
          INSERT INTO quarantine.attendee_span (
            fragment_id,cell_id,source_table,src_record_key,extraction_sha256,
            source_column,original_cell_sha256,src_file,src_row_num,sequence,
            start_offset,end_offset,raw,classification_rule,reason_code,reason_detail
          ) SELECT s.fragment_id,s.cell_id,s.source_table,s.src_record_key,s.extraction_sha256,
                   s.source_column,s.original_cell_sha256,c.src_file,c.src_row_num,s.sequence,
                   s.start_offset,s.end_offset,s.raw,'unclassified_review',
                   'ambiguous_attendee_fragment',jsonb_build_object('kind','ambiguous','raw',s.raw,'rule','unclassified_review')
              FROM _migration.attendee_source_span s JOIN _migration.attendee_source_cell c USING(cell_id)
             WHERE s.kind='person' ORDER BY s.fragment_id LIMIT 1`),
        /ambiguous spans missing/u,
      );
      await proveFailure(
        db,
        'durable identity drift is detected',
        async () => {
          await db.query(
            'ALTER TABLE _migration.attendee_source_cell DISABLE TRIGGER attendee_source_cell_immutable',
          );
          await db.query(
            'ALTER TABLE _migration.attendee_source_cell DROP CONSTRAINT attendee_source_cell_id_matches',
          );
          await db.query(
            `UPDATE _migration.attendee_source_cell SET src_record_key=$1 WHERE cell_id=(SELECT cell_id FROM _migration.attendee_source_cell ORDER BY cell_id LIMIT 1)`,
            [`${'f'.repeat(64)}:000001`],
          );
        },
        /source attendee cells missing, extra or changed|copied source evidence/u,
      );

      await proveStructureFailure(
        db,
        'a disabled audit protection trigger is detected',
        () =>
          db.query(
            'ALTER TABLE _migration.attendee_source_cell DISABLE TRIGGER attendee_source_cell_immutable',
          ),
        /trigger disabled/u,
      );
      await proveStructureFailure(
        db,
        'a weakened protection function is detected',
        () =>
          db.query(`
          CREATE OR REPLACE FUNCTION _migration.refuse_attendee_audit_row_change()
          RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$`),
        /function definition changed/u,
      );
      await assert.rejects(
        db.query('DELETE FROM _migration.attendee_source_cell'),
        /immutable migration evidence/u,
      );
      await assert.rejects(
        db.query('TRUNCATE quarantine.attendee_span'),
        /immutable migration evidence/u,
      );
      console.log('  ok    audit and quarantine DELETE/TRUNCATE are refused');
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      const identity = await admin.query<{ datname: string }>(
        `SELECT datname FROM pg_database WHERE datname=$1 AND datname LIKE 'attendee_audit_fixture_%'`,
        [databaseName],
      );
      assert.equal(identity.rows[0]?.datname, databaseName);
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
        [databaseName],
      );
      await admin.query(`DROP DATABASE ${quoteIdentifier(databaseName)}`);
    }
    await admin.end();
  }
}

main()
  .then(() => console.log('\ntest:attendee-audit -- all fixture cases correct.\n'))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
