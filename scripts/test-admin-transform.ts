import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { reconcileAdminWorks } from './lib/admin-reconciliation';
import { adminWorkStructureFailures } from './lib/admin-structure';
import { adminWorkResultDigest, runAdminWorkTransform } from './transform-admin-works';

const FINGERPRINT = 'A'.repeat(64);

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/);
  return `"${value}"`;
}

function sourceKey(sequence: number): string {
  return `${sequence.toString(16).padStart(64, '0')}:000001`;
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
  assert.equal(
    result.status,
    0,
    `fixture migrations failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  );
}

async function clean(db: Client): Promise<void> {
  const result = await reconcileAdminWorks(db);
  assert.deepEqual(result.defects, [], `fixture must reconcile:\n${result.defects.join('\n')}`);
}

async function proveFailure(
  db: Client,
  label: string,
  mutate: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await mutate();
    assert.match((await reconcileAdminWorks(db)).defects.join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}

async function main(): Promise<void> {
  const projectUrlText = process.env['DATABASE_URL'];
  assert.ok(projectUrlText, 'DATABASE_URL is required');
  const databaseName = `admin_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrlText);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrlText);
  fixtureUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    assert.equal(
      (
        await admin.query<{ count: string }>(
          'SELECT count(*)::text count FROM pg_database WHERE datname=$1',
          [databaseName],
        )
      ).rows[0]?.count,
      '0',
    );
    await admin.query(`CREATE DATABASE ${identifier(databaseName)}`);
    created = true;
    migrateFixture(fixtureUrl.toString());
    const db = new Client({ connectionString: fixtureUrl.toString() });
    await db.connect();
    try {
      const alias = (
        await db.query<{ alias_ar: string; person_id: number }>(
          'SELECT alias_ar,person_id FROM person_name_alias ORDER BY id LIMIT 1',
        )
      ).rows[0]!;
      const court = (
        await db.query<{ label_ar: string }>(`
        SELECT label_ar FROM lookup_court c WHERE NOT EXISTS(
          SELECT 1 FROM migration_crosswalk x WHERE x.source_field='court'
            AND _migration.reviewed_text_key(x.source_value)=_migration.reviewed_text_key(c.label_ar))
        ORDER BY c.id LIMIT 1`)
      ).rows[0]!.label_ar;
      const destination = (
        await db.query<{ label_ar: string }>(
          'SELECT label_ar FROM lookup_matter_destination ORDER BY id LIMIT 1',
        )
      ).rows[0]!.label_ar;
      const discardedCourt = 'محكمة مستبعدة للاختبار';
      const discardedCourtId = (
        await db.query<{ id: number }>(
          `INSERT INTO lookup_court(label_ar,updated_at) VALUES($1,CURRENT_TIMESTAMP) RETURNING id`,
          [discardedCourt],
        )
      ).rows[0]!.id;
      await db.query(
        `INSERT INTO migration_crosswalk(
          source_field,source_value,rows_affected,target_field,target_value,reviewer_note
        ) VALUES('court',$1,1,NULL,NULL,'fixture reviewed discard')`,
        [discardedCourt],
      );
      const matterKey = sourceKey(9001);
      await db.query(
        `INSERT INTO matters (
        legacy_id,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload,updated_at
      ) VALUES (9001,$1,$2,'{}'::jsonb,CURRENT_TIMESTAMP)`,
        [matterKey, FINGERPRINT],
      );

      const safeTaskKey = sourceKey(1),
        quarantineTaskKey = sourceKey(2),
        invalidExecutionKey = sourceKey(5),
        invalidDeadlineKey = sourceKey(6),
        discardedCourtKey = sourceKey(7);
      await db.query(
        `INSERT INTO staging."admin work table" (
        src_file,src_row_num,src_record_key,src_extraction_sha256,"ID_Task","تاريخ التنفيذ",
        "النتيجة","القائم بالعمل","القرار السابق","آخر متابعة","المحكمة","الدائرة",
        "الجهة","العمل المطلوب","الحالة","تنبيه","آخر موعد","matterID"
      ) VALUES
        ('fixture/admin.csv',1,$1,$3,'1001','2026-08-25 00:00:00','نتيجة',$4,
         'قرار',E'2026/08/25\\r\\nملاحظة','${court}',NULL,'${destination}','عمل','مفتوح','تنبيه',
         '2026-08-26 00:00:00','9001'),
        ('fixture/admin.csv',2,$2,$3,'1002',NULL,NULL,NULL,NULL,NULL,'${court}',NULL,
         'جهة غير مراجعة','عمل آخر',NULL,NULL,NULL,'9001'),
        ('fixture/admin.csv',5,$5,$3,'1005','2026-02-30 00:00:00',NULL,NULL,NULL,NULL,
         '${court}',NULL,'${destination}','تاريخ تنفيذ غير صالح',NULL,NULL,NULL,'9001'),
        ('fixture/admin.csv',6,$6,$3,'1006',NULL,NULL,NULL,NULL,NULL,'${court}',NULL,
         '${destination}','آخر موعد غير صالح',NULL,NULL,'2026-02-30 00:00:00','9001'),
        ('fixture/admin.csv',7,$7,$3,'1007',NULL,NULL,NULL,NULL,NULL,$8,NULL,
         '${destination}','محكمة مستبعدة',NULL,NULL,NULL,'9001')`,
        [
          safeTaskKey,
          quarantineTaskKey,
          FINGERPRINT,
          alias.alias_ar,
          invalidExecutionKey,
          invalidDeadlineKey,
          discardedCourtKey,
          discardedCourt,
        ],
      );
      const safeActionKey = sourceKey(3),
        quarantineActionKey = sourceKey(4),
        invalidActionDateKey = sourceKey(8),
        invalidNextAppointmentKey = sourceKey(9);
      await db.query(
        `INSERT INTO staging."إجراءات المهام" (
        src_file,src_row_num,src_record_key,src_extraction_sha256,"ID_process","ID_Task",
        "تاريخ الإجراء","القائم بالعمل","النتيجة","تقرير","الموعد القادم"
      ) VALUES
        ('fixture/actions.csv',1,$1,$3,'2001','1001','2026-08-25 00:00:00',$4,
         'نتيجة إجراء','تقرير','2026-08-27 00:00:00'),
        ('fixture/actions.csv',2,$2,$3,'2002',NULL,NULL,NULL,NULL,NULL,NULL),
        ('fixture/actions.csv',8,$5,$3,'2008','1001','2026-02-30 00:00:00',NULL,NULL,NULL,NULL),
        ('fixture/actions.csv',9,$6,$3,'2009','1001',NULL,NULL,NULL,NULL,'2026-02-30 00:00:00')`,
        [
          safeActionKey,
          quarantineActionKey,
          FINGERPRINT,
          alias.alias_ar,
          invalidActionDateKey,
          invalidNextAppointmentKey,
        ],
      );

      const dry = await runAdminWorkTransform({ databaseUrl: fixtureUrl.toString() });
      assert.deepEqual(
        [
          dry.plan.tasks.length,
          dry.plan.taskQuarantine.length,
          dry.plan.actions.length,
          dry.plan.actionQuarantine.length,
        ],
        [2, 3, 1, 3],
      );
      assert.equal((await db.query('SELECT count(*) FROM admin_tasks')).rows[0]!.count, '0');
      console.log('  ok    dry run has no writes and partitions both source tables');

      const applied = await runAdminWorkTransform({
        databaseUrl: fixtureUrl.toString(),
        apply: true,
      });
      assert.ok(applied.digest);
      await clean(db);
      assert.deepEqual(
        (
          await db.query(
            `SELECT legacy_task_id,reason_codes,reason_details
               FROM quarantine.admin_task_transform
              WHERE src_record_key=ANY($1::text[]) ORDER BY legacy_task_id`,
            [[invalidExecutionKey, invalidDeadlineKey]],
          )
        ).rows,
        [
          {
            legacy_task_id: '1005',
            reason_codes: ['invalid_execution_date'],
            reason_details: [{ value: '2026-02-30 00:00:00' }],
          },
          {
            legacy_task_id: '1006',
            reason_codes: ['invalid_deadline'],
            reason_details: [{ value: '2026-02-30 00:00:00' }],
          },
        ],
      );
      assert.deepEqual(
        (
          await db.query(
            `SELECT legacy_action_id,reason_codes,reason_details
               FROM quarantine.task_action_transform
              WHERE src_record_key=ANY($1::text[]) ORDER BY legacy_action_id`,
            [[invalidActionDateKey, invalidNextAppointmentKey]],
          )
        ).rows,
        [
          {
            legacy_action_id: '2008',
            reason_codes: ['invalid_action_date'],
            reason_details: [{ value: '2026-02-30 00:00:00' }],
          },
          {
            legacy_action_id: '2009',
            reason_codes: ['invalid_next_appointment'],
            reason_details: [{ value: '2026-02-30 00:00:00' }],
          },
        ],
      );
      console.log('  ok    all four impossible dates quarantine with exact ordered evidence');
      assert.deepEqual(
        (
          await db.query(
            `SELECT court_id,legacy_court_raw FROM admin_tasks WHERE legacy_source_record_key=$1`,
            [discardedCourtKey],
          )
        ).rows[0],
        { court_id: null, legacy_court_raw: discardedCourt },
      );
      console.log('  ok    a reviewed court discard wins even when the same text is a lookup');
      assert.deepEqual(await adminWorkStructureFailures(db), []);
      const proof = await db.query(
        `SELECT t.required_work,t.last_followup,t.legacy_assignee_raw,
        a.source_ordinal,a.legacy_performed_by_raw
        FROM admin_tasks t JOIN task_actions a ON a.task_id=t.id
        WHERE t.legacy_source_record_key=$1`,
        [safeTaskKey],
      );
      assert.deepEqual(proof.rows[0], {
        required_work: 'عمل',
        last_followup: '2026/08/25\r\nملاحظة',
        legacy_assignee_raw: alias.alias_ar,
        source_ordinal: 1,
        legacy_performed_by_raw: alias.alias_ar,
      });
      console.log('  ok    Arabic text, line breaks, exact raw names and action order survive');

      const before = await db.query(`SELECT jsonb_agg(to_jsonb(x) ORDER BY kind,id) snapshot FROM (
        SELECT 'T' kind,id,created_at,updated_at FROM admin_tasks WHERE legacy_source_record_key IS NOT NULL
        UNION ALL SELECT 'A',id,created_at,updated_at FROM task_actions WHERE legacy_source_record_key IS NOT NULL) x`);
      const digest = await adminWorkResultDigest(db);
      const second = await runAdminWorkTransform({
        databaseUrl: fixtureUrl.toString(),
        apply: true,
      });
      assert.equal(second.digest, digest);
      assert.deepEqual(
        (
          await db.query(`SELECT jsonb_agg(to_jsonb(x) ORDER BY kind,id) snapshot FROM (
        SELECT 'T' kind,id,created_at,updated_at FROM admin_tasks WHERE legacy_source_record_key IS NOT NULL
        UNION ALL SELECT 'A',id,created_at,updated_at FROM task_actions WHERE legacy_source_record_key IS NOT NULL) x`)
        ).rows[0],
        before.rows[0],
      );
      console.log('  ok    identical rerun preserves IDs, timestamps and result digest');

      await proveFailure(
        db,
        'changed direct scalar is detected',
        () =>
          db.query(
            `UPDATE admin_tasks SET required_work='بديل' WHERE legacy_source_record_key=$1`,
            [safeTaskKey],
          ),
        /task_target_mismatch/,
      );
      await proveFailure(
        db,
        'changed typed date is detected',
        () =>
          db.query(
            `UPDATE admin_tasks SET execution_date='2026-08-24' WHERE legacy_source_record_key=$1`,
            [safeTaskKey],
          ),
        /task_target_mismatch/,
      );
      await proveFailure(
        db,
        'a court attached to a reviewed discard is detected',
        () =>
          db.query(`UPDATE admin_tasks SET court_id=$2 WHERE legacy_source_record_key=$1`, [
            discardedCourtKey,
            discardedCourtId,
          ]),
        /task_target_mismatch/,
      );
      await proveFailure(
        db,
        'changed extraction fingerprint is detected',
        () =>
          db.query(
            `UPDATE task_actions SET legacy_source_extraction_sha256=$2 WHERE legacy_source_record_key=$1`,
            [safeActionKey, 'B'.repeat(64)],
          ),
        /action_target_mismatch/,
      );
      await proveFailure(
        db,
        'missing target relationship is detected',
        () =>
          db.query(`DELETE FROM task_actions WHERE legacy_source_record_key=$1`, [safeActionKey]),
        /actual_actions|action_target_mismatch/,
      );
      await proveFailure(
        db,
        'extra legacy target is detected',
        async () => {
          await db.query(
            `INSERT INTO admin_tasks (legacy_id,legacy_source_record_key,legacy_source_extraction_sha256,
          legacy_source_payload,updated_at) VALUES (9999,$1,$2,'{}',CURRENT_TIMESTAMP)`,
            [sourceKey(99), FINGERPRINT],
          );
        },
        /actual_tasks|stale_tasks/,
      );
      await proveFailure(
        db,
        'changed quarantine reason is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.admin_task_transform DISABLE TRIGGER admin_task_transform_no_change',
          );
          await db.query(
            `UPDATE quarantine.admin_task_transform SET reason_codes=ARRAY['wrong'] WHERE src_record_key=$1`,
            [quarantineTaskKey],
          );
        },
        /task_q_mismatch/,
      );
      await proveFailure(
        db,
        'changed quarantine trace is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.task_action_transform DISABLE TRIGGER task_action_transform_no_change',
          );
          await db.query(
            `UPDATE quarantine.task_action_transform SET src_file='wrong.csv' WHERE src_record_key=$1`,
            [quarantineActionKey],
          );
        },
        /action_q_mismatch/,
      );

      const native = await db.query<{ id: number }>(
        `INSERT INTO admin_tasks (required_work,updated_at) VALUES ('native',CURRENT_TIMESTAMP) RETURNING id`,
      );
      await db.query(
        `INSERT INTO task_actions (task_id,result,updated_at) VALUES ($1,'native',CURRENT_TIMESTAMP)`,
        [native.rows[0]!.id],
      );
      await clean(db);
      assert.equal(await adminWorkResultDigest(db), digest);
      console.log(
        '  ok    application-native rows remain outside legacy reconciliation and digest',
      );

      const lateFailureKey = sourceKey(20);
      await db.query(
        `INSERT INTO staging."admin work table" (
        src_file,src_row_num,src_record_key,src_extraction_sha256,"ID_Task","matterID","العمل المطلوب"
      ) VALUES ('fixture/admin.csv',20,$1,$2,'1020','9001','rollback')`,
        [lateFailureKey, FINGERPRINT],
      );
      await assert.rejects(
        runAdminWorkTransform({
          databaseUrl: fixtureUrl.toString(),
          apply: true,
          forceFailure: true,
        }),
        /forced late/,
      );
      assert.equal(
        (
          await db.query('SELECT count(*) FROM admin_tasks WHERE legacy_source_record_key=$1', [
            lateFailureKey,
          ])
        ).rows[0]!.count,
        '0',
      );
      console.log('  ok    forced late failure leaves zero partial rows');
      await db.query('DELETE FROM staging."admin work table" WHERE src_record_key=$1', [
        lateFailureKey,
      ]);
      await clean(db);

      const weakenedStructureKey = sourceKey(21);
      await db.query(
        `INSERT INTO staging."admin work table" (
        src_file,src_row_num,src_record_key,src_extraction_sha256,"ID_Task","matterID","العمل المطلوب"
      ) VALUES ('fixture/admin.csv',21,$1,$2,'1021','9001','safeguard rollback')`,
        [weakenedStructureKey, FINGERPRINT],
      );
      await assert.rejects(
        runAdminWorkTransform({
          databaseUrl: fixtureUrl.toString(),
          apply: true,
          fixtureOnlyWeakenStructureBeforeCommit: true,
        }),
        /database safeguards differ/,
      );
      assert.equal(
        (
          await db.query('SELECT count(*) FROM admin_tasks WHERE legacy_source_record_key=$1', [
            weakenedStructureKey,
          ])
        ).rows[0]!.count,
        '0',
      );
      assert.deepEqual(await adminWorkStructureFailures(db), []);
      await db.query('DELETE FROM staging."admin work table" WHERE src_record_key=$1', [
        weakenedStructureKey,
      ]);
      await clean(db);
      console.log(
        '  ok    weakened safeguard aborts the transform and the transaction restores it',
      );

      await db.query('BEGIN');
      try {
        await db.query(
          `ALTER FUNCTION quarantine.refuse_admin_work_evidence_change() SET search_path=public`,
        );
        assert.match((await adminWorkStructureFailures(db)).join('\n'), /function definition/);
      } finally {
        await db.query('ROLLBACK');
      }
      assert.deepEqual(await adminWorkStructureFailures(db), []);
      console.log('  ok    per-function configuration drift is detected and rolled back');

      await assert.rejects(
        db.query(
          `UPDATE quarantine.admin_task_transform SET src_file='blocked' WHERE src_record_key=$1`,
          [quarantineTaskKey],
        ),
        /immutable migration evidence/,
      );
      await assert.rejects(
        db.query(`DELETE FROM quarantine.task_action_transform WHERE src_record_key=$1`, [
          quarantineActionKey,
        ]),
        /DELETE\/TRUNCATE is refused/,
      );
      console.log('  ok    immutable quarantine refuses update and erasure');
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      assert.equal(
        (
          await admin.query<{ count: string }>(
            'SELECT count(*)::text count FROM pg_database WHERE datname=$1',
            [databaseName],
          )
        ).rows[0]?.count,
        '1',
      );
      await admin.query(`DROP DATABASE ${identifier(databaseName)} WITH (FORCE)`);
    }
    await admin.end();
  }
  console.log('\nADMIN WORK TRANSFORM FIXTURE: all proofs passed.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
