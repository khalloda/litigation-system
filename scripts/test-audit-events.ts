import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  recordLoginFailed,
  recordObservedExternalEvent,
  runAuditedDatabaseOperation,
  setAuthenticationAuditContext,
  type AuditedDatabaseOperationResult,
} from '../src/lib/audit';
import { createRequestAuditMetadata } from '../src/lib/audit-metadata';
import { createDatabaseClient } from '../src/lib/db';
import {
  auditEventDataFailures,
  auditEventDigest,
  auditEventStructureFailures,
  TASK33B_CORRECTION_MIGRATION,
  TASK33B_MIGRATION,
} from './lib/audit-event-structure';

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function migrate(databaseUrl: string, expectedStatus = 0): string {
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
  const output = `${result.stdout}\n${result.stderr}`;
  if (expectedStatus === 0) assert.equal(result.status, 0, output.slice(-12_000));
  else assert.notEqual(result.status, 0, 'the deliberately conflicting migration succeeded');
  return output;
}

function fixtureRuntimeUrl(ownerUrl: URL): URL {
  const configured = process.env['DATABASE_URL'];
  assert.ok(configured, 'DATABASE_URL is required');
  const runtime = new URL(configured);
  assert.equal(runtime.username, 'litigation_runtime');
  runtime.protocol = ownerUrl.protocol;
  runtime.hostname = ownerUrl.hostname;
  runtime.port = ownerUrl.port;
  runtime.pathname = ownerUrl.pathname;
  return runtime;
}

async function removeTask33B(db: Client): Promise<void> {
  // This session-owned canonical fixture includes later migration 60. Remove
  // its empty schema first so the Task 3.3B failed-migration fixture still
  // tests the intended boundary rather than a later foreign-key dependency.
  await db.query(`
    DROP TRIGGER matters_client_branch_compatibility ON matters;
    DROP TRIGGER zz_task35b_row_proof ON lookup_client_branch;
    DROP TRIGGER zz_task35b_row_proof ON lookup_court;
    DROP TRIGGER zz_task35b_row_proof ON matters;
    DROP TRIGGER zz_task35b_row_proof ON hearings;
    DROP TRIGGER zz_task35b_row_proof ON matter_lawyers;
    DROP TRIGGER zz_task35b_row_proof ON matter_parties;
    DROP TRIGGER zz_task35b_row_proof ON matter_party_roles;
    DROP TRIGGER zz_task35b_row_proof ON hearing_attendees;
    DROP TABLE _migration.high_impact_row_proof;
    DROP TABLE _migration.high_impact_resolution;
    DROP TABLE _migration.high_impact_application;
    DROP TABLE _migration.client_branch_compatibility;
    DROP FUNCTION _migration.capture_high_impact_row_proof();
    DROP FUNCTION _migration.check_high_impact_completeness();
    DROP FUNCTION _migration.audit_branch_compatibility();
    DROP FUNCTION _migration.enforce_client_branch_compatibility();
    DROP FUNCTION _migration.refuse_high_impact_evidence_change();
    DELETE FROM _prisma_migrations WHERE migration_name='20260904180000_prepare_high_impact_application'`);
  const tables = (
    await db.query<{ entity_table: string }>(
      `SELECT entity_table FROM audit_event_table_rules ORDER BY entity_table`,
    )
  ).rows;
  await db.query('BEGIN');
  try {
    for (const { entity_table: table } of tables) {
      assert.match(table, /^[a-z_]+$/u);
      await db.query(`DROP TRIGGER audit_event_capture ON public.${table}`);
    }
    await db.query(`
      DROP TABLE audit_event_checkpoints;
      DROP TABLE audit_events;
      DROP TABLE audit_event_fields;
      DROP TABLE audit_event_table_rules;
      DROP FUNCTION audit_capture_row_event();
      DROP FUNCTION audit_append_semantic_event_for_account(text,text,text,text,jsonb,integer,text,text,jsonb,text,jsonb);
      DROP FUNCTION audit_append_semantic_event(text,text,text,text,jsonb,integer,text,text,jsonb,text,jsonb);
      DROP FUNCTION audit_write_event(text,text,text,text,jsonb,text[],jsonb,jsonb,integer,text,text,jsonb,text,jsonb);
      DROP FUNCTION audit_ensure_event_context();
      DROP FUNCTION audit_set_event_context(uuid,uuid,uuid,inet,text,text);
      DROP FUNCTION audit_safe_flat_object(jsonb);
      DROP FUNCTION audit_bound_json_value(jsonb,integer,text);
      DROP FUNCTION audit_contains_secret_pattern(text);
      DROP FUNCTION refuse_audit_event_change()`);
    const removed = await db.query(
      `DELETE FROM _prisma_migrations WHERE migration_name=ANY($1::text[])
       RETURNING migration_name`,
      [[TASK33B_MIGRATION, TASK33B_CORRECTION_MIGRATION]],
    );
    assert.equal(removed.rowCount, 2);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function proveFailedMigrationAtomic(admin: Client, source: URL): Promise<void> {
  const fixtureName = `litigation_task33b_failed_${process.pid}_${Date.now()}`;
  const fixtureUrl = new URL(source);
  fixtureUrl.pathname = `/${fixtureName}`;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${identifier(fixtureName)}`);
    created = true;
    migrate(fixtureUrl.toString());
    const fixture = new Client({ connectionString: fixtureUrl.toString() });
    await fixture.connect();
    try {
      await removeTask33B(fixture);
      await fixture.query('CREATE TABLE audit_events(conflict_marker text)');
    } finally {
      await fixture.end();
    }
    const failure = migrate(fixtureUrl.toString(), 1);
    assert.doesNotMatch(failure, /task33b_atomic_secret_marker/iu);
    const evidence = new Client({ connectionString: fixtureUrl.toString() });
    await evidence.connect();
    try {
      const result = await evidence.query<{
        conflict_count: string;
        leaked_tables: string;
        leaked_functions: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM information_schema.columns
            WHERE table_schema='public' AND table_name='audit_events'
              AND column_name='conflict_marker') conflict_count,
          (SELECT count(*)::text FROM information_schema.tables
            WHERE table_schema='public' AND table_name IN
              ('audit_event_fields','audit_event_table_rules','audit_event_checkpoints')) leaked_tables,
          (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname LIKE 'audit_%event%') leaked_functions`);
      assert.deepEqual(result.rows[0], {
        conflict_count: '1',
        leaked_tables: '0',
        leaked_functions: '0',
      });
    } finally {
      await evidence.end();
    }
    console.log(
      'PASS failed Task 3.3B migration is atomic before any foundation object is created',
    );
  } finally {
    if (created) {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
        [fixtureName],
      );
      await admin.query(`DROP DATABASE ${identifier(fixtureName)}`);
    }
  }
}

async function rejects(operation: () => Promise<unknown>, expected: RegExp): Promise<string> {
  let message = '';
  await assert.rejects(operation, (error: unknown) => {
    message = error instanceof Error ? error.message : String(error);
    return expected.test(message);
  });
  return message;
}

async function setPgContext(
  db: Client,
  accountId: number,
  ids: readonly [string, string, string],
  userAgent: string | null = null,
): Promise<void> {
  await db.query('SELECT audit_set_human_context($1)', [accountId]);
  await db.query('SELECT audit_set_event_context($1,$2,$3,NULL,$4,$5)', [
    ...ids,
    userAgent,
    userAgent ? 'desktop' : 'unknown',
  ]);
}

function hasIndexName(plan: unknown, name: string): boolean {
  if (!plan || typeof plan !== 'object') return false;
  const record = plan as Record<string, unknown>;
  if (record['Index Name'] === name) return true;
  return Object.values(record).some((value) =>
    Array.isArray(value)
      ? value.some((item) => hasIndexName(item, name))
      : hasIndexName(value, name),
  );
}

async function main(): Promise<void> {
  const sourceText = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(sourceText, 'MIGRATION_DATABASE_URL is required');
  const source = new URL(sourceText);
  assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
  assert.equal(source.port, '5433');
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await proveFailedMigrationAtomic(admin, source);

  const fixtureName = `litigation_task33b_fixture_${process.pid}_${Date.now()}`;
  const fixtureUrl = new URL(source);
  fixtureUrl.pathname = `/${fixtureName}`;
  const runtimeUrl = fixtureRuntimeUrl(fixtureUrl);
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${identifier(fixtureName)}`);
    created = true;
    migrate(fixtureUrl.toString());
    const owner = new Client({ connectionString: fixtureUrl.toString() });
    const runtime = new Client({ connectionString: runtimeUrl.toString() });
    const runtimePrisma = createDatabaseClient(runtimeUrl.toString());
    await owner.connect();
    await runtime.connect();
    try {
      assert.deepEqual(await auditEventStructureFailures(owner), []);
      assert.deepEqual(await auditEventDataFailures(owner), []);
      assert.equal((await owner.query('SELECT count(*) FROM audit_events')).rows[0].count, '1');

      await owner.query('ALTER TABLE lookup_importance ADD COLUMN task33b_unclassified text');
      assert.ok(
        (await auditEventStructureFailures(owner)).includes(
          'audited-table column classification is not exhaustive and exact',
        ),
      );
      const unclassifiedBefore = (
        await owner.query<{ value: string | null; events: string }>(`
          SELECT task33b_unclassified value,
                 (SELECT count(*)::text FROM audit_events) events
            FROM lookup_importance ORDER BY id LIMIT 1`)
      ).rows[0]!;
      await runtime.query('BEGIN');
      await setPgContext(runtime, 1, [randomUUID(), randomUUID(), randomUUID()]);
      await rejects(
        () =>
          runtime.query(
            `UPDATE lookup_importance SET task33b_unclassified='must not commit'
              WHERE id=(SELECT min(id) FROM lookup_importance)`,
          ),
        /Unclassified audited column public\.lookup_importance\.task33b_unclassified/u,
      );
      await runtime.query('ROLLBACK');
      const unclassifiedAfter = (
        await owner.query<{ value: string | null; events: string }>(`
          SELECT task33b_unclassified value,
                 (SELECT count(*)::text FROM audit_events) events
            FROM lookup_importance ORDER BY id LIMIT 1`)
      ).rows[0]!;
      assert.deepEqual(unclassifiedAfter, unclassifiedBefore);
      await owner.query('ALTER TABLE lookup_importance DROP COLUMN task33b_unclassified');
      assert.deepEqual(await auditEventStructureFailures(owner), []);
      console.log('PASS unclassified audited columns fail the checker and roll writes back');

      for (const statement of [
        `UPDATE audit_events SET outcome='failed'`,
        `DELETE FROM audit_events`,
        `TRUNCATE audit_events`,
        `INSERT INTO audit_events DEFAULT VALUES`,
        `ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_change`,
      ]) {
        await rejects(() => runtime.query(statement), /permission denied|must be owner/iu);
      }
      await rejects(
        () =>
          runtime.query(
            `SELECT audit_write_event('record_updated','succeeded','public','matters',
              '{"id":1}',ARRAY['status'],'{}','{}',NULL,NULL,NULL,'{}',NULL,'{}')`,
          ),
        /permission denied/iu,
      );
      await rejects(() => runtime.query('SELECT id FROM audit_actors'), /permission denied/iu);
      await rejects(
        () =>
          runtime.query(
            `SELECT audit_append_semantic_event(
              'login_failed','failed','public','user_accounts','{"id":1}',1001,
              'fixture',NULL,'{}','password_incorrect','{}')`,
          ),
        /permission denied/iu,
      );
      await rejects(() => runtime.query('SET ROLE litigation'), /permission denied/iu);
      console.log('PASS runtime cannot read, insert, mutate, truncate or disable audit history');

      const readCount = Number(
        (await owner.query('SELECT count(*) FROM audit_events')).rows[0].count,
      );
      await runtime.query('SELECT id,label_ar FROM lookup_importance ORDER BY id LIMIT 2');
      assert.equal(
        Number((await owner.query('SELECT count(*) FROM audit_events')).rows[0].count),
        readCount,
      );

      const ids = [randomUUID(), randomUUID(), randomUUID()] as const;
      await runtime.query('BEGIN');
      await setPgContext(runtime, 1, ids, `Mozilla/5.0 ${'x'.repeat(600)}`);
      await runtime.query(
        `INSERT INTO lookup_importance(id,label_ar,label_en,sort_order,is_active)
         VALUES(30001,'__task33b_fixture_ar__',NULL,30001,true)`,
      );
      await runtime.query('COMMIT');
      const createdEvent = (
        await owner.query<{
          action: string;
          actor_id: number;
          request_id: string;
          correlation_id: string;
          audit_session_id: string;
          user_agent_length: number;
          user_agent_truncated: boolean;
          entity_key: Record<string, unknown>;
          changed_fields: string[];
          after_values: Record<string, unknown>;
        }>(`
          SELECT action,actor_id,request_id::text,correlation_id::text,audit_session_id::text,
                 char_length(user_agent) user_agent_length,user_agent_truncated,
                 entity_key,changed_fields,after_values
            FROM audit_events WHERE entity_table='lookup_importance'
              AND entity_key='{"id":30001}' ORDER BY id DESC LIMIT 1`)
      ).rows[0]!;
      assert.deepEqual(
        [
          createdEvent.action,
          createdEvent.actor_id,
          createdEvent.request_id,
          createdEvent.correlation_id,
          createdEvent.audit_session_id,
          createdEvent.user_agent_length,
          createdEvent.user_agent_truncated,
        ],
        ['record_created', 1001, ids[0], ids[1], ids[2], 512, true],
      );
      assert.deepEqual(createdEvent.entity_key, { id: 30001 });
      assert.deepEqual(createdEvent.changed_fields, [
        'is_active',
        'label_ar',
        'label_en',
        'sort_order',
      ]);
      assert.deepEqual(Object.keys(createdEvent.after_values).sort(), createdEvent.changed_fields);
      assert.ok(!createdEvent.changed_fields.includes('id'));
      assert.ok(!createdEvent.changed_fields.some((field) => field.endsWith('_at')));
      assert.ok(!createdEvent.changed_fields.some((field) => field.endsWith('_by')));

      const secretSentinel =
        'password=task33b_plain bearer task33b_token cookie=task33b_cookie postgresql://task33b_connection $argon2id$task33b_hash';
      await runtime.query('BEGIN');
      await setPgContext(runtime, 1, [randomUUID(), randomUUID(), randomUUID()]);
      await runtime.query(`UPDATE lookup_importance SET label_ar=$1,label_en=$2 WHERE id=30001`, [
        'س'.repeat(1_100),
        secretSentinel,
      ]);
      await runtime.query('COMMIT');
      const redacted = (
        await owner.query<{
          before_values: Record<string, unknown>;
          after_values: Record<string, unknown>;
          changed_fields: string[];
          complete: string;
        }>(`
          SELECT before_values,after_values,changed_fields,to_jsonb(e)::text complete
            FROM audit_events e WHERE entity_table='lookup_importance'
              AND entity_key='{"id":30001}' AND action='record_updated'
            ORDER BY id DESC LIMIT 1`)
      ).rows[0]!;
      assert.deepEqual(redacted.changed_fields, ['label_ar', 'label_en']);
      assert.equal(redacted.before_values['label_en'], null);
      assert.deepEqual(redacted.after_values['label_en'], {
        $redacted: true,
        $reason: 'secret_pattern',
      });
      assert.equal(
        (redacted.after_values['label_ar'] as Record<string, unknown>)['$truncated'],
        true,
      );
      assert.doesNotMatch(redacted.complete, /task33b_(plain|token|cookie|connection|hash)/u);

      const structuralBefore = (
        await owner.query<{ updated_at: string; events: string }>(`
          SELECT updated_at::text,
                 (SELECT count(*)::text FROM audit_events) events
            FROM lookup_importance WHERE id=30001`)
      ).rows[0]!;
      await runtime.query('BEGIN');
      await setPgContext(runtime, 1, [randomUUID(), randomUUID(), randomUUID()]);
      await runtime.query(
        `UPDATE lookup_importance SET updated_at=updated_at+interval '1 second' WHERE id=30001`,
      );
      await runtime.query('COMMIT');
      const structuralAfter = (
        await owner.query<{ updated_at: string; events: string }>(`
          SELECT updated_at::text,
                 (SELECT count(*)::text FROM audit_events) events
            FROM lookup_importance WHERE id=30001`)
      ).rows[0]!;
      assert.notEqual(structuralAfter.updated_at, structuralBefore.updated_at);
      assert.equal(structuralAfter.events, structuralBefore.events);
      console.log(
        'PASS captured/redacted fields emit bounded values; entity keys and structural fields follow their classified behavior',
      );

      const beforeFailedWrite = (
        await owner.query<{ label_ar: string; events: string }>(`
          SELECT label_ar,(SELECT count(*)::text FROM audit_events) events
            FROM lookup_importance WHERE id=30001`)
      ).rows[0]!;
      await runtime.query('BEGIN');
      await setPgContext(runtime, 1, [randomUUID(), randomUUID(), randomUUID()]);
      await runtime.query(`SELECT set_config('litigation.audit_user_agent',$1,true)`, [
        'x'.repeat(513),
      ]);
      await rejects(
        () =>
          runtime.query(`UPDATE lookup_importance SET label_ar='__must_rollback__' WHERE id=30001`),
        /Invalid transaction-local audit event context/iu,
      );
      await runtime.query('ROLLBACK');
      const afterFailedWrite = (
        await owner.query<{ label_ar: string; events: string }>(`
          SELECT label_ar,(SELECT count(*)::text FROM audit_events) events
            FROM lookup_importance WHERE id=30001`)
      ).rows[0]!;
      assert.deepEqual(afterFailedWrite, beforeFailedWrite);
      console.log(
        'PASS event failure rolls back its business write; redaction and bounds are explicit',
      );

      const relatedIds = [randomUUID(), randomUUID(), randomUUID()] as const;
      await owner.query('BEGIN');
      await setPgContext(owner, 1, relatedIds);
      const matterId = (
        await owner.query<{ id: number }>(
          `INSERT INTO matters(subject,status) VALUES('__task33b_matter__','active') RETURNING id`,
        )
      ).rows[0]!.id;
      const relationshipId = (
        await owner.query<{ id: number }>(
          `INSERT INTO matter_lawyers(matter_id,person_id,role,position)
           VALUES($1,1,'lead',1) RETURNING id`,
          [matterId],
        )
      ).rows[0]!.id;
      await owner.query(`UPDATE matter_lawyers SET position=2 WHERE id=$1`, [relationshipId]);
      await owner.query(`DELETE FROM matter_lawyers WHERE id=$1`, [relationshipId]);
      await owner.query('COMMIT');
      const related = await owner.query<{ action: string; request_id: string }>(
        `SELECT action,request_id::text FROM audit_events
          WHERE request_id=$1 ORDER BY id`,
        [relatedIds[0]],
      );
      assert.deepEqual(
        related.rows.map((row) => row.action),
        ['record_created', 'relationship_added', 'relationship_updated', 'relationship_removed'],
      );
      assert.ok(related.rows.every((row) => row.request_id === relatedIds[0]));

      const leakedIds = [randomUUID(), randomUUID(), randomUUID()] as const;
      await runtime.query('BEGIN');
      await setPgContext(runtime, 1, leakedIds);
      await runtime.query(
        `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
         VALUES(30002,'__task33b_context_one__',30002,true)`,
      );
      await runtime.query('COMMIT');
      const beforeMissingContext = (
        await owner.query<{ events: string; rows: string }>(`
          SELECT (SELECT count(*)::text FROM audit_events) events,
                 (SELECT count(*)::text FROM lookup_importance WHERE id=30003) rows`)
      ).rows[0]!;
      await runtime.query('BEGIN');
      await runtime.query('SELECT audit_set_human_context(1)');
      await rejects(
        () =>
          runtime.query(
            `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
             VALUES(30003,'__task33b_context_missing__',30003,true)`,
          ),
        /Explicit transaction-local audit event context is required/u,
      );
      await runtime.query('ROLLBACK');
      assert.deepEqual(
        (
          await owner.query<{ events: string; rows: string }>(`
            SELECT (SELECT count(*)::text FROM audit_events) events,
                   (SELECT count(*)::text FROM lookup_importance WHERE id=30003) rows`)
        ).rows[0],
        beforeMissingContext,
      );

      await runtime.query('BEGIN');
      await runtime.query('SELECT audit_set_authentication_context()');
      await rejects(
        () =>
          runtime.query(
            `SELECT audit_append_semantic_event_for_account(
              'login_failed','failed','public','user_accounts','{"id":1}',1,
              'IHamdy',NULL,'{}','password_incorrect','{}')`,
          ),
        /Explicit transaction-local audit event context is required/u,
      );
      await runtime.query('ROLLBACK');

      const replacementIds = [randomUUID(), randomUUID(), randomUUID()] as const;
      await runtime.query('BEGIN');
      await setPgContext(runtime, 1, replacementIds);
      await runtime.query(
        `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
         VALUES(30003,'__task33b_context_two__',30003,true)`,
      );
      await runtime.query('COMMIT');
      const contexts = await owner.query<{
        entity_id: string;
        request_id: string;
        audit_session_id: string;
      }>(`
        SELECT entity_key->>'id' entity_id,request_id::text,audit_session_id::text
          FROM audit_events WHERE entity_table='lookup_importance'
            AND entity_key IN ('{"id":30002}','{"id":30003}') ORDER BY id`);
      assert.equal(contexts.rows.length, 2);
      assert.equal(contexts.rows[0]?.request_id, leakedIds[0]);
      assert.equal(contexts.rows[1]?.request_id, replacementIds[0]);
      assert.equal(contexts.rows[1]?.audit_session_id, replacementIds[2]);
      console.log(
        'PASS missing human/authentication request metadata rolls writes back; request/session context cannot leak across transactions',
      );

      const metadata = createRequestAuditMetadata(
        new Request('http://localhost/audit-fixture', {
          headers: { 'user-agent': 'Task33B contract fixture' },
        }),
      );

      const futureActorIds = [randomUUID(), randomUUID(), randomUUID()] as const;
      await owner.query('BEGIN');
      await owner.query('SELECT audit_set_migration_context()');
      await owner.query('SELECT audit_set_event_context($1,$2,$3,NULL,$4,$5)', [
        ...futureActorIds,
        'Task 3.3B non-arithmetic actor fixture',
        'system',
      ]);
      const interveningActorId = (
        await owner.query<{ id: number }>(`
          INSERT INTO audit_actors(
            id,actor_key,actor_kind,user_account_id,identity_label,purpose
          ) VALUES (
            nextval('audit_actors_id_seq'),'system_review_intervening','system',NULL,
            'Review fixture intervening actor','Task 3.3B target-resolution fixture'
          ) RETURNING id`)
      ).rows[0]!.id;
      const futurePersonId = (
        await owner.query<{ id: number }>(`
          INSERT INTO people(
            name_ar,name_en,is_staff,is_active,is_trainee,can_login,updated_at,
            is_application_native
          ) VALUES (
            'TASK33B REVIEW FIXTURE','Task 3.3B review fixture',true,true,false,true,
            CURRENT_TIMESTAMP,true
          ) RETURNING id`)
      ).rows[0]!.id;
      const futureAccountId = (
        await owner.query<{ id: number }>(
          `
          INSERT INTO user_accounts(
            id,person_id,username,username_normalized,role_code,updated_at
          ) VALUES (
            nextval('user_accounts_id_seq'),$1,'ReviewFixture','reviewfixture','Lawyer',
            CURRENT_TIMESTAMP
          ) RETURNING id`,
          [futurePersonId],
        )
      ).rows[0]!.id;
      const futureAuditActorId = (
        await owner.query<{ id: number }>(
          `
          INSERT INTO audit_actors(
            id,actor_key,actor_kind,user_account_id,identity_label,purpose
          ) VALUES (
            nextval('audit_actors_id_seq'),'user_account:' || $1::integer,'human',$1::integer,
            'ReviewFixture (fixture account)','Authenticated application account'
          ) RETURNING id`,
          [futureAccountId],
        )
      ).rows[0]!.id;
      await owner.query('COMMIT');
      assert.equal(futureAccountId, 5);
      assert.ok(interveningActorId >= 2000);
      assert.equal(futureAuditActorId, interveningActorId + 1);
      assert.notEqual(futureAuditActorId, interveningActorId);
      assert.notEqual(futureAuditActorId, 1000 + futureAccountId);
      const futureAccountCreation = (
        await owner.query<{ after_values: Record<string, unknown>; entity_key: unknown }>(
          `
          SELECT after_values,entity_key FROM audit_events
           WHERE entity_table='user_accounts'
             AND entity_key=jsonb_build_object('id',$1::integer)
             AND action='record_created' ORDER BY id DESC LIMIT 1`,
          [futureAccountId],
        )
      ).rows[0]!;
      assert.deepEqual(futureAccountCreation.entity_key, { id: futureAccountId });
      assert.ok(!('username_normalized' in futureAccountCreation.after_values));

      await runtimePrisma.$transaction(async (transaction) => {
        await setAuthenticationAuditContext(transaction, metadata);
        await recordLoginFailed(transaction, {
          attemptedUsername: 'ReviewFixture',
          targetAccountId: futureAccountId,
          outcome: 'failed',
          reasonCode: 'password_incorrect',
        });
      });
      const resolvedFutureTarget = (
        await owner.query<{ target_actor_id: number }>(
          `
          SELECT target_actor_id FROM audit_events
           WHERE action='login_failed' AND entity_key=jsonb_build_object('id',$1::integer)
           ORDER BY id DESC LIMIT 1`,
          [futureAccountId],
        )
      ).rows[0]!.target_actor_id;
      assert.equal(resolvedFutureTarget, futureAuditActorId);
      console.log(
        'PASS target-account gateway resolves the immutable actor relationship without runtime audit_actors access',
      );

      const databaseActions = ['archive', 'restore'] as const;
      for (const action of databaseActions) {
        const result = await runAuditedDatabaseOperation(
          runtimePrisma,
          1,
          metadata,
          async (): Promise<AuditedDatabaseOperationResult<string>> => ({
            result: action,
            event: {
              action,
              outcome: 'succeeded',
              entity: { schema: 'public', table: 'matters', key: { id: matterId } },
            },
          }),
        );
        assert.equal(result, action);
      }
      const externalActions = [
        'report_executed',
        'export_completed',
        'download_completed',
      ] as const;
      for (const action of externalActions) {
        const eventId = await recordObservedExternalEvent(runtimePrisma, 1, metadata, {
          action,
          outcome: 'succeeded',
          resourceIdentifier: `task33b-${action}`,
        });
        assert.ok(eventId > 0n);
      }
      const atomicLabel = '__task33b_contract_atomic__';
      await assert.rejects(
        runAuditedDatabaseOperation(runtimePrisma, 1, metadata, async (transaction) => {
          await transaction.lookupImportance.update({
            where: { id: 30003 },
            data: { labelAr: atomicLabel },
          });
          return {
            result: null,
            event: {
              action: 'role_changed',
              outcome: 'succeeded',
            },
          };
        }),
        /lifecycle actor or shape is invalid/u,
      );
      assert.notEqual(
        (await owner.query(`SELECT label_ar FROM lookup_importance WHERE id=30003`)).rows[0]
          .label_ar,
        atomicLabel,
      );
      console.log(
        'PASS record lifecycle contracts are atomic; account lifecycle has its separate strict gateway; three external facts append only after a server-observed emission point',
      );

      const benchmarkIds = [randomUUID(), randomUUID(), randomUUID()] as const;
      await owner.query('BEGIN');
      await owner.query('SELECT audit_set_migration_context()');
      await owner.query('SELECT audit_set_event_context($1,$2,$3,NULL,NULL,$4)', [
        ...benchmarkIds,
        'system',
      ]);
      const insertPlan = (
        await owner.query<{ 'QUERY PLAN': unknown }>(`
          EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
          SELECT audit_write_event(
            'record_updated','succeeded','public','matters',
            jsonb_build_object('id',(sample % 100)+1),ARRAY['status'],
            jsonb_build_object('status','before'),jsonb_build_object('status','after'),
            NULL,NULL,NULL,'{}',NULL,jsonb_build_object('fixture','realistic_volume'))
          FROM generate_series(1,45463) sample`)
      ).rows[0]!['QUERY PLAN'] as Array<Record<string, unknown>>;
      await owner.query('COMMIT');
      await owner.query('ANALYZE audit_events');
      const insertionMs = Number(insertPlan[0]?.['Execution Time']);
      assert.ok(Number.isFinite(insertionMs) && insertionMs > 0);

      const entityPlan = (
        await owner.query<{ 'QUERY PLAN': unknown }>(`
          EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
          SELECT id,occurred_at FROM audit_events
           WHERE entity_schema='public' AND entity_table='matters'
             AND entity_key='{"id":42}'
           ORDER BY occurred_at DESC,id DESC LIMIT 50`)
      ).rows[0]!['QUERY PLAN'] as Array<Record<string, unknown>>;
      assert.ok(hasIndexName(entityPlan, 'audit_events_entity_newest_idx'));
      const retrievalMs = Number(entityPlan[0]?.['Execution Time']);
      assert.ok(Number.isFinite(retrievalMs) && retrievalMs >= 0);

      const allIds: string[] = [];
      let cursor: { cursor_time: string; id: string } | undefined;
      while (true) {
        const page = await owner.query<{ cursor_time: string; id: string }>(
          `SELECT e.occurred_at::text AS cursor_time,e.id::text AS id FROM audit_events e
            WHERE e.entity_schema='public' AND e.entity_table='matters'
              AND e.entity_key='{"id":42}'
              AND ($1::timestamptz IS NULL OR (e.occurred_at,e.id)<($1,$2::bigint))
            ORDER BY e.occurred_at DESC,e.id DESC LIMIT 37`,
          [cursor?.cursor_time ?? null, cursor?.id ?? null],
        );
        if (page.rows.length === 0) break;
        allIds.push(...page.rows.map((row) => row.id));
        cursor = page.rows.at(-1);
      }
      const expectedIds = (
        await owner.query<{ id: string }>(`
          SELECT e.id::text AS id FROM audit_events e WHERE e.entity_schema='public'
            AND e.entity_table='matters' AND e.entity_key='{"id":42}'
          ORDER BY e.occurred_at DESC,e.id DESC`)
      ).rows.map((row) => row.id);
      assert.deepEqual(allIds, expectedIds);
      assert.equal(new Set(allIds).size, allIds.length);
      console.log(
        `PASS realistic 45,463-event append benchmark ${insertionMs.toFixed(1)} ms; indexed 50-row entity retrieval ${retrievalMs.toFixed(3)} ms`,
      );
      console.log('PASS keyset pagination across equal timestamps has no duplicates or gaps');

      const snapshotBefore = (
        await owner.query<{ role: string }>(`
          SELECT actor_role_snapshot role FROM audit_events
           WHERE actor_id=1001 AND action='record_created' ORDER BY id LIMIT 1`)
      ).rows[0]!.role;
      await owner.query('BEGIN');
      await setPgContext(owner, 1, [randomUUID(), randomUUID(), randomUUID()]);
      await owner.query(
        `UPDATE user_accounts SET role_code='Paralegal',session_version=session_version+1 WHERE id=1`,
      );
      const snapshotDuring = (
        await owner.query<{ role: string }>(`
          SELECT actor_role_snapshot role FROM audit_events
           WHERE actor_id=1001 AND action='record_created' ORDER BY id LIMIT 1`)
      ).rows[0]!.role;
      await owner.query('ROLLBACK');
      assert.equal(snapshotBefore, 'Lawyer');
      assert.equal(snapshotDuring, snapshotBefore);

      assert.deepEqual(await auditEventStructureFailures(owner), []);
      assert.deepEqual(await auditEventDataFailures(owner), []);
      const currentDigest = await auditEventDigest(owner);
      assert.match(currentDigest, /^[0-9a-f]{64}$/u);
      console.log(
        `PASS actor/role snapshots remain immutable; disposable event digest ${currentDigest}`,
      );
    } finally {
      await runtimePrisma.$disconnect();
      await runtime.end();
      await owner.end();
    }
  } finally {
    if (created) {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
        [fixtureName],
      );
      await admin.query(`DROP DATABASE ${identifier(fixtureName)}`);
    }
    await admin.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
