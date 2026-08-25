import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { reconcilePowersOfAttorney } from './lib/poa-reconciliation';
import { poaStructureFailures } from './lib/poa-structure';
import { poaResultDigest, runPoaTransform } from './transform-powers-of-attorney';

const FINGERPRINT = 'B'.repeat(64);
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
  assert.equal(result.status, 0, `fixture migrations failed:\n${result.stdout}\n${result.stderr}`);
}
async function clean(db: Client): Promise<void> {
  const result = await reconcilePowersOfAttorney(db, [1, 0, 0]);
  assert.deepEqual(result.defects, [], result.defects.join('\n'));
}
async function proveFailure(
  db: Client,
  label: string,
  mutate: () => Promise<unknown>,
  pattern: RegExp,
) {
  await db.query('BEGIN');
  try {
    await mutate();
    assert.match((await reconcilePowersOfAttorney(db, [1, 0, 0])).defects.join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}

async function main(): Promise<void> {
  const projectUrl = process.env['DATABASE_URL'];
  assert.ok(projectUrl, 'DATABASE_URL is required');
  const name = `poa_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrl);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrl);
  fixtureUrl.pathname = `/${name}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${identifier(name)}`);
    created = true;
    migrateFixture(fixtureUrl.toString());
    const db = new Client({ connectionString: fixtureUrl.toString() });
    await db.connect();
    try {
      const alias = (
        await db.query<{ alias_ar: string }>(
          `SELECT alias_ar FROM person_name_alias ORDER BY id LIMIT 1`,
        )
      ).rows[0]!.alias_ar;
      const rule = (
        await db.query<{ raw_value: string }>(
          `SELECT raw_value FROM migration_multi_person_rule WHERE poa_match_mode='substring' ORDER BY id LIMIT 1`,
        )
      ).rows[0]!.raw_value;
      const direct = sourceKey(1),
        partial = sourceKey(2),
        invalid = sourceKey(3);
      await db.query(
        `INSERT INTO staging."التوكيلات" (
        src_file,src_row_num,src_record_key,src_extraction_sha256,"العميل","مسلسل","اسم الموكل",
        "صفة الموكل بالتوكيل","رقم التوكيل","حرف","السنة","جهة الإصدار","تاريخ الإصدار",
        "المحامون الصادر لهم التوكيل","عدد النسخ","ملاحظات","الصفة","clientID","جرد") VALUES
        ('fixture/poa.csv',1,$1,$4,'عميل','A','موكل','صفة قديمة','1','أ','2026','توثيق',
         '2026-08-25 00:00:00',$5,'0',E'سطر أول\r\nسطر ثان','صفة',NULL,'true'),
        ('fixture/poa.csv',2,$2,$4,'عميل','B','موكل',NULL,'2','ب','2026','توثيق',NULL,
         'اسم غير مراجع، '||$6,NULL,'ملاحظة عربية','صفة',NULL,'false'),
        ('fixture/poa.csv',3,$3,$4,NULL,NULL,'موكل',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'perhaps')`,
        [direct, partial, invalid, FINGERPRINT, alias, rule],
      );

      const dry = await runPoaTransform({ databaseUrl: fixtureUrl.toString() });
      assert.deepEqual(
        [
          dry.plan.sourceCount,
          dry.plan.targets.length,
          dry.plan.transformQuarantine.length,
          dry.plan.lawyers.length,
        ],
        [3, 2, 1, 7],
      );
      assert.equal((await db.query('SELECT count(*) FROM powers_of_attorney')).rows[0]!.count, '0');
      console.log('  ok    dry run partitions source without writes');

      const applied = await runPoaTransform({ databaseUrl: fixtureUrl.toString(), apply: true });
      assert.ok(applied.digest);
      await clean(db);
      assert.deepEqual(await poaStructureFailures(db), []);
      console.log(
        '  ok    complete constraints, indexes, foreign keys, triggers and functions are exact',
      );

      const wholeValueRule = (
        await db.query<{
          id: number;
          raw_value: string;
          person_id: number;
          ordinal: number;
        }>(`
          SELECT r.id,r.raw_value,m.person_id,m.ordinal
            FROM migration_multi_person_rule r
            JOIN migration_multi_person_rule_member m ON m.rule_id=r.id
           WHERE r.poa_match_mode IS NULL
           ORDER BY r.id,m.ordinal LIMIT 1`)
      ).rows[0]!;
      await db.query('BEGIN');
      try {
        const embeddedRaw = `قبل ${wholeValueRule.raw_value} بعد`;
        const parent = (
          await db.query<{ id: number }>(
            `INSERT INTO powers_of_attorney(
              legacy_lawyers_raw,legacy_source_record_key,
              legacy_source_extraction_sha256,legacy_source_payload,updated_at
            ) VALUES($1,$2,$3,'{}',CURRENT_TIMESTAMP) RETURNING id`,
            [embeddedRaw, sourceKey(50), FINGERPRINT],
          )
        ).rows[0]!.id;
        await assert.rejects(
          db.query(
            `INSERT INTO power_of_attorney_lawyers(
              power_of_attorney_id,person_id,legacy_source_record_key,
              legacy_source_extraction_sha256,legacy_lawyers_raw,reviewed_rule_id,
              source_member_ordinal,updated_at
            ) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
            [
              parent,
              wholeValueRule.person_id,
              sourceKey(50),
              FINGERPRINT,
              embeddedRaw,
              wholeValueRule.id,
              wholeValueRule.ordinal,
            ],
          ),
          /does not match the reviewed rule member/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      console.log('  ok    a normal whole-value rule cannot match inside longer text');

      await db.query('BEGIN');
      try {
        await db.query(
          'ALTER TABLE migration_multi_person_rule DROP CONSTRAINT migration_multi_person_rule_poa_match_mode_check',
        );
        await db.query(
          `UPDATE migration_multi_person_rule SET poa_match_mode='unsupported' WHERE id=$1`,
          [wholeValueRule.id],
        );
        const parent = (
          await db.query<{ id: number }>(
            `INSERT INTO powers_of_attorney(
              legacy_lawyers_raw,legacy_source_record_key,
              legacy_source_extraction_sha256,legacy_source_payload,updated_at
            ) VALUES($1,$2,$3,'{}',CURRENT_TIMESTAMP) RETURNING id`,
            [wholeValueRule.raw_value, sourceKey(51), FINGERPRINT],
          )
        ).rows[0]!.id;
        await assert.rejects(
          db.query(
            `INSERT INTO power_of_attorney_lawyers(
              power_of_attorney_id,person_id,legacy_source_record_key,
              legacy_source_extraction_sha256,legacy_lawyers_raw,reviewed_rule_id,
              source_member_ordinal,updated_at
            ) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
            [
              parent,
              wholeValueRule.person_id,
              sourceKey(51),
              FINGERPRINT,
              wholeValueRule.raw_value,
              wholeValueRule.id,
              wholeValueRule.ordinal,
            ],
          ),
          /does not match the reviewed rule member/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      assert.deepEqual(await poaStructureFailures(db), []);
      console.log('  ok    an unsupported match mode is refused even if its CHECK is weakened');

      const substringRules = await db.query<{
        id: number;
        raw_value: string;
        members: { person_id: number; ordinal: number }[];
      }>(`
        SELECT r.id,r.raw_value,
          jsonb_agg(jsonb_build_object('person_id',m.person_id,'ordinal',m.ordinal)
                    ORDER BY m.ordinal) members
          FROM migration_multi_person_rule r
          JOIN migration_multi_person_rule_member m ON m.rule_id=r.id
         WHERE r.poa_match_mode='substring'
         GROUP BY r.id,r.raw_value ORDER BY r.id`);
      assert.equal(substringRules.rows.length, 3);
      await db.query('BEGIN');
      try {
        for (const [index, approvedRule] of substringRules.rows.entries()) {
          const embeddedRaw = `قبل ${approvedRule.raw_value} بعد`;
          const fixtureKey = sourceKey(60 + index);
          const parent = (
            await db.query<{ id: number }>(
              `INSERT INTO powers_of_attorney(
                legacy_lawyers_raw,legacy_source_record_key,
                legacy_source_extraction_sha256,legacy_source_payload,updated_at
              ) VALUES($1,$2,$3,'{}',CURRENT_TIMESTAMP) RETURNING id`,
              [embeddedRaw, fixtureKey, FINGERPRINT],
            )
          ).rows[0]!.id;
          for (const member of approvedRule.members) {
            await db.query(
              `INSERT INTO power_of_attorney_lawyers(
                power_of_attorney_id,person_id,legacy_source_record_key,
                legacy_source_extraction_sha256,legacy_lawyers_raw,reviewed_rule_id,
                source_member_ordinal,updated_at
              ) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
              [
                parent,
                member.person_id,
                fixtureKey,
                FINGERPRINT,
                embeddedRaw,
                approvedRule.id,
                member.ordinal,
              ],
            );
          }
        }
      } finally {
        await db.query('ROLLBACK');
      }
      assert.deepEqual(await poaStructureFailures(db), []);
      console.log('  ok    all three approved substring rules still accept embedded source text');
      const preserved = await db.query(
        `SELECT client_name,legacy_lawyers_raw,notes,show_on_poa_report,
        legacy_source_payload->>'ملاحظات' payload_notes FROM powers_of_attorney WHERE legacy_source_record_key=$1`,
        [direct],
      );
      assert.deepEqual(preserved.rows[0], {
        client_name: 'عميل',
        legacy_lawyers_raw: alias,
        notes: 'سطر أول\r\nسطر ثان',
        show_on_poa_report: true,
        payload_notes: 'سطر أول\r\nسطر ثان',
      });
      assert.equal(
        (
          await db.query(
            `SELECT count(*) FROM power_of_attorney_lawyers WHERE legacy_source_record_key=$1`,
            [partial],
          )
        ).rows[0]!.count,
        '6',
      );
      assert.equal(
        (
          await db.query(
            `SELECT reason_details->0->>'unreviewed_remainder' remainder FROM quarantine.power_of_attorney_relationship WHERE src_record_key=$1 AND relationship_kind='lawyers'`,
            [partial],
          )
        ).rows[0]!.remainder,
        'اسم غير مراجع، ',
      );
      console.log(
        '  ok    Arabic, CRLF, complete source cell and ordered reviewed members survive',
      );

      await proveFailure(
        db,
        'changed scalar/raw source is detected',
        () =>
          db.query(`UPDATE powers_of_attorney SET notes='بديل' WHERE legacy_source_record_key=$1`, [
            direct,
          ]),
        /target\/source mismatch/,
      );
      await proveFailure(
        db,
        'changed typed value is detected',
        () =>
          db.query(
            `UPDATE powers_of_attorney SET copies_count=1 WHERE legacy_source_record_key=$1`,
            [direct],
          ),
        /target\/source mismatch/,
      );
      await proveFailure(
        db,
        'changed fingerprint is detected',
        () =>
          db.query(
            `UPDATE powers_of_attorney SET legacy_source_extraction_sha256=$2 WHERE legacy_source_record_key=$1`,
            [direct, 'C'.repeat(64)],
          ),
        /target\/source mismatch/,
      );
      await proveFailure(
        db,
        'missing target row is detected',
        async () => {
          await db.query(
            `DELETE FROM power_of_attorney_lawyers WHERE legacy_source_record_key=$1`,
            [direct],
          );
          await db.query(`DELETE FROM powers_of_attorney WHERE legacy_source_record_key=$1`, [
            direct,
          ]);
        },
        /target\/source mismatch/,
      );
      await proveFailure(
        db,
        'wrong lawyer mapping is detected',
        async () => {
          await db.query(
            'ALTER TABLE power_of_attorney_lawyers DISABLE TRIGGER power_of_attorney_lawyers_provenance',
          );
          await db.query(
            `UPDATE power_of_attorney_lawyers SET source_member_ordinal=99 WHERE id=(SELECT min(id) FROM power_of_attorney_lawyers WHERE legacy_source_record_key=$1)`,
            [partial],
          );
        },
        /reviewed lawyer mismatch/,
      );
      await proveFailure(
        db,
        'altered relationship evidence is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.power_of_attorney_relationship DISABLE TRIGGER power_of_attorney_relationship_no_change',
          );
          await db.query(
            `UPDATE quarantine.power_of_attorney_relationship SET reason_details='[{"changed":true}]'::jsonb WHERE src_record_key=$1 AND relationship_kind='lawyers'`,
            [partial],
          );
        },
        /relationship evidence mismatch/,
      );

      await db.query(
        `INSERT INTO powers_of_attorney (client_name,updated_at) VALUES ('application native',CURRENT_TIMESTAMP)`,
      );
      await clean(db);
      console.log('  ok    application-native rows remain outside legacy reconciliation');

      const digest = await poaResultDigest(db);
      const snapshot =
        await db.query(`SELECT jsonb_agg(to_jsonb(x) ORDER BY kind,id) snapshot FROM (
        SELECT 'P' kind,id,created_at,updated_at FROM powers_of_attorney WHERE legacy_source_record_key IS NOT NULL
        UNION ALL SELECT 'L',id,created_at,updated_at FROM power_of_attorney_lawyers WHERE legacy_source_record_key IS NOT NULL) x`);
      const second = await runPoaTransform({ databaseUrl: fixtureUrl.toString(), apply: true });
      assert.equal(second.digest, digest);
      assert.deepEqual(
        (
          await db.query(`SELECT jsonb_agg(to_jsonb(x) ORDER BY kind,id) snapshot FROM (
        SELECT 'P' kind,id,created_at,updated_at FROM powers_of_attorney WHERE legacy_source_record_key IS NOT NULL
        UNION ALL SELECT 'L',id,created_at,updated_at FROM power_of_attorney_lawyers WHERE legacy_source_record_key IS NOT NULL) x`)
        ).rows[0],
        snapshot.rows[0],
      );
      console.log('  ok    identical rerun preserves IDs, timestamps and digest');

      const late = sourceKey(4);
      await db.query(
        `INSERT INTO staging."التوكيلات" (src_file,src_row_num,src_record_key,src_extraction_sha256,"اسم الموكل","المحامون الصادر لهم التوكيل","جرد") VALUES ('fixture/late.csv',4,$1,$2,'موكل',$3,'true')`,
        [late, FINGERPRINT, alias],
      );
      await assert.rejects(
        runPoaTransform({ databaseUrl: fixtureUrl.toString(), apply: true, forceFailure: true }),
        /forced late/,
      );
      assert.equal(
        (
          await db.query(
            `SELECT count(*) FROM powers_of_attorney WHERE legacy_source_record_key=$1`,
            [late],
          )
        ).rows[0]!.count,
        '0',
      );
      assert.equal(
        (
          await db.query(
            `SELECT count(*) FROM quarantine.power_of_attorney_relationship WHERE src_record_key=$1`,
            [late],
          )
        ).rows[0]!.count,
        '0',
      );
      await db.query(`DELETE FROM staging."التوكيلات" WHERE src_record_key=$1`, [late]);
      await clean(db);
      console.log('  ok    forced late failure leaves zero partial rows');

      await assert.rejects(
        db.query(
          `UPDATE quarantine.power_of_attorney_relationship SET raw_value=raw_value WHERE src_record_key=$1`,
          [partial],
        ),
        /immutable migration evidence/,
      );
      await assert.rejects(
        db.query(`DELETE FROM quarantine.power_of_attorney_relationship WHERE src_record_key=$1`, [
          partial,
        ]),
        /DELETE\/TRUNCATE is refused/,
      );
      console.log('  ok    immutable evidence refuses update and delete');

      await db.query(
        'ALTER FUNCTION public.enforce_poa_lawyer_provenance() SET search_path=public',
      );
      assert.match((await poaStructureFailures(db)).join('\n'), /function definition/);
      await db.query('ALTER FUNCTION public.enforce_poa_lawyer_provenance() RESET ALL');
      assert.deepEqual(await poaStructureFailures(db), []);
      console.log('  ok    per-function configuration drift is detected and restored');
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [
        name,
      ]);
      await admin.query(`DROP DATABASE ${identifier(name)}`);
    }
    await admin.end();
  }
  console.log('Task 2.9B POA fixture passed. Disposable database removed.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
