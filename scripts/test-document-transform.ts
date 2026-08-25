import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { reconcileDocuments } from './lib/document-reconciliation';
import { documentStructureFailures } from './lib/document-structure';
import { documentResultDigest, runDocumentTransform } from './transform-documents';
const FP = 'D'.repeat(64);
const key = (n: number) => `${n.toString(16).padStart(64, '0')}:000001`;
function ident(v: string) {
  assert.match(v, /^[a-z0-9_]+$/);
  return `"${v}"`;
}
function migrate(url: string) {
  const r = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.error) throw r.error;
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
}
async function clean(db: Client) {
  const r = await reconcileDocuments(db);
  assert.deepEqual(r.defects, [], r.defects.join('\n'));
}
async function fail(db: Client, label: string, mutate: () => Promise<unknown>, pattern: RegExp) {
  await db.query('BEGIN');
  try {
    await mutate();
    assert.match((await reconcileDocuments(db)).defects.join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}
async function main() {
  const project = process.env['DATABASE_URL'];
  assert.ok(project);
  const name = `document_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(project);
  adminUrl.pathname = '/postgres';
  const url = new URL(project);
  url.pathname = `/${name}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${ident(name)}`);
    created = true;
    migrate(url.toString());
    const db = new Client({ connectionString: url.toString() });
    await db.connect();
    try {
      const alias = (
        await db.query<{ alias_ar: string }>(
          `SELECT alias_ar FROM person_name_alias ORDER BY id LIMIT 1`,
        )
      ).rows[0]!.alias_ar;
      const matterKey = key(90);
      await db.query(
        `INSERT INTO matters(legacy_id,case_number_ar,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload,updated_at)VALUES(9001,'قضية/اختبار',$1,$2,'{}',CURRENT_TIMESTAMP)`,
        [matterKey, FP],
      );
      const safe = key(1),
        invalid = key(2);
      await db.query(
        `INSERT INTO staging."المستندات"(src_file,src_row_num,src_record_key,src_extraction_sha256,"مسلسل المستند ID","العميل","رقم الدعوى","بيان المستند","تاريخ المستند","عدد الأوراق","تاريخ الإيداع","المحامي/الموظف المسئول","ملاحظات","بطاقة الحركة","clientID")VALUES
  ('fixture/doc.csv',1,$1,$3,'101','عميل','قضية/اختبار','وصف عربي','2026-08-25 00:00:00',E'21 + CD\r\nنسخة','2026-08-26 00:00:00',$4,E'ملاحظة\r\nثانية','بطاقة',NULL),
  ('fixture/doc.csv',2,$2,$3,'102',NULL,NULL,'وصف','not-a-date','2',NULL,NULL,NULL,NULL,NULL)`,
        [safe, invalid, FP, alias],
      );
      const dry = await runDocumentTransform({ databaseUrl: url.toString() });
      assert.deepEqual(
        [
          dry.plan.sourceCount,
          dry.plan.targets.length,
          dry.plan.quarantine.length,
          dry.plan.evidence.length,
        ],
        [2, 1, 1, 1],
      );
      assert.equal((await db.query('SELECT count(*)FROM documents')).rows[0]!.count, '0');
      console.log('  ok    dry run partitions source without writes');
      const applied = await runDocumentTransform({ databaseUrl: url.toString(), apply: true });
      assert.ok(applied.digest);
      await clean(db);
      assert.deepEqual(await documentStructureFailures(db), []);
      console.log(
        '  ok    complete constraints, indexes, foreign keys, triggers and function are exact',
      );
      const p = (
        await db.query(
          `SELECT description,legacy_matter_ref_raw,legacy_page_count_raw,page_count,notes,movement_card,legacy_mfiles_id_raw,mfiles_id,legacy_source_payload->>'عدد الأوراق' payload_pages FROM documents WHERE legacy_source_record_key=$1`,
          [safe],
        )
      ).rows[0];
      assert.deepEqual(p, {
        description: 'وصف عربي',
        legacy_matter_ref_raw: 'قضية/اختبار',
        legacy_page_count_raw: '21 + CD\r\nنسخة',
        page_count: null,
        notes: 'ملاحظة\r\nثانية',
        movement_card: 'بطاقة',
        legacy_mfiles_id_raw: null,
        mfiles_id: null,
        payload_pages: '21 + CD\r\nنسخة',
      });
      console.log(
        '  ok    Arabic, CRLF, compound quantity and absent M-Files source survive exactly',
      );
      await fail(
        db,
        'changed scalar is detected',
        () =>
          db.query(`UPDATE documents SET description='بديل' WHERE legacy_source_record_key=$1`, [
            safe,
          ]),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'changed typed date is detected',
        () =>
          db.query(
            `UPDATE documents SET document_date='2026-08-24' WHERE legacy_source_record_key=$1`,
            [safe],
          ),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'changed fingerprint is detected',
        () =>
          db.query(
            `UPDATE documents SET legacy_source_extraction_sha256=$2 WHERE legacy_source_record_key=$1`,
            [safe, 'E'.repeat(64)],
          ),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'wrong matter link is detected',
        () =>
          db.query(`UPDATE documents SET matter_id=NULL WHERE legacy_source_record_key=$1`, [safe]),
        /target\/source mismatch/,
      );
      await fail(
        db,
        'altered evidence is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.document_evidence DISABLE TRIGGER document_evidence_no_change',
          );
          await db.query(
            `UPDATE quarantine.document_evidence SET reason_detail='{"changed":true}' WHERE src_record_key=$1`,
            [safe],
          );
        },
        /evidence mismatch/,
      );
      await fail(
        db,
        'missing target is detected',
        () => db.query(`DELETE FROM documents WHERE legacy_source_record_key=$1`, [safe]),
        /target\/source mismatch/,
      );
      await db.query(
        `INSERT INTO documents(description,updated_at)VALUES('application native',CURRENT_TIMESTAMP)`,
      );
      await clean(db);
      console.log('  ok    application-native row remains outside legacy reconciliation');
      const digest = await documentResultDigest(db);
      const snap = (
        await db.query(
          `SELECT jsonb_agg(to_jsonb(x)ORDER BY id)s FROM(SELECT id,created_at,updated_at FROM documents WHERE legacy_source_record_key IS NOT NULL)x`,
        )
      ).rows[0];
      const second = await runDocumentTransform({ databaseUrl: url.toString(), apply: true });
      assert.equal(second.digest, digest);
      assert.deepEqual(
        (
          await db.query(
            `SELECT jsonb_agg(to_jsonb(x)ORDER BY id)s FROM(SELECT id,created_at,updated_at FROM documents WHERE legacy_source_record_key IS NOT NULL)x`,
          )
        ).rows[0],
        snap,
      );
      console.log('  ok    identical rerun preserves IDs, timestamps and digest');
      const late = key(3);
      await db.query(
        `INSERT INTO staging."المستندات"(src_file,src_row_num,src_record_key,src_extraction_sha256,"مسلسل المستند ID")VALUES('fixture/late.csv',3,$1,$2,'103')`,
        [late, FP],
      );
      await assert.rejects(
        runDocumentTransform({ databaseUrl: url.toString(), apply: true, forceFailure: true }),
        /forced late/,
      );
      assert.equal(
        (await db.query(`SELECT count(*)FROM documents WHERE legacy_source_record_key=$1`, [late]))
          .rows[0]!.count,
        '0',
      );
      await db.query(`DELETE FROM staging."المستندات" WHERE src_record_key=$1`, [late]);
      await clean(db);
      console.log('  ok    forced late failure leaves zero partial rows');
      await assert.rejects(
        db.query(
          `UPDATE quarantine.document_evidence SET raw_value=raw_value WHERE src_record_key=$1`,
          [safe],
        ),
        /immutable migration evidence/,
      );
      console.log('  ok    immutable evidence refuses update');
      await db.query(
        'ALTER FUNCTION quarantine.refuse_document_evidence_change() SET search_path=quarantine',
      );
      assert.match((await documentStructureFailures(db)).join('\n'), /function definition/);
      await db.query('ALTER FUNCTION quarantine.refuse_document_evidence_change() RESET ALL');
      assert.deepEqual(await documentStructureFailures(db), []);
      console.log('  ok    function configuration drift is detected and restored');
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
  console.log('Task 2.9C document fixture passed. Disposable database removed.');
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
