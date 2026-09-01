import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import {
  matterRelationshipResultDigest,
  reconcileMatterRelationships,
} from './lib/matter-relationship-reconciliation';
import { correctedMultiPersonRules } from './lib/matter-relationship-rules';
import { matterRelationshipStructureFailures } from './lib/matter-relationship-structure';
import { runMatterRelationshipTransform } from './transform-matter-relationships';

const FINGERPRINT = 'A'.repeat(64);

function quoteIdentifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/);
  return `"${value}"`;
}

function migrateFixture(databaseUrl: string) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
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

async function insertSourceMatter(
  db: Client,
  sequence: number,
  values: {
    lawyerA?: string;
    lawyerB?: string;
    clientCap?: string;
    opponentCap?: string;
  },
) {
  const sourceKey = `${sequence.toString(16).padStart(64, '0')}:000001`;
  await db.query(
    `INSERT INTO staging."الدعاوى" (
       src_file, src_row_num, src_record_key, src_extraction_sha256,
       "matterID", "lawyerA", "lawyerB", "client&Cap", "opponent&Cap"
     ) VALUES ('fixture/matters.csv', $1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      sequence,
      sourceKey,
      FINGERPRINT,
      String(9000 + sequence),
      values.lawyerA ?? null,
      values.lawyerB ?? null,
      values.clientCap ?? null,
      values.opponentCap ?? null,
    ],
  );
  await db.query(
    `INSERT INTO matters (
       legacy_id, legacy_source_record_key, legacy_source_extraction_sha256,
       legacy_source_payload, updated_at
     )
     SELECT "matterID"::integer, src_record_key, src_extraction_sha256,
            to_jsonb(s) - ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'],
            CURRENT_TIMESTAMP
       FROM staging."الدعاوى" s WHERE src_record_key = $1`,
    [sourceKey],
  );
  return sourceKey;
}

async function insertParentQuarantinedMatter(db: Client, sequence: number, lawyerA: string) {
  const sourceKey = `${sequence.toString(16).padStart(64, '0')}:000001`;
  await db.query(
    `INSERT INTO staging."الدعاوى" (
       src_file, src_row_num, src_record_key, src_extraction_sha256,
       "matterID", "lawyerA"
     ) VALUES ('fixture/parent-quarantine.csv', $1, $2, $3, $4, $5)`,
    [sequence, sourceKey, FINGERPRINT, String(9000 + sequence), lawyerA],
  );
  await db.query(
    `INSERT INTO quarantine.matter_transform (
       src_record_key, extraction_sha256, src_file, src_row_num,
       legacy_matter_id, reason_codes, reason_details, source_payload
     )
     SELECT src_record_key, src_extraction_sha256, src_file, src_row_num,
            "matterID", ARRAY['fixture_parent_quarantine'],
            jsonb_build_array(jsonb_build_object('fixture', true)),
            to_jsonb(s) - ARRAY[
              'src_file','src_row_num','src_record_key','src_extraction_sha256'
            ]
       FROM staging."الدعاوى" s
      WHERE src_record_key = $1`,
    [sourceKey],
  );
  return sourceKey;
}

async function assertClean(db: Client) {
  const result = await reconcileMatterRelationships(db);
  assert.deepEqual(result.defects, [], 'fixture must return to a clean reconciled state');
}

async function assertStructureClean(db: Client) {
  assert.deepEqual(
    await matterRelationshipStructureFailures(db),
    [],
    'fixture catalog safeguards must return to their exact definitions',
  );
}

async function proveFailure(
  db: Client,
  label: string,
  mutate: () => Promise<unknown>,
  expected: RegExp,
) {
  await db.query('BEGIN');
  try {
    await mutate();
    const result = await reconcileMatterRelationships(db);
    assert.match(result.defects.join('\n'), expected, `${label}: permanent check did not fail`);
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
) {
  await db.query('BEGIN');
  try {
    await mutate();
    assert.match(
      (await matterRelationshipStructureFailures(db)).join('\n'),
      expected,
      `${label}: exact catalog check did not fail`,
    );
  } finally {
    await db.query('ROLLBACK');
  }
  await assertStructureClean(db);
  console.log(`  ok    ${label}`);
}

async function main() {
  const projectUrlText = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(projectUrlText, 'MIGRATION_DATABASE_URL is required for the fixture');
  const databaseName = `matter_relationship_fixture_${process.pid}_${Date.now()}`;
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
    assert.equal(existing.rows[0]?.count, '0');
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    created = true;
    migrateFixture(fixtureUrl.toString());

    const db = new Client({ connectionString: fixtureUrl.toString() });
    await db.connect();
    try {
      const aliases = await db.query<{ alias_ar: string }>(
        'SELECT alias_ar FROM person_name_alias ORDER BY id LIMIT 2',
      );
      assert.equal(aliases.rows.length, 2);
      const firstAlias = aliases.rows[0]!.alias_ar;
      const secondAlias = aliases.rows[1]!.alias_ar;
      const corrected = correctedMultiPersonRules[0];

      const directKey = await insertSourceMatter(db, 1, {
        lawyerA: firstAlias,
        lawyerB: secondAlias,
        clientCap: 'شركة الاختبار\n"مدعي، مستأنف"',
        opponentCap: 'خصم أول\r\n"مدعى عليه"\r\n\r\nخصم ثان',
      });
      const correctedKey = await insertSourceMatter(db, 2, {
        lawyerA: corrected.rawValue,
      });
      await insertSourceMatter(db, 3, { lawyerA: 'تركيب غير مراجع' });
      await insertSourceMatter(db, 4, { lawyerA: 'الدكتور' });
      await insertSourceMatter(db, 5, {
        clientCap: 'طرف اختبار\n"صفة قانونية غير مراجعة"',
      });
      const parentQuarantinedKey = await insertParentQuarantinedMatter(db, 6, firstAlias);

      const dryRun = await runMatterRelationshipTransform({
        databaseUrl: fixtureUrl.toString(),
        dryRun: true,
      });
      assert.equal(dryRun.plan.sourceCellCount, 8);
      assert.deepEqual(dryRun.plan.ruleFailures, []);
      console.log('  ok    dry run accounts for all source cells without writing');

      await assert.rejects(
        runMatterRelationshipTransform({
          databaseUrl: fixtureUrl.toString(),
          forceFailure: true,
        }),
        /fixture forced late matter-relationship failure/,
      );
      const rolledBack = await db.query<{ total: string }>(`
        SELECT ((SELECT count(*) FROM matter_lawyers)
              + (SELECT count(*) FROM matter_parties)
              + (SELECT count(*) FROM matter_party_roles)
              + (SELECT count(*) FROM quarantine.matter_relationship_transform))::text AS total`);
      assert.equal(rolledBack.rows[0]!.total, '0');
      console.log('  ok    a late failure rolls back relationships, roles and evidence');

      const first = await runMatterRelationshipTransform({ databaseUrl: fixtureUrl.toString() });
      assert.deepEqual(first.defects, []);
      await assertClean(db);
      assert.deepEqual(
        {
          sourceMatters: first.reconciliation?.sourceMatters,
          transformedMatters: first.reconciliation?.transformedMatters,
          parentQuarantinedMatters: first.reconciliation?.parentQuarantinedMatters,
          allSourceCells: first.reconciliation?.allSourceCells,
          transformedParentCells: first.reconciliation?.transformedParentCells,
          parentQuarantinedCells: first.reconciliation?.parentQuarantinedCells,
        },
        {
          sourceMatters: 6,
          transformedMatters: 5,
          parentQuarantinedMatters: 1,
          allSourceCells: 9,
          transformedParentCells: 8,
          parentQuarantinedCells: 1,
        },
      );
      console.log(
        '  ok    all source cells partition between transformed and parent-quarantined matters',
      );
      const fixtureCounts = await db.query<{
        lawyers: string;
        parties: string;
        roles: string;
        unreviewed_person: string;
        reviewed_exclusion: string;
        unreviewed_role: string;
        corrected_members: string;
      }>(
        `
        SELECT
          (SELECT count(*)::text FROM matter_lawyers) lawyers,
          (SELECT count(*)::text FROM matter_parties) parties,
          (SELECT count(*)::text FROM matter_party_roles) roles,
          (SELECT count(*)::text FROM quarantine.matter_relationship_transform
            WHERE reason_codes=ARRAY['unreviewed_person_value']) unreviewed_person,
          (SELECT count(*)::text FROM quarantine.matter_relationship_transform
            WHERE reason_codes=ARRAY['reviewed_exclusion']) reviewed_exclusion,
          (SELECT count(*)::text FROM quarantine.matter_relationship_transform
            WHERE reason_codes=ARRAY['unreviewed_party_role']) unreviewed_role,
          (SELECT count(*)::text FROM matter_lawyers
            WHERE reviewed_rule_id=(SELECT id FROM migration_multi_person_rule WHERE raw_value=$1)) corrected_members`,
        [corrected.rawValue],
      );
      assert.deepEqual(fixtureCounts.rows[0], {
        lawyers: '8',
        parties: '3',
        roles: '3',
        unreviewed_person: '1',
        reviewed_exclusion: '1',
        unreviewed_role: '1',
        corrected_members: '6',
      });
      console.log(
        '  ok    corrected rules split in order; unreviewed combinations/roles quarantine and reviewed exclusions alone exclude',
      );
      const digest = await matterRelationshipResultDigest(db);
      const second = await runMatterRelationshipTransform({ databaseUrl: fixtureUrl.toString() });
      assert.equal(second.digest, digest);
      console.log('  ok    identical rerun preserves ids, timestamps and all values');

      await db.query('BEGIN');
      try {
        const nativePerson = await db.query<{ id: number }>(`
          INSERT INTO people (name_ar, is_staff, is_active, updated_at)
          VALUES ('شخص تطبيق أصلي', false, true, CURRENT_TIMESTAMP)
          RETURNING id`);
        const nativeMatter = await db.query<{ id: number }>(
          'SELECT id FROM matters WHERE legacy_source_record_key = $1',
          [directKey],
        );
        await db.query(
          `INSERT INTO matter_lawyers (
             matter_id, person_id, role, position, updated_at
           ) VALUES ($1, $2, 'support', 900, CURRENT_TIMESTAMP)`,
          [nativeMatter.rows[0]!.id, nativePerson.rows[0]!.id],
        );
        const nativeParty = await db.query<{ id: number }>(
          `INSERT INTO matter_parties (
             matter_id, side, party_name, ordinal, updated_at
           ) VALUES ($1, 'client', 'طرف أضيف داخل التطبيق', 900, CURRENT_TIMESTAMP)
           RETURNING id`,
          [nativeMatter.rows[0]!.id],
        );
        await db.query(
          `INSERT INTO matter_party_roles (
             party_id, role_id, ordinal, updated_at
           ) SELECT $1, id, 1, CURRENT_TIMESTAMP
               FROM lookup_party_role ORDER BY id LIMIT 1`,
          [nativeParty.rows[0]!.id],
        );
        await assertClean(db);
        assert.equal(
          await matterRelationshipResultDigest(db),
          digest,
          'application-native rows must not redefine the legacy migration digest',
        );

        await db.query('SAVEPOINT legacy_mutation');
        await db.query(`
          UPDATE matter_lawyers
             SET position = position + 100
           WHERE id = (
             SELECT min(id) FROM matter_lawyers
              WHERE legacy_source_record_key IS NOT NULL
           )`);
        assert.match(
          (await reconcileMatterRelationships(db)).defects.join('\n'),
          /matter lawyers missing or changed|matter lawyers extra or changed/,
        );
        await db.query('ROLLBACK TO SAVEPOINT legacy_mutation');
        await assertClean(db);
      } finally {
        await db.query('ROLLBACK');
      }
      await assertClean(db);
      assert.equal(await matterRelationshipResultDigest(db), digest);
      console.log(
        '  ok    application-native lawyer/party/role rows are ignored while a changed legacy row still fails',
      );

      const rawProof = await db.query<{ lawyer_raw: boolean; party_raw: boolean; arabic: boolean }>(
        `
        SELECT
          (SELECT bool_and(legacy_source IN ($1, $2)) FROM matter_lawyers
            WHERE legacy_source_record_key = $3) AS lawyer_raw,
          (SELECT bool_and(legacy_raw IN ('شركة الاختبار' || E'\n' || '"مدعي، مستأنف"',
                                         'خصم أول' || E'\r\n' || '"مدعى عليه"' || E'\r\n\r\n' || 'خصم ثان'))
             FROM matter_parties WHERE legacy_source_record_key = $3) AS party_raw,
          (SELECT bool_and(party_name ~ '[ء-ي]') FROM matter_parties
             WHERE legacy_source_record_key = $3) AS arabic`,
        [firstAlias, secondAlias, directKey],
      );
      assert.deepEqual(rawProof.rows[0], { lawyer_raw: true, party_raw: true, arabic: true });
      console.log(
        '  ok    complete source text, CR/LF differences and Arabic survive byte-for-byte',
      );

      await proveFailure(
        db,
        'an empty reviewed rule fails permanently',
        () =>
          db.query(
            `DELETE FROM migration_multi_person_rule_member
              WHERE rule_id = (SELECT id FROM migration_multi_person_rule ORDER BY id LIMIT 1)`,
          ),
        /database multi-person rules differ|empty database rule/,
      );
      await proveFailure(
        db,
        'an unresolved member alias fails permanently',
        () =>
          db.query(
            `UPDATE migration_multi_person_rule_member SET person_name = 'اسم غير موجود'
              WHERE id = (SELECT id FROM migration_multi_person_rule_member ORDER BY id LIMIT 1)`,
          ),
        /alias does not resolve|canonical reviewed SQL/,
      );
      await proveFailure(
        db,
        'an ambiguous alias fails permanently',
        async () => {
          await db.query('DROP INDEX person_name_alias_alias_ar_key');
          const person = await db.query<{ id: number }>(`
            INSERT INTO people (name_ar, is_staff, is_active, updated_at)
            VALUES ('شخص اختبار ثان', false, true, CURRENT_TIMESTAMP) RETURNING id`);
          await db.query(`INSERT INTO person_name_alias (person_id, alias_ar) VALUES ($1, $2)`, [
            person.rows[0]!.id,
            firstAlias,
          ]);
        },
        /ambiguous_person_alias|alias does not resolve|matter lawyers/,
      );
      await proveFailure(
        db,
        'a missing or non-starting ordinal fails permanently',
        () =>
          db.query(
            `UPDATE migration_multi_person_rule_member SET ordinal = 99
              WHERE id = (SELECT id FROM migration_multi_person_rule_member ORDER BY id LIMIT 1)`,
          ),
        /ordinal gap|canonical reviewed SQL/,
      );
      await db.query('BEGIN');
      try {
        await assert.rejects(
          db.query(`
            UPDATE migration_multi_person_rule_member SET ordinal = 1
             WHERE id = (
               SELECT id FROM migration_multi_person_rule_member
                WHERE rule_id = (SELECT min(rule_id) FROM migration_multi_person_rule_member)
                  AND ordinal = 2)`),
          /migration_multi_person_rule_member_rule_ordinal_key/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await assertClean(db);
      console.log('  ok    a duplicate ordinal is refused by the unique constraint');

      await proveFailure(
        db,
        'a duplicate person inside one rule fails permanently',
        async () => {
          await db.query(
            'ALTER TABLE migration_multi_person_rule_member DROP CONSTRAINT migration_multi_person_rule_member_rule_person_key',
          );
          await db.query(`
            UPDATE migration_multi_person_rule_member second
               SET person_id = first.person_id, person_name = first.person_name
              FROM migration_multi_person_rule_member first
             WHERE second.rule_id = first.rule_id
               AND first.ordinal = 1 AND second.ordinal = 2
               AND second.rule_id = (SELECT min(rule_id) FROM migration_multi_person_rule_member)`);
        },
        /duplicate person|canonical reviewed SQL/,
      );
      await proveFailure(
        db,
        'wrong corrected membership/order fails permanently',
        () =>
          db.query(
            `UPDATE migration_multi_person_rule_member SET ordinal = 77
              WHERE rule_id = (SELECT id FROM migration_multi_person_rule WHERE raw_value = $1)
                AND ordinal = 1`,
            [corrected.rawValue],
          ),
        /ordinal gap|canonical reviewed SQL/,
      );
      await proveFailure(
        db,
        'the old malformed eight-name pseudo-member fails permanently',
        () =>
          db.query(
            `UPDATE migration_multi_person_rule_member SET person_name = $1
              WHERE rule_id = (SELECT id FROM migration_multi_person_rule WHERE raw_value = $2)
                AND ordinal = 1`,
            [
              'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز عبدالحافظ - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا',
              correctedMultiPersonRules[2].rawValue,
            ],
          ),
        /canonical reviewed SQL|alias does not resolve/,
      );
      await proveFailure(
        db,
        'the approved zero-occurrence Rule 2 cannot disappear',
        async () => {
          const rawValue = correctedMultiPersonRules[1].rawValue;
          await db.query(
            `DELETE FROM migration_multi_person_rule_member
              WHERE rule_id = (SELECT id FROM migration_multi_person_rule WHERE raw_value = $1)`,
            [rawValue],
          );
          await db.query('DELETE FROM migration_multi_person_rule WHERE raw_value = $1', [
            rawValue,
          ]);
        },
        /database multi-person rules differ|corrected database rule missing/,
      );
      await proveFailure(
        db,
        'wrong party fragmentation fails the independent SQL checker',
        () =>
          db.query(
            `UPDATE matter_parties
                SET party_name = 'خصم أول / خصم ثان'
              WHERE legacy_source_record_key = $1
                AND source_field = 'opponent&Cap'
                AND source_fragment_ordinal = 1`,
            [directKey],
          ),
        /matter parties missing or changed|matter parties extra or changed/,
      );
      await proveFailure(
        db,
        'a role attached to the wrong party fails the independent SQL checker',
        () =>
          db.query(
            `UPDATE matter_party_roles role
                SET party_id = (
                  SELECT id FROM matter_parties
                   WHERE legacy_source_record_key = $1
                     AND source_field = 'opponent&Cap'
                     AND source_fragment_ordinal = 2
                )
              WHERE role.id = (
                SELECT min(r.id)
                  FROM matter_party_roles r
                  JOIN matter_parties p ON p.id = r.party_id
                 WHERE p.legacy_source_record_key = $1
                   AND p.source_field = 'client&Cap'
              )`,
            [directKey],
          ),
        /matter party roles missing or changed|matter party roles extra or changed/,
      );
      await proveFailure(
        db,
        'a wrong lawyer source field fails the independent SQL checker',
        () =>
          db.query(
            `UPDATE matter_lawyers
                SET source_field = 'lawyerB'
              WHERE legacy_source_record_key = $1
                AND source_member_ordinal = 1`,
            [correctedKey],
          ),
        /matter lawyers missing or changed|matter lawyers extra or changed/,
      );
      await proveFailure(
        db,
        'a wrong reviewed rule member ordinal fails the independent SQL checker',
        () =>
          db.query(
            `UPDATE matter_lawyers
                SET source_member_ordinal = 99
              WHERE legacy_source_record_key = $1
                AND source_member_ordinal = 1`,
            [correctedKey],
          ),
        /matter lawyers missing or changed|matter lawyers extra or changed/,
      );
      await proveFailure(
        db,
        'a target row and quarantine row for one source cell fail exclusivity',
        () =>
          db.query(
            `INSERT INTO quarantine.matter_relationship_transform (
               relationship_kind, source_field, side, src_record_key,
               extraction_sha256, src_file, src_row_num, legacy_matter_id,
               raw_value, outcome, reason_codes, reason_details, source_payload
             )
             SELECT 'lawyer', 'lawyerA', NULL, src_record_key,
                    src_extraction_sha256, src_file, src_row_num, "matterID",
                    "lawyerA", 'quarantined', ARRAY['unreviewed_person_value'],
                    jsonb_build_array(jsonb_build_object(
                      'alias_matches', 0,
                      'rule_matches', 0,
                      'exclusion_matches', 0
                    )),
                    to_jsonb(s) - ARRAY[
                      'src_file','src_row_num','src_record_key','src_extraction_sha256'
                    ]
               FROM staging."الدعاوى" s
              WHERE src_record_key = $1`,
            [directKey],
          ),
        /source cells with both target and evidence|relationship evidence extra or changed/,
      );
      await proveFailure(
        db,
        'a source cell with neither target nor evidence fails exclusivity',
        () =>
          db.query(
            `DELETE FROM matter_lawyers
              WHERE legacy_source_record_key = $1
                AND source_field = 'lawyerB'`,
            [directKey],
          ),
        /source cells with neither target nor evidence|matter lawyers missing or changed/,
      );
      await proveFailure(
        db,
        'a missing lawyer relationship fails permanently',
        () =>
          db.query('DELETE FROM matter_lawyers WHERE id = (SELECT min(id) FROM matter_lawyers)'),
        /matter lawyers missing or changed: 1/,
      );
      await proveFailure(
        db,
        'an extra relationship fails permanently',
        () =>
          db.query(`
            INSERT INTO matter_lawyers (
              matter_id, person_id, role, position, legacy_source,
              legacy_source_record_key, legacy_source_extraction_sha256,
              source_field, source_member_ordinal, updated_at
            )
            SELECT m.id, p.id, 'support', 999, 'extra legacy fixture',
                   '${'e'.repeat(64)}:000001', '${FINGERPRINT}',
                   'lawyerB', 1, CURRENT_TIMESTAMP
              FROM matters m CROSS JOIN people p
             WHERE NOT EXISTS (SELECT 1 FROM matter_lawyers x
                                WHERE x.matter_id=m.id AND x.person_id=p.id)
             LIMIT 1`),
        /matter lawyers extra or changed: 1/,
      );
      await proveFailure(
        db,
        'a missing party relationship fails permanently',
        () =>
          db.query('DELETE FROM matter_parties WHERE id = (SELECT min(id) FROM matter_parties)'),
        /matter parties missing or changed: 1/,
      );
      await proveFailure(
        db,
        'an extra party relationship fails permanently',
        () =>
          db.query(`
            INSERT INTO matter_parties (
              matter_id, side, party_name, ordinal, legacy_raw,
              legacy_source_record_key, legacy_source_extraction_sha256,
              source_field, source_fragment_ordinal, updated_at
            )
            SELECT id, 'client', 'طرف زائد للاختبار', 999,
                   'طرف زائد للاختبار', '${'f'.repeat(64)}:000001',
                   '${FINGERPRINT}', 'client&Cap', 1, CURRENT_TIMESTAMP
              FROM matters LIMIT 1`),
        /matter parties extra or changed: 1/,
      );
      await db.query('BEGIN');
      try {
        await assert.rejects(
          db.query(`
            INSERT INTO matter_lawyers (
              matter_id, person_id, role, position, legacy_source,
              legacy_source_record_key, legacy_source_extraction_sha256,
              source_field, source_member_ordinal, updated_at
            ) SELECT matter_id, person_id, role, position, legacy_source,
                     legacy_source_record_key, legacy_source_extraction_sha256,
                     source_field, source_member_ordinal, CURRENT_TIMESTAMP
                FROM matter_lawyers LIMIT 1`),
          /matter_lawyers_matter_person_key|matter_lawyers_legacy_source_key|matter_lawyers_one_lead_per_matter/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      console.log('  ok    an exact duplicate relationship is refused by database uniqueness');

      await db.query('BEGIN');
      try {
        await assert.rejects(
          db.query(`
            INSERT INTO matter_lawyers (
              matter_id, person_id, role, reviewed_rule_id, updated_at
            )
            SELECT m.id, p.id, 'support', r.id, CURRENT_TIMESTAMP
              FROM matters m CROSS JOIN people p CROSS JOIN migration_multi_person_rule r
             WHERE NOT EXISTS (SELECT 1 FROM matter_lawyers existing
                                WHERE existing.matter_id=m.id AND existing.person_id=p.id)
             LIMIT 1`),
          /matter_lawyers_rule_shape/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await assertClean(db);
      console.log('  ok    reviewed-rule provenance without a legacy source identity is refused');

      await proveFailure(
        db,
        'an incorrect party role fails permanently',
        () =>
          db.query(`
            UPDATE matter_party_roles SET role_id = (
              SELECT id FROM lookup_party_role
               WHERE id <> matter_party_roles.role_id
                 AND NOT EXISTS (SELECT 1 FROM matter_party_roles already
                                  WHERE already.party_id=matter_party_roles.party_id
                                    AND already.role_id=lookup_party_role.id)
               LIMIT 1)
             WHERE id = (SELECT min(id) FROM matter_party_roles)`),
        /matter party roles missing or changed|matter party roles extra or changed/,
      );
      await proveFailure(
        db,
        'a wrong reviewed exclusion fails permanently',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.matter_relationship_transform DISABLE TRIGGER matter_relationship_transform_source_immutable',
          );
          await db.query(`
            UPDATE quarantine.matter_relationship_transform q
               SET reviewed_exclusion_raw_value = (
                 SELECT raw_value FROM migration_excluded_name e
                  WHERE e.raw_value <> q.reviewed_exclusion_raw_value
                  ORDER BY raw_value LIMIT 1)
             WHERE q.outcome = 'excluded'`);
        },
        /relationship evidence missing or changed|relationship evidence extra or changed/,
      );
      await proveFailure(
        db,
        'altered quarantine reason and detail fail permanently',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.matter_relationship_transform DISABLE TRIGGER matter_relationship_transform_source_immutable',
          );
          await db.query(`
            UPDATE quarantine.matter_relationship_transform
               SET reason_codes = ARRAY['changed_reason'],
                   reason_details = jsonb_build_array(jsonb_build_object('changed', true))
             WHERE outcome = 'quarantined'
               AND id = (
                 SELECT min(id) FROM quarantine.matter_relationship_transform
                  WHERE outcome = 'quarantined'
               )`);
        },
        /relationship evidence missing or changed|relationship evidence extra or changed/,
      );
      await proveFailure(
        db,
        'a changed quarantine filename fails permanently',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.matter_relationship_transform DISABLE TRIGGER matter_relationship_transform_source_immutable',
          );
          await db.query(`
            UPDATE quarantine.matter_relationship_transform
               SET src_file = 'fixture/wrong-file.csv'
             WHERE id = (SELECT min(id) FROM quarantine.matter_relationship_transform)`);
        },
        /relationship evidence missing or changed|relationship evidence extra or changed/,
      );
      await proveFailure(
        db,
        'a changed quarantine row number fails permanently',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.matter_relationship_transform DISABLE TRIGGER matter_relationship_transform_source_immutable',
          );
          await db.query(`
            UPDATE quarantine.matter_relationship_transform
               SET src_row_num = src_row_num + 1000
             WHERE id = (SELECT min(id) FROM quarantine.matter_relationship_transform)`);
        },
        /relationship evidence missing or changed|relationship evidence extra or changed/,
      );
      await proveFailure(
        db,
        'a changed quarantine source payload fails permanently',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.matter_relationship_transform DISABLE TRIGGER matter_relationship_transform_source_immutable',
          );
          await db.query(`
            UPDATE quarantine.matter_relationship_transform
               SET source_payload = source_payload || '{"fixture_change":true}'::jsonb
             WHERE id = (SELECT min(id) FROM quarantine.matter_relationship_transform)`);
        },
        /relationship evidence missing or changed|relationship evidence extra or changed/,
      );
      await proveFailure(
        db,
        'a changed durable source identity fails permanently',
        () =>
          db.query(
            `UPDATE matter_lawyers SET legacy_source_record_key = $1
              WHERE id = (SELECT min(id) FROM matter_lawyers)`,
            [`${'c'.repeat(64)}:000001`],
          ),
        /matter lawyers missing or changed|matter lawyers extra or changed/,
      );
      await proveFailure(
        db,
        'a changed extraction fingerprint fails permanently',
        () =>
          db.query(
            `UPDATE matter_lawyers SET legacy_source_extraction_sha256 = $1
              WHERE id = (SELECT min(id) FROM matter_lawyers)`,
            ['B'.repeat(64)],
          ),
        /matter lawyers missing or changed|matter lawyers extra or changed/,
      );
      await proveFailure(
        db,
        'an unaccounted populated cell on a parent-quarantined matter fails permanently',
        () =>
          db.query(
            `UPDATE staging."الدعاوى"
                SET "lawyerA" = "lawyerA" || ' changed'
              WHERE src_record_key = $1`,
            [parentQuarantinedKey],
          ),
        /parent-quarantined source payload mismatches/,
      );

      const beforeMove = await matterRelationshipResultDigest(db);
      await db.query(
        `UPDATE staging."الدعاوى" SET src_file='fixture/reordered.csv', src_row_num=999
          WHERE src_record_key=$1`,
        [directKey],
      );
      const afterMove = await runMatterRelationshipTransform({
        databaseUrl: fixtureUrl.toString(),
      });
      assert.equal(afterMove.digest, beforeMove);
      console.log(
        '  ok    source filename/row reordering does not change durable identities or results',
      );

      await assertStructureClean(db);
      await proveStructureFailure(
        db,
        'a weakened source/provenance CHECK is detected by complete definition',
        () =>
          db.query(`
            ALTER TABLE matter_lawyers
              DROP CONSTRAINT matter_lawyers_legacy_source_shape,
              ADD CONSTRAINT matter_lawyers_legacy_source_shape CHECK (
                legacy_source_record_key IS NULL OR source_member_ordinal >= 1
              )`),
        /CHECK definition: matter_lawyers_legacy_source_shape/,
      );
      await proveStructureFailure(
        db,
        'a unique index recreated in the wrong column order is detected',
        async () => {
          await db.query('DROP INDEX matter_lawyers_legacy_source_key');
          await db.query(`
            CREATE UNIQUE INDEX matter_lawyers_legacy_source_key
                ON matter_lawyers(
                  source_member_ordinal, source_field, legacy_source_record_key
                )`);
        },
        /unique index definition: matter_lawyers_legacy_source_key/,
      );
      await proveStructureFailure(
        db,
        'a foreign key with the wrong delete action is detected',
        () =>
          db.query(`
            ALTER TABLE matter_lawyers
              DROP CONSTRAINT matter_lawyers_reviewed_rule_id_fkey,
              ADD CONSTRAINT matter_lawyers_reviewed_rule_id_fkey
                FOREIGN KEY (reviewed_rule_id)
                REFERENCES migration_multi_person_rule(id)
                ON DELETE CASCADE ON UPDATE CASCADE`),
        /foreign key definition: matter_lawyers_reviewed_rule_id_fkey/,
      );
      await proveStructureFailure(
        db,
        'a disabled quarantine immutability trigger is detected',
        () =>
          db.query(`
            ALTER TABLE quarantine.matter_relationship_transform
            DISABLE TRIGGER matter_relationship_transform_source_immutable`),
        /trigger definition: matter_relationship_transform_source_immutable/,
      );
      await proveStructureFailure(
        db,
        'an immutability function that stops protecting evidence is detected',
        () =>
          db.query(`
            CREATE OR REPLACE FUNCTION quarantine.protect_matter_relationship_transform_source()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $FUNCTION$
            BEGIN
                IF NEW.src_record_key IS DISTINCT FROM OLD.src_record_key THEN
                    RAISE EXCEPTION 'fixture weakened protection';
                END IF;
                RETURN NEW;
            END;
            $FUNCTION$`),
        /trigger function definition: quarantine.protect_matter_relationship_transform_source/,
      );
      await proveStructureFailure(
        db,
        'an erasure trigger that stops covering TRUNCATE is detected',
        async () => {
          await db.query(`
            DROP TRIGGER matter_relationship_transform_no_erasure
              ON quarantine.matter_relationship_transform`);
          await db.query(`
            CREATE TRIGGER matter_relationship_transform_no_erasure
            BEFORE DELETE ON quarantine.matter_relationship_transform
            FOR EACH STATEMENT
            EXECUTE FUNCTION quarantine.refuse_matter_relationship_transform_erasure()`);
        },
        /trigger definition: matter_relationship_transform_no_erasure/,
      );

      await assert.rejects(
        db.query('DELETE FROM quarantine.matter_relationship_transform'),
        /migration evidence; never delete or truncate/,
      );
      await assert.rejects(
        db.query('TRUNCATE quarantine.matter_relationship_transform'),
        /migration evidence; never delete or truncate/,
      );
      console.log('  ok    quarantine evidence refuses DELETE and TRUNCATE');
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      const identity = await admin.query<{ datname: string }>(
        `SELECT datname FROM pg_database
          WHERE datname = $1 AND datname LIKE 'matter_relationship_fixture_%'`,
        [databaseName],
      );
      assert.equal(identity.rows[0]?.datname, databaseName);
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
        [databaseName],
      );
      // Rule 14: this database did not exist before this test; every row in it
      // was created by this fixture in this run.
      await admin.query(`DROP DATABASE ${quoteIdentifier(databaseName)}`);
    }
    await admin.end();
  }
}

main()
  .then(() => console.log('\ntest:matter-relationships -- all fixture cases correct.\n'))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
