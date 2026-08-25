import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { reconcileAttendeeAudit } from './lib/attendee-audit-reconciliation';
import {
  hearingResultDigest,
  hearingStructureFailures,
  reconcileHearings,
} from './lib/hearing-reconciliation';
import { runHearingTransform } from './transform-hearings';

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

async function insertMatter(db: Client, legacyId: number): Promise<number> {
  const key = sourceKey(10_000 + legacyId);
  const result = await db.query<{ id: number }>(
    `INSERT INTO matters (
       legacy_id, legacy_source_record_key, legacy_source_extraction_sha256,
       legacy_source_payload, updated_at
     ) VALUES ($1,$2,$3,'{}'::jsonb,CURRENT_TIMESTAMP) RETURNING id`,
    [legacyId, key, FINGERPRINT],
  );
  return result.rows[0]!.id;
}

async function insertParentQuarantine(db: Client, legacyId: number): Promise<void> {
  await db.query(
    `INSERT INTO quarantine.matter_transform (
       src_record_key, extraction_sha256, src_file, src_row_num,
       legacy_matter_id, reason_codes, reason_details, source_payload
     ) VALUES ($1,$2,'fixture/matters.csv',1,$3,
               ARRAY['fixture_parent'], '[{"fixture":true}]'::jsonb,
               jsonb_build_object('matterID',$3::text))`,
    [sourceKey(20_000 + legacyId), FINGERPRINT, String(legacyId)],
  );
}

type SourceValues = {
  matterId?: string | null;
  court?: string | null;
  circuit?: string | null;
  notes?: string | null;
  attendee?: string | null;
  attendee1?: string | null;
};

async function insertHearingSource(
  db: Client,
  sequence: number,
  action: string,
  values: SourceValues = {},
): Promise<string> {
  const key = sourceKey(sequence);
  await db.query(
    `INSERT INTO staging."الجلسات" (
       src_file,src_row_num,src_record_key,src_extraction_sha256,
       "ID_hearings","التاريخ","القرار","تقرير","الحاضر","lastDecision",
       "صالح/ضد","الإجراء","المحكمة","حضور الجلسة القادمة","الدائرة",
       "الجهة","ملاحظات","إخطار العميل بالقرار","حاضر 1",
       "nextHearing","matterID","shortDecision"
     ) VALUES (
       'fixture/hearings.csv',$1,$2,$3,$4,'2026-08-25 00:00:00',
       'قرار اختبار','true',$5,'قرار سابق','صالح',$6,$7,NULL,$8,
       'جهة اختبار',$9,'false',$10,'2026-08-26 00:00:00',$11,'مختصر'
     )`,
    [
      sequence,
      key,
      FINGERPRINT,
      String(50_000 + sequence),
      values.attendee ?? null,
      action,
      values.court ?? null,
      values.circuit ?? null,
      values.notes ?? null,
      values.attendee1 ?? null,
      values.matterId ?? null,
    ],
  );
  return key;
}

async function insertAuditCell(
  db: Client,
  hearingKey: string,
  rowNumber: number,
  sourceColumn: 'الحاضر' | 'حاضر 1',
  sourceColumnOrdinal: number,
  original: string,
  kind: 'person' | 'note',
  personId: number | null,
  reviewValueId: string | null,
): Promise<{ cellId: string; spanId: string }> {
  const ids = await db.query<{ cell_id: string; span_id: string }>(
    `SELECT _migration.attendee_cell_id('الجلسات',$1,$2) cell_id,
            _migration.attendee_fragment_id(
              _migration.attendee_cell_id('الجلسات',$1,$2),0,char_length($3),$3
            ) span_id`,
    [hearingKey, sourceColumn, original],
  );
  const { cell_id: cellId, span_id: spanId } = ids.rows[0]!;
  await db.query(
    `INSERT INTO _migration.attendee_source_cell (
       cell_id,source_table,src_record_key,extraction_sha256,source_column,
       source_column_ordinal,src_file,src_row_num,original_cell,
       original_cell_sha256,decomposition_version,review_value_id
     ) VALUES ($1,'الجلسات',$2,$3,$4,$5,'fixture/hearings.csv',$6,$7,
               _migration.attendee_cell_content_sha256($7),1,$8)`,
    [
      cellId,
      hearingKey,
      FINGERPRINT,
      sourceColumn,
      sourceColumnOrdinal,
      rowNumber,
      original,
      reviewValueId,
    ],
  );
  await db.query(
    `INSERT INTO _migration.attendee_source_span (
       fragment_id,cell_id,source_table,src_record_key,extraction_sha256,
       source_column,original_cell_sha256,sequence,line,start_offset,end_offset,
       raw,value,kind,classification_rule,review_required,person_id
     ) VALUES ($1,$2,'الجلسات',$3,$4,$5,
               _migration.attendee_cell_content_sha256($6),1,1,0,char_length($6),
               $6,$6,$7,$8,false,$9)`,
    [
      spanId,
      cellId,
      hearingKey,
      FINGERPRINT,
      sourceColumn,
      original,
      kind,
      kind === 'person' ? 'exact_person_alias' : 'reviewed_not_a_name',
      personId,
    ],
  );
  return { cellId, spanId };
}

async function assertClean(db: Client): Promise<void> {
  const result = await reconcileHearings(db);
  assert.deepEqual(result.defects, [], 'fixture must return to a clean hearing reconciliation');
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
    const result = await reconcileHearings(db);
    assert.match(result.defects.join('\n'), expected, `${label}: reconciliation did not fail`);
  } finally {
    await db.query('ROLLBACK');
  }
  await assertClean(db);
  console.log(`  ok    ${label}`);
}

async function main(): Promise<void> {
  const projectUrlText = process.env['DATABASE_URL'];
  assert.ok(projectUrlText, 'DATABASE_URL is required');
  const databaseName = `hearing_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrlText);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrlText);
  fixtureUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;

  await admin.connect();
  try {
    const existing = await admin.query<{ count: string }>(
      'SELECT count(*)::text count FROM pg_database WHERE datname=$1',
      [databaseName],
    );
    assert.equal(existing.rows[0]?.count, '0');
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
      const action = (
        await db.query<{ label_ar: string }>(
          `SELECT label_ar FROM lookup_hearing_action a
            WHERE NOT EXISTS (SELECT 1 FROM migration_crosswalk c
                    WHERE c.source_field='hearing_action'
                      AND _migration.reviewed_text_key(c.source_value)=
                          _migration.reviewed_text_key(a.label_ar))
            ORDER BY a.id LIMIT 1`,
        )
      ).rows[0]!.label_ar;
      const directCourt = (
        await db.query<{ label_ar: string }>(
          `SELECT label_ar FROM lookup_court c
            WHERE NOT EXISTS (SELECT 1 FROM migration_crosswalk x
                    WHERE x.source_field='court'
                      AND _migration.reviewed_text_key(x.source_value)=
                          _migration.reviewed_text_key(c.label_ar))
            ORDER BY c.id LIMIT 1`,
        )
      ).rows[0]!.label_ar;
      const rules = await db.query<{
        source_value: string;
        target_field: string;
        reviewer_note: string;
      }>(`
        SELECT source_value,target_field,reviewer_note
          FROM migration_crosswalk
         WHERE source_field='court'
           AND (target_field='matter_destination'
             OR (target_field='SPLIT' AND reviewer_note LIKE '%hearing_note=%')
             OR (target_field='SPLIT' AND reviewer_note LIKE '%circuit=%'))
         ORDER BY target_field,source_value`);
      const destinationRule = rules.rows.find((row) => row.target_field === 'matter_destination')!;
      const noteRule = rules.rows.find((row) => row.reviewer_note.includes('hearing_note='))!;
      const circuitRule = rules.rows.find((row) => row.reviewer_note.includes('circuit='))!;

      await insertMatter(db, 7001);
      await insertParentQuarantine(db, 7002);
      const regularKey = await insertHearingSource(db, 1, action, {
        matterId: '7001',
        court: directCourt,
        attendee: alias.alias_ar,
        attendee1: '**',
      });
      await insertHearingSource(db, 2, action, { court: directCourt });
      const parentQKey = await insertHearingSource(db, 3, action, {
        matterId: '7002',
        court: directCourt,
        attendee: alias.alias_ar,
      });
      const conflictKey = await insertHearingSource(db, 4, action, {
        matterId: '7001',
        court: circuitRule.source_value,
        circuit: 'دائرة مختلفة',
        attendee: alias.alias_ar,
      });
      await insertHearingSource(db, 5, action, {
        matterId: '7001',
        court: noteRule.source_value,
      });
      await insertHearingSource(db, 6, action, {
        matterId: '7001',
        court: destinationRule.source_value,
      });

      const review = await db.query<{ id: string }>(
        `INSERT INTO quarantine.review_value (
           topic,value,occurrences,confidence,firm_answer,answered_at,
           answered_by,extraction_sha256
         ) VALUES ('attendee_name','**',1,'none','not a name',CURRENT_TIMESTAMP,
                   'fixture',$1) RETURNING id::text`,
        [FINGERPRINT],
      );
      const personEvidence = await insertAuditCell(
        db,
        regularKey,
        1,
        'الحاضر',
        1,
        alias.alias_ar,
        'person',
        alias.person_id,
        null,
      );
      const placeholderEvidence = await insertAuditCell(
        db,
        regularKey,
        1,
        'حاضر 1',
        2,
        '**',
        'note',
        null,
        review.rows[0]!.id,
      );
      await insertAuditCell(
        db,
        parentQKey,
        3,
        'الحاضر',
        1,
        alias.alias_ar,
        'person',
        alias.person_id,
        null,
      );
      const conflictEvidence = await insertAuditCell(
        db,
        conflictKey,
        4,
        'الحاضر',
        1,
        alias.alias_ar,
        'person',
        alias.person_id,
        null,
      );
      assert.deepEqual((await reconcileAttendeeAudit(db)).defects, []);

      const dryRun = await runHearingTransform({
        databaseUrl: fixtureUrl.toString(),
        dryRun: true,
      });
      assert.deepEqual(
        {
          source: dryRun.plan.sourceCount,
          target: dryRun.plan.targets.length,
          quarantine: dryRun.plan.quarantine.length,
          cells: dryRun.plan.auditCellCount,
          targetCells: dryRun.plan.targetAuditCells,
          quarantineCells: dryRun.plan.quarantinedAuditCells,
          attendees: dryRun.plan.attendees.length,
          quarantinedPeople: dryRun.plan.quarantinedPersonSpans,
        },
        {
          source: 6,
          target: 4,
          quarantine: 2,
          cells: 4,
          targetCells: 2,
          quarantineCells: 2,
          attendees: 1,
          quarantinedPeople: 2,
        },
      );
      console.log('  ok    dry run partitions all hearings, audit cells and person spans');

      await assert.rejects(
        runHearingTransform({
          databaseUrl: fixtureUrl.toString(),
          forceFailure: true,
        }),
        /fixture forced late hearing-transform failure/,
      );
      const rolledBack = await db.query<{ total: string }>(`
        SELECT ((SELECT count(*) FROM hearings)
              +(SELECT count(*) FROM hearing_attendees)
              +(SELECT count(*) FROM quarantine.hearing_transform))::text total`);
      assert.equal(rolledBack.rows[0]!.total, '0');
      console.log('  ok    forced late failure leaves zero partial Task 2.8 rows');

      const first = await runHearingTransform({ databaseUrl: fixtureUrl.toString() });
      assert.deepEqual(first.reconciliation?.defects, []);
      const identityBefore = await db.query<{ snapshot: unknown }>(`
        SELECT jsonb_agg(payload ORDER BY kind, identity) snapshot FROM (
          SELECT 'H' kind,legacy_source_record_key identity,
                 jsonb_build_array(id,created_at,updated_at) payload
            FROM hearings WHERE legacy_source_record_key IS NOT NULL
          UNION ALL
          SELECT 'A',source_span_id,jsonb_build_array(id,created_at,updated_at)
            FROM hearing_attendees WHERE legacy_source_record_key IS NOT NULL
          UNION ALL
          SELECT 'Q',src_record_key,jsonb_build_array(id,created_at)
            FROM quarantine.hearing_transform
        ) stable`);
      const digestBefore = await hearingResultDigest(db);
      const second = await runHearingTransform({ databaseUrl: fixtureUrl.toString() });
      assert.equal(second.digest, digestBefore);
      const identityAfter = await db.query<{ snapshot: unknown }>(`
        SELECT jsonb_agg(payload ORDER BY kind, identity) snapshot FROM (
          SELECT 'H' kind,legacy_source_record_key identity,
                 jsonb_build_array(id,created_at,updated_at) payload
            FROM hearings WHERE legacy_source_record_key IS NOT NULL
          UNION ALL
          SELECT 'A',source_span_id,jsonb_build_array(id,created_at,updated_at)
            FROM hearing_attendees WHERE legacy_source_record_key IS NOT NULL
          UNION ALL
          SELECT 'Q',src_record_key,jsonb_build_array(id,created_at)
            FROM quarantine.hearing_transform
        ) stable`);
      assert.deepEqual(identityAfter.rows[0]!.snapshot, identityBefore.rows[0]!.snapshot);
      console.log('  ok    identical rerun preserves IDs, timestamps and result digest');
      await assertClean(db);

      await proveFailure(
        db,
        'changed direct scalar target is detected',
        () =>
          db.query(`UPDATE hearings SET decision='swapped' WHERE legacy_source_record_key=$1`, [
            regularKey,
          ]),
        /target rows missing, extra or changed/,
      );
      await proveFailure(
        db,
        'changed typed date is detected',
        () =>
          db.query(
            `UPDATE hearings SET hearing_date='2026-08-24' WHERE legacy_source_record_key=$1`,
            [regularKey],
          ),
        /target rows missing, extra or changed/,
      );
      await proveFailure(
        db,
        'changed extraction fingerprint is detected',
        () =>
          db.query(
            `UPDATE hearings SET legacy_source_extraction_sha256=$2 WHERE legacy_source_record_key=$1`,
            [regularKey, 'B'.repeat(64)],
          ),
        /target rows missing, extra or changed/,
      );
      await proveFailure(
        db,
        'incorrect quarantine reason is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.hearing_transform DISABLE TRIGGER hearing_transform_immutable',
          );
          await db.query(
            `UPDATE quarantine.hearing_transform SET reason_codes=ARRAY['wrong'], reason_details='[{"wrong":true}]'::jsonb WHERE src_record_key=$1`,
            [parentQKey],
          );
        },
        /quarantine rows missing, extra or changed/,
      );
      await proveFailure(
        db,
        'changed quarantine trace is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.hearing_transform DISABLE TRIGGER hearing_transform_immutable',
          );
          await db.query(
            `UPDATE quarantine.hearing_transform SET src_file='wrong.csv' WHERE src_record_key=$1`,
            [parentQKey],
          );
        },
        /quarantine rows missing, extra or changed/,
      );
      await proveFailure(
        db,
        'missing attendee is detected',
        () =>
          db.query('DELETE FROM hearing_attendees WHERE source_span_id=$1', [
            personEvidence.spanId,
          ]),
        /attendees missing, extra or changed/,
      );
      await assert.rejects(
        db.query(
          `INSERT INTO hearing_attendees (
             hearing_id,person_id,legacy_name_raw,ordinal,
             legacy_source_record_key,legacy_source_extraction_sha256,
             source_column,source_column_ordinal,source_cell_id,
             source_span_id,source_span_sequence,updated_at
           ) SELECT h.id,$1,$2,2,$3,$4,'الحاضر',1,$5,$6,1,CURRENT_TIMESTAMP
               FROM hearings h WHERE h.legacy_source_record_key=$7`,
          [
            alias.person_id,
            alias.alias_ar,
            conflictKey,
            FINGERPRINT,
            conflictEvidence.cellId,
            conflictEvidence.spanId,
            regularKey,
          ],
        ),
        /hearing attendee provenance does not match one proved Correction B person span/,
      );
      await assertClean(db);
      console.log('  ok    quarantined-parent person span is refused immediately');

      await assert.rejects(
        db.query(
          `INSERT INTO hearing_attendees (
             hearing_id,person_id,legacy_name_raw,ordinal,
             legacy_source_record_key,legacy_source_extraction_sha256,
             source_column,source_column_ordinal,source_cell_id,
             source_span_id,source_span_sequence,updated_at
           ) SELECT h.id,$1,'**',2,$2,$3,'حاضر 1',2,$4,$5,1,CURRENT_TIMESTAMP
               FROM hearings h WHERE h.legacy_source_record_key=$2`,
          [
            alias.person_id,
            regularKey,
            FINGERPRINT,
            placeholderEvidence.cellId,
            placeholderEvidence.spanId,
          ],
        ),
        /hearing attendee provenance does not match one proved Correction B person span/,
      );
      await assertClean(db);
      console.log('  ok    placeholder span is refused immediately');

      await db.query('BEGIN');
      try {
        await db.query(
          'ALTER TABLE quarantine.hearing_transform DISABLE TRIGGER hearing_transform_no_erasure',
        );
        assert.match((await hearingStructureFailures(db)).join('\n'), /trigger definition changed/);
      } finally {
        await db.query('ROLLBACK');
      }
      assert.deepEqual(await hearingStructureFailures(db), []);
      console.log('  ok    disabled protection trigger is detected');

      await db.query('BEGIN');
      try {
        await db.query(`
          CREATE OR REPLACE FUNCTION quarantine.refuse_hearing_transform_change()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$`);
        assert.match(
          (await hearingStructureFailures(db)).join('\n'),
          /function definition changed/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      assert.deepEqual(await hearingStructureFailures(db), []);
      console.log('  ok    weakened protection function is detected');

      await db.query('BEGIN');
      try {
        await db.query('DROP INDEX hearings_legacy_source_record_key_key');
        assert.match((await hearingStructureFailures(db)).join('\n'), /index definition changed/);
      } finally {
        await db.query('ROLLBACK');
      }
      assert.deepEqual(await hearingStructureFailures(db), []);
      console.log('  ok    missing unique source-identity index is detected');

      await db.query('BEGIN');
      try {
        await db.query('ALTER TABLE hearings DROP CONSTRAINT hearings_source_identity_shape');
        assert.match(
          (await hearingStructureFailures(db)).join('\n'),
          /hearings_source_identity_shape/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      assert.deepEqual(await hearingStructureFailures(db), []);
      console.log('  ok    weakened source-identity protection is detected');

      const nativeHearing = await db.query<{ id: number }>(
        `INSERT INTO hearings (decision,updated_at) VALUES ('native',CURRENT_TIMESTAMP) RETURNING id`,
      );
      await db.query(
        `INSERT INTO hearing_attendees (hearing_id,person_id,updated_at)
         VALUES ($1,$2,CURRENT_TIMESTAMP)`,
        [nativeHearing.rows[0]!.id, alias.person_id],
      );
      await assertClean(db);
      assert.equal(await hearingResultDigest(db), digestBefore);
      console.log(
        '  ok    application-native hearing and attendee are outside migration reconciliation',
      );

      await assert.rejects(
        db.query(
          `UPDATE quarantine.hearing_transform SET src_file='blocked' WHERE src_record_key=$1`,
          [parentQKey],
        ),
        /immutable migration evidence/,
      );
      await assert.rejects(
        db.query(`DELETE FROM quarantine.hearing_transform WHERE src_record_key=$1`, [parentQKey]),
        /DELETE\/TRUNCATE is refused/,
      );
      console.log('  ok    quarantine UPDATE and DELETE protections refuse evidence loss');
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      const stillOwn = await admin.query<{ count: string }>(
        'SELECT count(*)::text count FROM pg_database WHERE datname=$1',
        [databaseName],
      );
      assert.equal(stillOwn.rows[0]?.count, '1');
      await admin.query(`DROP DATABASE ${identifier(databaseName)} WITH (FORCE)`);
    }
    await admin.end();
  }
  console.log('\nHEARING TRANSFORM FIXTURE: all proofs passed.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
