import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { setMaintenanceAuditContext } from './lib/audit-maintenance-context';
import { reconcileFeeLetters } from './lib/fee-letter-reconciliation';
import { feeLetterStructureFailures } from './lib/fee-letter-structure';
import { feeResultDigest, runFeeLetterTransform } from './transform-fee-letters';
const FP = 'F'.repeat(64),
  REF = { contract: 1, mfiles: 0, both: 0, neither: 0, collisions: 0, collisionRefs: 0 };
const key = (n: number) => `${n.toString(16).padStart(64, '0')}:000001`;
function ident(v: string) {
  assert.match(v, /^[a-z0-9_]+$/);
  return `"${v}"`;
}
function migrate(url: string) {
  const r = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: url },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.error) throw r.error;
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
}
async function clean(db: Client) {
  const r = await reconcileFeeLetters(db, REF);
  assert.deepEqual(r.defects, [], r.defects.join('\n'));
}
async function fail(db: Client, label: string, mutate: () => Promise<unknown>, pattern: RegExp) {
  await db.query('BEGIN');
  try {
    await setMaintenanceAuditContext(db, 'test-fee-letter-reconciliation-negative');
    await mutate();
    assert.match((await reconcileFeeLetters(db, REF)).defects.join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}
async function main() {
  const project = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(project);
  const name = `fee_fixture_${process.pid}_${Date.now()}`;
  const au = new URL(project);
  au.pathname = '/postgres';
  const fu = new URL(project);
  fu.pathname = `/${name}`;
  const admin = new Client({ connectionString: au.toString() });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${ident(name)}`);
    created = true;
    migrate(fu.toString());
    const db = new Client({ connectionString: fu.toString() });
    await db.connect();
    try {
      await db.query('BEGIN');
      await setMaintenanceAuditContext(db, 'test-fee-letter-fixtures');
      await db.query(
        `INSERT INTO clients(legacy_id,name_ar,updated_at)VALUES(10,'عميل اختبار',CURRENT_TIMESTAMP)`,
      );
      const matterKey = key(90);
      await db.query(
        `INSERT INTO matters(legacy_id,case_number_ar,fee_letter_ref,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload,updated_at)VALUES(9001,'قضية/اختبار','100',$1,$2,'{}',CURRENT_TIMESTAMP)`,
        [matterKey, FP],
      );
      await db.query(
        `INSERT INTO staging."الدعاوى"(src_file,src_row_num,src_record_key,src_extraction_sha256,"matterID","matterAR","خطاب الأتعاب")VALUES('fixture/matters.csv',1,$1,$2,'9001','قضية/اختبار','100')`,
        [matterKey, FP],
      );
      const feeKey = key(1);
      await db.query(
        `INSERT INTO staging."خطابات الأتعاب"(src_file,src_row_num,src_record_key,src_extraction_sha256,"contractID","mfilesID","Cont-Type","Cont-Date","Cont-Details","Cont-Structure","Client","clientID","Status")VALUES('fixture/fees.csv',1,$1,$2,'100','20000','نوع','2026-08-25 00:00:00','تفاصيل','هيكل','عميل اختبار','10','ساري')`,
        [feeKey, FP],
      );
      const link = key(2),
        unresolved = key(3);
      await db.query(
        `INSERT INTO staging."خطابات الأتعاب__Matter"(src_file,src_row_num,parent_key,ordinal,value,src_record_key,src_extraction_sha256)VALUES('fixture/links.csv',1,'100','0','قضية/اختبار',$1,$3),('fixture/links.csv',2,'100','1','غير موجود',$2,$3)`,
        [link, unresolved, FP],
      );
      await db.query(
        `INSERT INTO quarantine.review_value (
           id, topic, value, occurrences, confidence, firm_answer, firm_note,
           answered_at, answered_by
         ) VALUES (
           1331,
           'open_question',
           'Does الدعاوى.[خطاب الأتعاب] point at contractID OR mfilesID, depending on the value?',
           1,
           'none',
           'depending on the value',
           'Both are contract IDs, but the access file were here before we operated mfiles, starting the usage of mfiles we used the file ID in mfiles that refere to the contract.',
           CURRENT_TIMESTAMP,
           'fixture'
         )`,
      );
      await db.query('COMMIT');
      const dry = await runFeeLetterTransform({
        databaseUrl: fu.toString(),
        expectedReferenceCounts: { contract: 1, mfiles: 0, both: 0, neither: 0 },
      });
      assert.deepEqual(
        [
          dry.plan.fees.length,
          dry.plan.forward.length,
          dry.plan.forwardQuarantine.length,
          dry.plan.reverse.length,
        ],
        [1, 1, 1, 1],
      );
      assert.equal((await db.query('SELECT count(*)FROM fee_letters')).rows[0]!.count, '0');
      console.log(
        '  ok    dry run partitions parents and both relationship directions without writes',
      );
      const applied = await runFeeLetterTransform({
        databaseUrl: fu.toString(),
        apply: true,
        expectedReferenceCounts: { contract: 1, mfiles: 0, both: 0, neither: 0 },
      });
      assert.ok(applied.digest);
      await clean(db);
      assert.deepEqual(await feeLetterStructureFailures(db), []);
      console.log(
        '  ok    complete constraints, indexes, foreign keys, triggers and function are exact',
      );
      const p = (
        await db.query(
          `SELECT contract_id,mfiles_id,legacy_mfiles_id_raw,client_name,contract_details,legacy_source_payload->>'mfilesID'payload_mfiles FROM fee_letters WHERE legacy_source_record_key=$1`,
          [feeKey],
        )
      ).rows[0];
      assert.deepEqual(p, {
        contract_id: 100,
        mfiles_id: '20000',
        legacy_mfiles_id_raw: '20000',
        client_name: 'عميل اختبار',
        contract_details: 'تفاصيل',
        payload_mfiles: '20000',
      });
      console.log('  ok    Arabic and both identifier texts survive exactly');
      await fail(
        db,
        'changed direct field is detected',
        () =>
          db.query(
            `UPDATE fee_letters SET contract_details='بديل'WHERE legacy_source_record_key=$1`,
            [feeKey],
          ),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'changed typed date is detected',
        () =>
          db.query(
            `UPDATE fee_letters SET contract_date='2026-08-24'WHERE legacy_source_record_key=$1`,
            [feeKey],
          ),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'changed fingerprint is detected',
        () =>
          db.query(
            `UPDATE fee_letters SET legacy_source_extraction_sha256=$2 WHERE legacy_source_record_key=$1`,
            [feeKey, 'A'.repeat(64)],
          ),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'changed raw identifier is detected',
        () =>
          db.query(
            `UPDATE fee_letters SET mfiles_id='20001',legacy_mfiles_id_raw='20001' WHERE legacy_source_record_key=$1`,
            [feeKey],
          ),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'missing target relationship is detected',
        () => db.query(`DELETE FROM fee_letter_matters WHERE legacy_source_record_key=$1`, [link]),
        /forward-link mismatch/,
      );
      await fail(
        db,
        'extra legacy target is detected',
        () =>
          db.query(
            `INSERT INTO fee_letters(
               contract_id,client_id,legacy_source_record_key,
               legacy_source_extraction_sha256,legacy_source_payload,updated_at
             ) VALUES(999,(SELECT id FROM clients WHERE legacy_id=10),$1,$2,'{}',CURRENT_TIMESTAMP)`,
            [key(6), FP],
          ),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'wrong forward matter link is detected',
        () =>
          db.query(
            `UPDATE fee_letter_matters SET matter_id=NULL WHERE legacy_source_record_key=$1`,
            [link],
          ),
        /forward-link mismatch/,
      );
      await fail(
        db,
        'wrong reverse identifier space is detected',
        () =>
          db.query(
            `UPDATE matter_fee_letter_references SET identifier_space='mfiles_id'WHERE legacy_source_record_key=$1`,
            [matterKey],
          ),
        /reverse fee-reference mismatch/,
      );
      await fail(
        db,
        'altered forward quarantine evidence is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.fee_letter_matter_transform DISABLE TRIGGER fee_letter_matter_transform_no_change',
          );
          await db.query(
            `UPDATE quarantine.fee_letter_matter_transform SET reason_details='[{"changed":true}]'WHERE src_record_key=$1`,
            [unresolved],
          );
        },
        /forward quarantine mismatch/,
      );
      await db.query('BEGIN');
      await setMaintenanceAuditContext(db, 'test-fee-letter-native-fixtures');
      const nativeFee = (
        await db.query<{ id: number }>(
          `INSERT INTO fee_letters(contract_details,updated_at)VALUES('application native',CURRENT_TIMESTAMP)RETURNING id`,
        )
      ).rows[0]!.id;
      const nativeMatter = (
        await db.query<{ id: number }>(
          `INSERT INTO matters(case_number_ar,updated_at)VALUES('application/native',CURRENT_TIMESTAMP)RETURNING id`,
        )
      ).rows[0]!.id;
      await db.query(
        `INSERT INTO fee_letter_matters(fee_letter_id,matter_id,updated_at)VALUES($1,$2,CURRENT_TIMESTAMP)`,
        [nativeFee, nativeMatter],
      );
      await db.query(
        `INSERT INTO matter_fee_letter_references(matter_id,fee_letter_id,updated_at)VALUES($1,$2,CURRENT_TIMESTAMP)`,
        [nativeMatter, nativeFee],
      );
      await db.query('COMMIT');
      await clean(db);
      console.log(
        '  ok    application-native parent and both link directions remain outside legacy reconciliation',
      );
      const digest = await feeResultDigest(db);
      const snap = (
        await db.query(
          `SELECT jsonb_agg(to_jsonb(x)ORDER BY kind,id)s FROM(SELECT'F'kind,id,created_at,updated_at FROM fee_letters WHERE legacy_source_record_key IS NOT NULL UNION ALL SELECT'L',id,created_at,updated_at FROM fee_letter_matters WHERE legacy_source_record_key IS NOT NULL UNION ALL SELECT'R',id,created_at,updated_at FROM matter_fee_letter_references)x`,
        )
      ).rows[0];
      const second = await runFeeLetterTransform({
        databaseUrl: fu.toString(),
        apply: true,
        expectedReferenceCounts: { contract: 1, mfiles: 0, both: 0, neither: 0 },
      });
      assert.equal(second.digest, digest);
      assert.deepEqual(
        (
          await db.query(
            `SELECT jsonb_agg(to_jsonb(x)ORDER BY kind,id)s FROM(SELECT'F'kind,id,created_at,updated_at FROM fee_letters WHERE legacy_source_record_key IS NOT NULL UNION ALL SELECT'L',id,created_at,updated_at FROM fee_letter_matters WHERE legacy_source_record_key IS NOT NULL UNION ALL SELECT'R',id,created_at,updated_at FROM matter_fee_letter_references)x`,
          )
        ).rows[0],
        snap,
      );
      console.log('  ok    identical rerun preserves IDs, timestamps and digest');
      const collision = key(4);
      await db.query(
        `INSERT INTO staging."خطابات الأتعاب"(src_file,src_row_num,src_record_key,src_extraction_sha256,"contractID","mfilesID","clientID")VALUES('fixture/collision.csv',2,$1,$2,'101','100','10')`,
        [collision, FP],
      );
      await assert.rejects(
        runFeeLetterTransform({
          databaseUrl: fu.toString(),
          expectedReferenceCounts: { contract: 1, mfiles: 0, both: 0, neither: 0 },
        }),
        /both identifier spaces/,
      );
      await db.query(`DELETE FROM staging."خطابات الأتعاب"WHERE src_record_key=$1`, [collision]);
      console.log('  ok    a matter reference matching both key spaces aborts loudly');
      const late = key(5);
      await db.query(
        `INSERT INTO staging."خطابات الأتعاب"(src_file,src_row_num,src_record_key,src_extraction_sha256,"contractID","clientID")VALUES('fixture/late.csv',3,$1,$2,'102','10')`,
        [late, FP],
      );
      await assert.rejects(
        runFeeLetterTransform({
          databaseUrl: fu.toString(),
          apply: true,
          forceFailure: true,
          expectedReferenceCounts: { contract: 1, mfiles: 0, both: 0, neither: 0 },
        }),
        /forced late/,
      );
      assert.equal(
        (
          await db.query(`SELECT count(*)FROM fee_letters WHERE legacy_source_record_key=$1`, [
            late,
          ])
        ).rows[0]!.count,
        '0',
      );
      await db.query(`DELETE FROM staging."خطابات الأتعاب"WHERE src_record_key=$1`, [late]);
      await clean(db);
      console.log('  ok    forced late failure leaves zero partial rows');
      await assert.rejects(
        db.query(`DELETE FROM quarantine.fee_letter_matter_transform WHERE src_record_key=$1`, [
          unresolved,
        ]),
        /DELETE\/TRUNCATE is refused/,
      );
      await db.query(
        'ALTER FUNCTION quarantine.refuse_fee_letter_evidence_change()SET search_path=quarantine',
      );
      assert.match((await feeLetterStructureFailures(db)).join('\n'), /function definition/);
      await db.query('ALTER FUNCTION quarantine.refuse_fee_letter_evidence_change()RESET ALL');
      assert.deepEqual(await feeLetterStructureFailures(db), []);
      console.log('  ok    immutable evidence and function configuration are enforced');
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      await admin.query('SELECT pg_terminate_backend(pid)FROM pg_stat_activity WHERE datname=$1', [
        name,
      ]);
      await admin.query(`DROP DATABASE ${ident(name)}`);
    }
    await admin.end();
  }
  console.log('Task 2.9D fee-letter fixture passed. Disposable database removed.');
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
