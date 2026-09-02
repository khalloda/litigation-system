import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { buildAttendancePlan } from './lib/attendance-transform-plan';
import { attendanceResultDigest, reconcileAttendance } from './lib/attendance-reconciliation';
import { attendanceStructureFailures } from './lib/attendance-structure';
import { LIVE_ATTENDANCE_COUNTS, runAttendanceTransform } from './transform-attendance';

const FP = 'F'.repeat(64);
const key = (number: number) => `${number.toString(16).padStart(64, '0')}:000001`;
const expected: typeof LIVE_ATTENDANCE_COUNTS = {
  source: 12,
  target: 4,
  quarantine: 8,
  distinctPeople: 2,
};

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function migrate(databaseUrl: string): void {
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
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function clean(db: Client): Promise<void> {
  const reconciliation = await reconcileAttendance(db, false);
  assert.deepEqual(reconciliation.defects, [], reconciliation.defects.join('\n'));
  assert.deepEqual(await attendanceStructureFailures(db), []);
}

async function reconciliationFailure(
  db: Client,
  label: string,
  mutation: () => Promise<unknown>,
  pattern: RegExp,
  disableTargetGuard = false,
): Promise<void> {
  await db.query('BEGIN');
  try {
    if (disableTargetGuard)
      await db.query('ALTER TABLE attendance DISABLE TRIGGER attendance_legacy_no_change');
    await mutation();
    assert.match((await reconcileAttendance(db, false)).defects.join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}

async function structureFailure(
  db: Client,
  label: string,
  mutation: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await mutation();
    assert.match((await attendanceStructureFailures(db)).join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  assert.deepEqual(await attendanceStructureFailures(db), []);
  console.log(`  ok    ${label}`);
}

type MigratedIdentity = {
  sourceKey: string | null;
  extractionSha256: string | null;
  sourcePayload: Record<string, unknown> | null;
};

function migratedPayload(id: number): Record<string, string> {
  return {
    ID: String(id),
    AttDate: '2026-08-26 00:00:00',
    AttSituation: 'legacy',
    المحامي: 'إيهاب حمدي',
  };
}

async function insertMigratedAttendance(
  db: Client,
  legacyId: number,
  identity: MigratedIdentity,
): Promise<void> {
  await db.query(
    `INSERT INTO attendance(
       legacy_id,person_id,legacy_person_raw,attendance_date,situation,
       legacy_situation_raw,legacy_source_record_key,
       legacy_source_extraction_sha256,legacy_source_payload,updated_at)
     VALUES($1,4,'إيهاب حمدي','2026-08-26','legacy','legacy',$2,$3,$4,CURRENT_TIMESTAMP)`,
    [legacyId, identity.sourceKey, identity.extractionSha256, identity.sourcePayload],
  );
}

async function insertQuarantineEvidence(
  db: Client,
  sourceKey: string,
  legacyIdRaw = 'fixture-extra',
): Promise<void> {
  await db.query(
    `INSERT INTO quarantine.attendance_transform(
       src_record_key,extraction_sha256,src_file,src_row_num,
       legacy_attendance_id_raw,reason_codes,reason_details,source_payload)
     VALUES($1,$2,'fixture/extra.csv',1,$3,ARRAY['invalid_attendance_id'],
            '[{"value":"fixture-extra"}]','{"ID":"fixture-extra"}')`,
    [sourceKey, FP, legacyIdRaw],
  );
}

async function disableQuarantineGuard(db: Client): Promise<void> {
  await db.query(
    'ALTER TABLE quarantine.attendance_transform DISABLE TRIGGER attendance_transform_no_change',
  );
}

async function main(): Promise<void> {
  const projectUrl = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(projectUrl, 'MIGRATION_DATABASE_URL is required');
  const databaseName = `attendance_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrl);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrl);
  fixtureUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${identifier(databaseName)}`);
    created = true;
    migrate(fixtureUrl.toString());
    const db = new Client({ connectionString: fixtureUrl.toString() });
    await db.connect();
    try {
      const rows: Array<[string, string | null, string | null, string | null]> = [
        ['1', '2020-01-01 00:00:00', 'Nothing', 'إيهاب حمدي'],
        ['2', '2020-01-02 00:00:00', '  line one\nline two  ', 'أحمد سعيد'],
        ['3', '2020-01-03 00:00:00', null, 'إيهاب حمدي'],
        ['4', '2020-01-04 00:00:00', '', 'أحمد سعيد'],
        ['bad', '2020-01-05 00:00:00', 'invalid id', 'إيهاب حمدي'],
        ['6', '2020-01-06 00:00:00', 'duplicate one', 'إيهاب حمدي'],
        ['6', '2020-01-07 00:00:00', 'duplicate two', 'أحمد سعيد'],
        ['8', '2020-02-30 00:00:00', 'invalid date', 'إيهاب حمدي'],
        ['9', '2020-01-09 09:30:00', 'time needs decision', 'أحمد سعيد'],
        ['10', '2020-01-10 00:00:00', 'unknown person', 'اسم غير معروف'],
        ['11', '2020-01-11 00:00:00', 'empty person', ''],
        ['12', '2020-01-12 00:00:00', 'missing person', null],
      ];
      for (const [index, row] of rows.entries())
        await db.query(
          `INSERT INTO staging."Attendance"(
             src_file,src_row_num,"ID","AttDate","AttSituation","المحامي",
             src_record_key,src_extraction_sha256)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          ['fixture/Attendance.csv', index + 1, row[0], row[1], row[2], row[3], key(index + 1), FP],
        );

      const dry = await runAttendanceTransform({
        databaseUrl: fixtureUrl.toString(),
        expectedCounts: expected,
        enforceLiveBaselines: false,
      });
      assert.equal((await db.query('SELECT count(*) FROM attendance')).rows[0]!.count, '0');
      assert.equal(
        (await db.query('SELECT count(*) FROM quarantine.attendance_transform')).rows[0]!.count,
        '0',
      );
      assert.deepEqual(
        dry.plan.quarantine.map((row) => [row.legacyAttendanceIdRaw, row.reasonCodes]),
        [
          ['bad', ['invalid_attendance_id']],
          ['6', ['duplicate_attendance_id']],
          ['6', ['duplicate_attendance_id']],
          ['8', ['invalid_attendance_date']],
          ['9', ['meaningful_attendance_time']],
          ['10', ['unresolved_person_alias']],
          ['11', ['empty_person_name']],
          ['12', ['missing_person_name']],
        ],
      );
      console.log(
        '  ok    dry run partitions valid, invalid, timed and unresolved source rows without writes',
      );

      await db.query('BEGIN');
      try {
        await db.query('DROP INDEX person_name_alias_alias_ar_key');
        const newPerson = (
          await db.query<{ id: number }>(
            `INSERT INTO people(name_ar,updated_at) VALUES('شخص اختبار',CURRENT_TIMESTAMP) RETURNING id`,
          )
        ).rows[0]!.id;
        await db.query(
          `INSERT INTO person_name_alias(person_id,alias_ar,is_primary)
           VALUES($1,'إيهاب حمدي',false)`,
          [newPerson],
        );
        const ambiguous = await buildAttendancePlan(db);
        const first = ambiguous.quarantine.find((row) => row.legacyAttendanceIdRaw === '1');
        assert.deepEqual(first?.reasonCodes, ['ambiguous_person_alias']);
      } finally {
        await db.query('ROLLBACK');
      }
      assert.deepEqual(await attendanceStructureFailures(db), []);
      console.log(
        '  ok    an exact spelling resolving to two people is quarantined, never guessed',
      );

      await assert.rejects(
        runAttendanceTransform({
          databaseUrl: fixtureUrl.toString(),
          apply: true,
          forceFailure: true,
          expectedCounts: expected,
          enforceLiveBaselines: false,
        }),
        /forced late Task 2\.10B failure/,
      );
      assert.equal((await db.query('SELECT count(*) FROM attendance')).rows[0]!.count, '0');
      assert.equal(
        (await db.query('SELECT count(*) FROM quarantine.attendance_transform')).rows[0]!.count,
        '0',
      );
      console.log('  ok    forced late failure leaves zero target and quarantine rows');

      const applied = await runAttendanceTransform({
        databaseUrl: fixtureUrl.toString(),
        apply: true,
        expectedCounts: expected,
        enforceLiveBaselines: false,
      });
      assert.ok(applied.reconciliation?.resultDigest);
      await clean(db);
      console.log(
        '  ok    fixture applies atomically and independently reconciles every source row',
      );

      const preserved = await db.query<{
        legacy_id: number;
        situation: string | null;
        legacy_situation_raw: string | null;
        source_value: string | null;
      }>(`
        SELECT a.legacy_id,a.situation,a.legacy_situation_raw,
               a.legacy_source_payload->>'AttSituation' source_value
          FROM attendance a ORDER BY legacy_id`);
      assert.deepEqual(
        preserved.rows.map((row) => [
          row.legacy_id,
          row.situation,
          row.legacy_situation_raw,
          row.source_value,
        ]),
        [
          [1, 'Nothing', 'Nothing', 'Nothing'],
          [2, '  line one\nline two  ', '  line one\nline two  ', '  line one\nline two  '],
          [3, null, null, null],
          [4, '', '', ''],
        ],
      );
      console.log(
        '  ok    Nothing, whitespace, line breaks, NULL and empty text remain byte-distinct',
      );

      await reconciliationFailure(
        db,
        'changed person link is detected independently',
        () => db.query(`UPDATE attendance SET person_id=6 WHERE legacy_id=1`),
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'changed raw person spelling is detected independently',
        () => db.query(`UPDATE attendance SET legacy_person_raw='تغيير' WHERE legacy_id=1`),
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'changed usable situation alone is detected independently',
        async () => {
          await db.query('ALTER TABLE attendance DROP CONSTRAINT attendance_source_identity_shape');
          await db.query(`UPDATE attendance SET situation='changed' WHERE legacy_id=1`);
        },
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'changed raw situation alone is detected independently',
        async () => {
          await db.query('ALTER TABLE attendance DROP CONSTRAINT attendance_source_identity_shape');
          await db.query(`UPDATE attendance SET legacy_situation_raw='changed' WHERE legacy_id=1`);
        },
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'changed typed date is detected independently',
        () => db.query(`UPDATE attendance SET attendance_date='2020-01-02' WHERE legacy_id=1`),
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'changed extraction fingerprint is detected independently',
        () =>
          db.query(`UPDATE attendance SET legacy_source_extraction_sha256=$1 WHERE legacy_id=1`, [
            'A'.repeat(64),
          ]),
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'changed durable source key is detected independently',
        () =>
          db.query(`UPDATE attendance SET legacy_source_record_key=$1 WHERE legacy_id=1`, [
            key(700),
          ]),
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'changed complete source payload is detected independently',
        () =>
          db.query(
            `UPDATE attendance SET legacy_source_payload='{"ID":"changed"}' WHERE legacy_id=1`,
          ),
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'changed source ID is detected independently',
        () => db.query(`UPDATE staging."Attendance" SET "ID"='1001' WHERE "ID"='1'`),
        /Attendance target\/source mismatch/,
      );
      await reconciliationFailure(
        db,
        'changed source date is detected independently',
        () =>
          db.query(
            `UPDATE staging."Attendance" SET "AttDate"='2020-01-02 00:00:00' WHERE "ID"='1'`,
          ),
        /Attendance target\/source mismatch/,
      );
      await reconciliationFailure(
        db,
        'changed source situation is detected independently',
        () => db.query(`UPDATE staging."Attendance" SET "AttSituation"='Different' WHERE "ID"='1'`),
        /Attendance target\/source mismatch/,
      );
      await reconciliationFailure(
        db,
        'changed source lawyer is detected independently',
        () => db.query(`UPDATE staging."Attendance" SET "المحامي"='أحمد سعيد' WHERE "ID"='1'`),
        /Attendance target\/source mismatch/,
      );

      await reconciliationFailure(
        db,
        'missing target outcome is detected even when the source is put in quarantine',
        async () => {
          await db.query(`DELETE FROM attendance WHERE legacy_id=1`);
          await insertQuarantineEvidence(db, key(1), '1');
        },
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'additional target outcome with no source is detected',
        () =>
          insertMigratedAttendance(db, 9101, {
            sourceKey: key(701),
            extractionSha256: FP,
            sourcePayload: migratedPayload(9101),
          }),
        /Attendance target\/source mismatch/,
      );
      await reconciliationFailure(
        db,
        'one source appearing in both target and quarantine is detected',
        () => insertQuarantineEvidence(db, key(1), '1'),
        /Attendance quarantine\/source mismatch/,
      );
      await reconciliationFailure(
        db,
        'one source appearing in neither target nor quarantine is detected',
        () => db.query(`DELETE FROM attendance WHERE legacy_id=1`),
        /Attendance target\/source mismatch/,
        true,
      );
      await reconciliationFailure(
        db,
        'missing quarantine outcome is detected even when the source is put in target',
        async () => {
          await disableQuarantineGuard(db);
          await db.query(
            `DELETE FROM quarantine.attendance_transform WHERE legacy_attendance_id_raw='bad'`,
          );
          await insertMigratedAttendance(db, 9105, {
            sourceKey: key(5),
            extractionSha256: FP,
            sourcePayload: migratedPayload(9105),
          });
        },
        /Attendance (target|quarantine)\/source mismatch/,
      );
      await reconciliationFailure(
        db,
        'additional quarantine outcome with no source is detected',
        () => insertQuarantineEvidence(db, key(702)),
        /Attendance quarantine\/source mismatch/,
      );

      const quarantineMutations: Array<[string, string, unknown[]]> = [
        [
          'changed quarantine reason code is detected independently',
          `UPDATE quarantine.attendance_transform SET reason_codes=ARRAY['unresolved_person_alias']
            WHERE legacy_attendance_id_raw='bad'`,
          [],
        ],
        [
          'changed quarantine reason detail is detected independently',
          `UPDATE quarantine.attendance_transform SET reason_details='[{"value":"different"}]'
            WHERE legacy_attendance_id_raw='bad'`,
          [],
        ],
        [
          'changed quarantine payload is detected independently',
          `UPDATE quarantine.attendance_transform SET source_payload='{"ID":"different"}'
            WHERE legacy_attendance_id_raw='bad'`,
          [],
        ],
        [
          'changed quarantine fingerprint is detected independently',
          `UPDATE quarantine.attendance_transform SET extraction_sha256=$1
            WHERE legacy_attendance_id_raw='bad'`,
          ['A'.repeat(64)],
        ],
        [
          'changed quarantine durable key is detected independently',
          `UPDATE quarantine.attendance_transform SET src_record_key=$1
            WHERE legacy_attendance_id_raw='bad'`,
          [key(703)],
        ],
        [
          'changed quarantine filename trace is detected independently',
          `UPDATE quarantine.attendance_transform SET src_file='different.csv'
            WHERE legacy_attendance_id_raw='bad'`,
          [],
        ],
        [
          'changed quarantine row trace is detected independently',
          `UPDATE quarantine.attendance_transform SET src_row_num=999
            WHERE legacy_attendance_id_raw='bad'`,
          [],
        ],
      ];
      for (const [label, sql, parameters] of quarantineMutations)
        await reconciliationFailure(
          db,
          label,
          async () => {
            await disableQuarantineGuard(db);
            await db.query(sql, parameters);
          },
          /Attendance quarantine\/source mismatch/,
        );

      const planBefore = await buildAttendancePlan(db);
      await db.query('BEGIN');
      try {
        await db.query(
          `UPDATE staging."Attendance" SET src_file='renamed.csv',src_row_num=src_row_num+100`,
        );
        const reordered = await buildAttendancePlan(db);
        const originalTargetKeys = planBefore.targets.map((row) => row.srcRecordKey);
        const reorderedTargetKeys = reordered.targets.map((row) => row.srcRecordKey);
        assert.deepEqual(reorderedTargetKeys, originalTargetKeys);
        assert.deepEqual(
          reordered.quarantine.map((row) => row.srcRecordKey),
          planBefore.quarantine.map((row) => row.srcRecordKey),
        );
        assert.throws(
          () => assert.deepEqual(reorderedTargetKeys.slice(1), originalTargetKeys),
          assert.AssertionError,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log('  ok    filename and row-position changes do not change durable identities');

      const digestBefore = await attendanceResultDigest(db);
      const completeBefore = (
        await db.query<{ digest: string }>(`
          SELECT encode(sha256(convert_to(string_agg(payload,chr(10) ORDER BY kind,identity),'UTF8')),'hex') digest
            FROM (
              SELECT 'A' kind,id::text identity,to_jsonb(a)::text payload FROM attendance a
              UNION ALL SELECT 'Q',src_record_key,to_jsonb(q)::text
                FROM quarantine.attendance_transform q
            ) x`)
      ).rows[0]!.digest;
      await runAttendanceTransform({
        databaseUrl: fixtureUrl.toString(),
        apply: true,
        expectedCounts: expected,
        enforceLiveBaselines: false,
      });
      assert.equal(await attendanceResultDigest(db), digestBefore);
      const completeAfter = (
        await db.query<{ digest: string }>(`
          SELECT encode(sha256(convert_to(string_agg(payload,chr(10) ORDER BY kind,identity),'UTF8')),'hex') digest
            FROM (
              SELECT 'A' kind,id::text identity,to_jsonb(a)::text payload FROM attendance a
              UNION ALL SELECT 'Q',src_record_key,to_jsonb(q)::text
                FROM quarantine.attendance_transform q
            ) x`)
      ).rows[0]!.digest;
      assert.equal(completeAfter, completeBefore);
      console.log(
        '  ok    identical second run retains ids, timestamps, rows and stable result digest',
      );

      const native = (
        await db.query<{ id: number }>(
          `INSERT INTO attendance(person_id,attendance_date,situation,updated_at)
           VALUES(4,'2026-08-26','native',CURRENT_TIMESTAMP) RETURNING id`,
        )
      ).rows[0]!.id;
      await db.query(`UPDATE attendance SET situation='native changed' WHERE id=$1`, [native]);
      await db.query('DELETE FROM attendance WHERE id=$1', [native]);
      await clean(db);
      console.log('  ok    application-native Attendance insert, update and delete remain valid');

      const nativeForPartial = (
        await db.query<{ id: number }>(
          `INSERT INTO attendance(person_id,attendance_date,situation,updated_at)
           VALUES(4,'2026-08-26','native',CURRENT_TIMESTAMP) RETURNING id`,
        )
      ).rows[0]!.id;
      const partialFields: Array<[string, unknown]> = [
        ['legacy_id', 999],
        ['legacy_person_raw', 'إيهاب حمدي'],
        ['legacy_situation_raw', 'legacy'],
        ['legacy_source_record_key', key(500)],
        ['legacy_source_extraction_sha256', FP],
        ['legacy_source_payload', { ID: '999' }],
      ];
      for (const [field, value] of partialFields) {
        await assert.rejects(
          db.query(`UPDATE attendance SET ${identifier(field)}=$1 WHERE id=$2`, [
            value,
            nativeForPartial,
          ]),
          /migration provenance cannot be attached/,
        );
        await assert.rejects(
          db.query(
            `INSERT INTO attendance(${identifier(field)},updated_at) VALUES($1,CURRENT_TIMESTAMP)`,
            [value],
          ),
          /attendance_source_identity_shape/,
        );
      }
      await db.query('DELETE FROM attendance WHERE id=$1', [nativeForPartial]);
      console.log('  ok    every migration-only field rejects partial native provenance');

      const partialIdentityShapes: Array<[string, MigratedIdentity]> = [
        [
          'all three identity values null',
          { sourceKey: null, extractionSha256: null, sourcePayload: null },
        ],
        [
          'durable key missing',
          { sourceKey: null, extractionSha256: FP, sourcePayload: migratedPayload(9202) },
        ],
        [
          'extraction fingerprint missing',
          { sourceKey: key(712), extractionSha256: null, sourcePayload: migratedPayload(9203) },
        ],
        [
          'complete payload missing',
          { sourceKey: key(713), extractionSha256: FP, sourcePayload: null },
        ],
        [
          'payload present while key and fingerprint are missing',
          { sourceKey: null, extractionSha256: null, sourcePayload: migratedPayload(9205) },
        ],
        [
          'durable key present while fingerprint and payload are missing',
          { sourceKey: key(715), extractionSha256: null, sourcePayload: null },
        ],
      ];
      for (const [index, [label, identity]] of partialIdentityShapes.entries()) {
        const legacyId = 9201 + index;
        await assert.rejects(
          insertMigratedAttendance(db, legacyId, identity),
          /attendance_source_identity_shape/,
        );
        await reconciliationFailure(
          db,
          `independent reconciliation catches ${label}`,
          async () => {
            await db.query(
              'ALTER TABLE attendance DROP CONSTRAINT attendance_source_identity_shape',
            );
            await insertMigratedAttendance(db, legacyId, identity);
          },
          /partial Attendance provenance|Attendance target\/source mismatch/,
        );
      }
      await db.query('BEGIN');
      try {
        await insertMigratedAttendance(db, 9299, {
          sourceKey: key(799),
          extractionSha256: FP,
          sourcePayload: migratedPayload(9299),
        });
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log(
        '  ok    six complete migrated-shaped partial identities are refused and detected; a complete identity is accepted',
      );

      await assert.rejects(
        db.query(`UPDATE attendance SET situation='forbidden' WHERE legacy_id=1`),
        /cannot be updated/,
      );
      await assert.rejects(
        db.query(`DELETE FROM attendance WHERE legacy_id=1`),
        /cannot be deleted/,
      );
      await assert.rejects(db.query('TRUNCATE attendance'), /TRUNCATE is refused/);
      await assert.rejects(
        db.query(
          `UPDATE quarantine.attendance_transform SET src_row_num=1
            WHERE legacy_attendance_id_raw='bad'`,
        ),
        /cannot be updated/,
      );
      await assert.rejects(
        db.query(
          `DELETE FROM quarantine.attendance_transform WHERE legacy_attendance_id_raw='bad'`,
        ),
        /DELETE\/TRUNCATE is refused/,
      );
      await assert.rejects(
        db.query('TRUNCATE quarantine.attendance_transform'),
        /DELETE\/TRUNCATE is refused/,
      );
      await clean(db);
      console.log(
        '  ok    migrated history and quarantine evidence refuse update, delete and truncate',
      );

      await structureFailure(
        db,
        'disabled target immutability trigger is rejected',
        () => db.query('ALTER TABLE attendance DISABLE TRIGGER attendance_legacy_no_change'),
        /trigger definition: attendance_legacy_no_change/,
      );
      await structureFailure(
        db,
        'disabled quarantine immutability trigger is rejected',
        () =>
          db.query(
            'ALTER TABLE quarantine.attendance_transform DISABLE TRIGGER attendance_transform_no_change',
          ),
        /trigger definition: attendance_transform_no_change/,
      );
      await structureFailure(
        db,
        'target immutability trigger missing DELETE is rejected',
        async () => {
          await db.query('DROP TRIGGER attendance_legacy_no_change ON attendance');
          await db.query(`CREATE TRIGGER attendance_legacy_no_change BEFORE UPDATE
            ON attendance FOR EACH ROW EXECUTE FUNCTION refuse_legacy_attendance_change()`);
        },
        /trigger definition: attendance_legacy_no_change/,
      );
      await structureFailure(
        db,
        'removed target TRUNCATE refusal trigger is rejected',
        () => db.query('DROP TRIGGER attendance_no_truncate ON attendance'),
        /trigger definition: attendance_no_truncate|Task 2\.10B trigger inventory/,
      );
      await structureFailure(
        db,
        'source CHECK retaining its name but weakened with OR true is rejected',
        async () => {
          await db.query('ALTER TABLE attendance DROP CONSTRAINT attendance_source_identity_shape');
          await db.query(`ALTER TABLE attendance ADD CONSTRAINT attendance_source_identity_shape
            CHECK (legacy_source_record_key IS NULL OR legacy_source_record_key IS NOT NULL OR true)`);
        },
        /constraint definition: attendance_source_identity_shape/,
      );
      await structureFailure(
        db,
        'non-unique source-key index with the expected name is rejected',
        async () => {
          await db.query('DROP INDEX attendance_legacy_source_record_key_key');
          await db.query(
            'CREATE INDEX attendance_legacy_source_record_key_key ON attendance(legacy_source_record_key)',
          );
        },
        /index definition: attendance_legacy_source_record_key_key/,
      );
      await structureFailure(
        db,
        'correctly named trigger pointing to a permissive function is rejected',
        async () => {
          await db.query(`CREATE FUNCTION quarantine.permissive_attendance_change()
            RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN OLD; END$$`);
          await db.query(
            'DROP TRIGGER attendance_transform_no_change ON quarantine.attendance_transform',
          );
          await db.query(`CREATE TRIGGER attendance_transform_no_change BEFORE UPDATE OR DELETE
            ON quarantine.attendance_transform FOR EACH ROW
            EXECUTE FUNCTION quarantine.permissive_attendance_change()`);
        },
        /trigger definition: attendance_transform_no_change/,
      );
      await structureFailure(
        db,
        'permissive function retaining the refusal phrase is rejected',
        () =>
          db.query(`CREATE OR REPLACE FUNCTION quarantine.refuse_attendance_evidence_change()
            RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
              -- Task 2.10B attendance evidence DELETE/TRUNCATE is refused
              RETURN OLD;
            END$$`),
        /function definition: quarantine\.refuse_attendance_evidence_change/,
      );
      await structureFailure(
        db,
        'per-function search_path configuration is rejected',
        () =>
          db.query(
            'ALTER FUNCTION public.refuse_legacy_attendance_change() SET search_path=public',
          ),
        /function definition: public\.refuse_legacy_attendance_change/,
      );
      await structureFailure(
        db,
        'person foreign key with the wrong delete action is rejected',
        async () => {
          await db.query('ALTER TABLE attendance DROP CONSTRAINT attendance_person_id_fkey');
          await db.query(`ALTER TABLE attendance ADD CONSTRAINT attendance_person_id_fkey
            FOREIGN KEY(person_id) REFERENCES people(id)
            ON UPDATE CASCADE ON DELETE CASCADE`);
        },
        /foreign-key definition: attendance_person_id_fkey/,
      );

      await clean(db);
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [
        databaseName,
      ]);
      await admin.query(`DROP DATABASE ${identifier(databaseName)}`);
    }
    await admin.end();
  }
  console.log('Task 2.10B Attendance fixture passed. Disposable database removed.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
