import type { ClientBase } from 'pg';
import { AUDITED_TABLES, RUNTIME_DATABASE_ROLE } from './audit-structure';

export const TASK33B_MIGRATION = '20260902180000_append_only_audit_events';
export const TASK33B_CORRECTION_MIGRATION = '20260903100000_close_task33b_review_gaps';
export const TASK33B_CHECKPOINT = 'task_3_3b_baseline';
export const TASK33B_ALLOWLIST_DIGEST =
  '9e271a6e23bc03e55223db3c0a9be1b0e34867da0af8c6f0acab5614506de11b';
export const TASK33B_CLASSIFICATION_DIGEST =
  '4ebad0a7bc5862dbd537abac05727f4968598c3b30336ee8e9236ba6b653bf0d';

const EVENT_TABLES = [
  'audit_event_checkpoints',
  'audit_event_fields',
  'audit_event_table_rules',
  'audit_events',
] as const;

const EVENT_COLUMNS = [
  'action',
  'actor_display_name_snapshot',
  'actor_id',
  'actor_key_snapshot',
  'actor_role_snapshot',
  'actor_username_snapshot',
  'after_values',
  'attempted_username',
  'attempted_username_truncated',
  'audit_session_id',
  'before_values',
  'changed_fields',
  'correlation_id',
  'device_class',
  'entity_key',
  'entity_schema',
  'entity_table',
  'event_metadata',
  'event_version',
  'id',
  'ip_address',
  'occurred_at',
  'outcome',
  'parameters',
  'reason_code',
  'request_id',
  'resource_identifier',
  'target_actor_id',
  'target_actor_key_snapshot',
  'target_display_name_snapshot',
  'target_role_snapshot',
  'target_username_snapshot',
  'user_agent',
  'user_agent_truncated',
] as const;

const FIELD_RULE_COLUMNS = [
  'capture_mode',
  'classification_reason',
  'entity_schema',
  'entity_table',
  'field_name',
  'max_text_characters',
] as const;

const EVENT_INDEXES = [
  'audit_events_action_outcome_newest_idx',
  'audit_events_actor_newest_idx',
  'audit_events_correlation_idx',
  'audit_events_entity_newest_idx',
  'audit_events_pkey',
  'audit_events_request_idx',
  'audit_events_single_baseline_idx',
  'audit_events_time_newest_idx',
] as const;

const SECURITY_DEFINER_FUNCTIONS = new Set([
  'audit_append_semantic_event',
  'audit_append_semantic_event_for_account',
  'audit_capture_row_event',
  'audit_ensure_event_context',
  'audit_set_event_context',
  'audit_write_event',
  'refuse_audit_event_change',
]);

const EVENT_FUNCTIONS = [
  'audit_append_semantic_event',
  'audit_append_semantic_event_for_account',
  'audit_bound_json_value',
  'audit_capture_row_event',
  'audit_contains_secret_pattern',
  'audit_ensure_event_context',
  'audit_safe_flat_object',
  'audit_set_event_context',
  'audit_write_event',
  'refuse_audit_event_change',
] as const;

const RUNTIME_EVENT_GATEWAYS = [
  'audit_append_semantic_event_for_account',
  'audit_set_event_context',
] as const;

const CORRECTION_FUNCTION_MD5 = new Map([
  ['audit_append_semantic_event', 'c3bcb052c3094540c0e63cde35e29b2b'],
  ['audit_append_semantic_event_for_account', '5628bb7316726abbd755fe13ecf9dcd6'],
  ['audit_capture_row_event', '483ecdff146cbd0a5f3906e6e8ec891a'],
  ['audit_ensure_event_context', 'e4c5e1d72a5f1366825e3a452ccf0ee1'],
]);

const EVENT_ACTION_CONSTRAINT =
  "CHECK ((action = ANY (ARRAY['record_created'::text, 'record_updated'::text, 'relationship_added'::text, 'relationship_updated'::text, 'relationship_removed'::text, 'login_succeeded'::text, 'login_failed'::text, 'account_locked'::text, 'password_changed'::text, 'password_initialized'::text, 'password_reset'::text, 'archive'::text, 'restore'::text, 'account_created'::text, 'account_enabled'::text, 'account_disabled'::text, 'username_changed'::text, 'role_changed'::text, 'report_executed'::text, 'export_completed'::text, 'download_completed'::text, 'audit_baseline_established'::text])))";

const FIELD_RULE_CONSTRAINTS = new Map([
  [
    'audit_event_fields_bound',
    "CHECK ((((capture_mode = ANY (ARRAY['value'::text, 'redacted'::text])) AND ((max_text_characters >= 64) AND (max_text_characters <= 2048))) OR ((capture_mode = ANY (ARRAY['entity_key'::text, 'structural'::text, 'excluded'::text])) AND (max_text_characters = 0))))",
  ],
  [
    'audit_event_fields_capture_mode',
    "CHECK ((capture_mode = ANY (ARRAY['value'::text, 'redacted'::text, 'entity_key'::text, 'structural'::text, 'excluded'::text])))",
  ],
  ['audit_event_fields_name_shape', "CHECK ((field_name ~ '^[a-z][a-z0-9_]{0,62}$'::text))"],
  ['audit_event_fields_pkey', 'PRIMARY KEY (entity_schema, entity_table, field_name)'],
  [
    'audit_event_fields_reason_shape',
    "CHECK (((classification_reason ~ '^[a-z][a-z0-9_]{2,127}$'::text) AND (classification_reason <> ALL (ARRAY['excluded'::text, 'other'::text, 'unknown'::text]))))",
  ],
  [
    'audit_event_fields_table_fkey',
    'FOREIGN KEY (entity_schema, entity_table) REFERENCES audit_event_table_rules(entity_schema, entity_table) ON UPDATE RESTRICT ON DELETE RESTRICT',
  ],
]);

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function auditEventStructureFailures(
  db: ClientBase,
  runtimeRole = RUNTIME_DATABASE_ROLE,
): Promise<string[]> {
  const failures: string[] = [];

  const tables = await db.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name LIKE 'audit_event%'
     ORDER BY table_name`);
  if (
    !same(
      tables.rows.map((row) => row.table_name),
      EVENT_TABLES,
    )
  ) {
    failures.push('audit-event table inventory differs');
  }

  const columns = await db.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='audit_events'
     ORDER BY column_name`);
  if (
    !same(
      columns.rows.map((row) => row.column_name),
      EVENT_COLUMNS,
    )
  ) {
    failures.push('audit_events column inventory differs');
  }
  const eventActionConstraint = await db.query<{ definition: string }>(`
    SELECT pg_get_constraintdef(oid) definition
      FROM pg_constraint
     WHERE conrelid='public.audit_events'::regclass
       AND conname='audit_events_action_shape'`);
  if (
    eventActionConstraint.rows.length !== 1 ||
    eventActionConstraint.rows[0]?.definition !== EVENT_ACTION_CONSTRAINT
  ) {
    failures.push('audit_events approved action constraint differs');
  }

  const fieldRuleColumns = await db.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='audit_event_fields'
     ORDER BY column_name`);
  if (
    !same(
      fieldRuleColumns.rows.map((row) => row.column_name),
      FIELD_RULE_COLUMNS,
    )
  ) {
    failures.push('audit_event_fields column inventory differs');
  }
  const fieldRuleConstraints = await db.query<{ name: string; definition: string }>(`
    SELECT conname name,pg_get_constraintdef(oid) definition
      FROM pg_constraint
     WHERE conrelid='public.audit_event_fields'::regclass
     ORDER BY conname`);
  if (
    fieldRuleConstraints.rows.length !== FIELD_RULE_CONSTRAINTS.size ||
    fieldRuleConstraints.rows.some((row) => FIELD_RULE_CONSTRAINTS.get(row.name) !== row.definition)
  ) {
    failures.push('audit_event_fields constraint inventory/definitions differ');
  }

  const keyColumns = await db.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    maximum_length: number | null;
  }>(`
    SELECT column_name,data_type,is_nullable,character_maximum_length maximum_length
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='audit_events'
       AND column_name IN ('id','occurred_at','actor_id','entity_key','before_values',
                           'after_values','request_id','correlation_id','audit_session_id',
                           'ip_address','user_agent','device_class','attempted_username',
                           'resource_identifier','parameters','event_metadata')
     ORDER BY column_name`);
  const expectedTypes = new Map<string, readonly [string, string, number | null]>([
    ['actor_id', ['integer', 'NO', null]],
    ['after_values', ['jsonb', 'NO', null]],
    ['attempted_username', ['character varying', 'YES', 64]],
    ['audit_session_id', ['uuid', 'NO', null]],
    ['before_values', ['jsonb', 'NO', null]],
    ['correlation_id', ['uuid', 'NO', null]],
    ['device_class', ['character varying', 'NO', 32]],
    ['entity_key', ['jsonb', 'YES', null]],
    ['event_metadata', ['jsonb', 'NO', null]],
    ['id', ['bigint', 'NO', null]],
    ['ip_address', ['inet', 'YES', null]],
    ['occurred_at', ['timestamp with time zone', 'NO', null]],
    ['parameters', ['jsonb', 'NO', null]],
    ['request_id', ['uuid', 'NO', null]],
    ['resource_identifier', ['character varying', 'YES', 256]],
    ['user_agent', ['character varying', 'YES', 512]],
  ]);
  for (const [name, expected] of expectedTypes) {
    const row = keyColumns.rows.find((candidate) => candidate.column_name === name);
    if (
      !row ||
      row.data_type !== expected[0] ||
      row.is_nullable !== expected[1] ||
      row.maximum_length !== expected[2]
    ) {
      failures.push(`audit_events.${name} type/bound/nullability differs`);
    }
  }

  const indexes = await db.query<{ index_name: string; definition: string }>(`
    SELECT i.relname index_name,pg_get_indexdef(i.oid) definition
      FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class i ON i.oid=x.indexrelid
     WHERE n.nspname='public' AND t.relname='audit_events'
       AND x.indisvalid AND x.indisready ORDER BY i.relname`);
  if (
    !same(
      indexes.rows.map((row) => row.index_name),
      EVENT_INDEXES,
    )
  ) {
    failures.push('audit_events index inventory differs');
  }
  if (indexes.rows.some((row) => / USING gin /iu.test(row.definition))) {
    failures.push('audit_events has an unrestricted JSON GIN index');
  }
  for (const fragment of [
    'entity_schema, entity_table, entity_key, occurred_at DESC, id DESC',
    'actor_id, occurred_at DESC, id DESC',
    'occurred_at DESC, id DESC',
    'action, outcome, occurred_at DESC, id DESC',
    'request_id, occurred_at, id',
    'correlation_id, occurred_at, id',
  ]) {
    if (!indexes.rows.some((row) => row.definition.includes(fragment))) {
      failures.push(`audit_events keyset index missing: ${fragment}`);
    }
  }

  const ruleRows = await db.query<{ entity_table: string }>(`
    SELECT entity_table FROM audit_event_table_rules ORDER BY entity_table`);
  if (
    !same(
      ruleRows.rows.map((row) => row.entity_table),
      AUDITED_TABLES,
    )
  ) {
    failures.push('audit-event exact 38-table rule inventory differs');
  }
  const unsafeFields = await db.query<{ count: string }>(`
    SELECT count(*)::text count FROM audit_event_fields f
    JOIN audit_event_table_rules r
      ON r.entity_schema=f.entity_schema AND r.entity_table=f.entity_table
    LEFT JOIN information_schema.columns c
      ON c.table_schema=f.entity_schema AND c.table_name=f.entity_table
     AND c.column_name=f.field_name
    WHERE c.column_name IS NULL
       OR (f.capture_mode IN ('value','redacted') AND (
           c.data_type IN ('bytea','json','jsonb')
           OR f.field_name LIKE 'legacy_%'
           OR f.field_name IN ('legacy_source_payload','next_attendance_raw',
                               'created_at','created_by','updated_at','updated_by')
       ))
       OR (f.field_name='password_hash' AND f.capture_mode<>'redacted')
       OR (f.capture_mode='redacted' AND NOT (
           f.entity_table='user_accounts' AND f.field_name='password_hash'))
       OR (f.capture_mode='entity_key' AND NOT f.field_name=ANY(r.key_fields))
       OR (f.capture_mode='structural' AND f.field_name NOT IN
           ('created_at','created_by','updated_at','updated_by'))
       OR (f.capture_mode IN ('entity_key','structural','excluded')
           AND f.max_text_characters<>0)
       OR (f.capture_mode IN ('value','redacted')
           AND f.classification_reason<>'frozen_task_3_3b_baseline_rule')`);
  if (unsafeFields.rows[0]?.count !== '0') failures.push('audit field classification is unsafe');
  const coverage = await db.query<{ unclassified: string; stale: string }>(`
    SELECT
      (SELECT count(*)::text FROM information_schema.columns c
        JOIN audit_event_table_rules r
          ON r.entity_schema=c.table_schema AND r.entity_table=c.table_name
        LEFT JOIN audit_event_fields f
          ON f.entity_schema=c.table_schema AND f.entity_table=c.table_name
         AND f.field_name=c.column_name
       WHERE f.field_name IS NULL) unclassified,
      (SELECT count(*)::text FROM audit_event_fields f
        LEFT JOIN information_schema.columns c
          ON c.table_schema=f.entity_schema AND c.table_name=f.entity_table
         AND c.column_name=f.field_name
       WHERE c.column_name IS NULL) stale`);
  if (coverage.rows[0]?.unclassified !== '0' || coverage.rows[0]?.stale !== '0') {
    failures.push('audited-table column classification is not exhaustive and exact');
  }
  const fieldShape = await db.query<{
    field_count: string;
    baseline_field_count: string;
    password_rule_count: string;
    allowlist_digest: string;
    checkpoint_digest: string;
    classification_digest: string;
  }>(`
    SELECT count(*)::text field_count,
      count(*) FILTER(WHERE capture_mode IN ('value','redacted'))::text baseline_field_count,
      count(*) FILTER(WHERE entity_table='user_accounts' AND field_name='password_hash'
                       AND capture_mode='redacted')::text password_rule_count,
      encode(sha256(convert_to(string_agg(
        entity_schema||E'\\x1f'||entity_table||E'\\x1f'||field_name||E'\\x1f'||
        max_text_characters::text||E'\\x1f'||capture_mode,
        E'\\n' ORDER BY entity_schema,entity_table,field_name)
        FILTER(WHERE capture_mode IN ('value','redacted')),'UTF8')),'hex') allowlist_digest,
      (SELECT allowlist_digest::text FROM audit_event_checkpoints
        WHERE checkpoint_key='task_3_3b_baseline') checkpoint_digest,
      encode(sha256(convert_to(string_agg(
        entity_schema||E'\\x1f'||entity_table||E'\\x1f'||field_name||E'\\x1f'||
        max_text_characters::text||E'\\x1f'||capture_mode||E'\\x1f'||classification_reason,
        E'\\n' ORDER BY entity_schema,entity_table,field_name),'UTF8')),'hex')
        classification_digest
      FROM audit_event_fields`);
  const fieldEvidence = fieldShape.rows[0];
  if (
    fieldEvidence?.field_count !== '583' ||
    fieldEvidence.baseline_field_count !== '262' ||
    fieldEvidence.password_rule_count !== '1' ||
    fieldEvidence.allowlist_digest !== fieldEvidence.checkpoint_digest ||
    fieldEvidence.allowlist_digest !== TASK33B_ALLOWLIST_DIGEST ||
    fieldEvidence.classification_digest !== TASK33B_CLASSIFICATION_DIGEST
  ) {
    failures.push('audit baseline allowlist or current classification evidence differs');
  }

  const captureTriggers = await db.query<{ table_name: string; definition: string }>(`
    SELECT c.relname table_name,pg_get_triggerdef(t.oid,true) definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND t.tgname='audit_event_capture'
       AND NOT t.tgisinternal AND t.tgenabled='O' ORDER BY c.relname`);
  if (
    !same(
      captureTriggers.rows.map((row) => row.table_name),
      AUDITED_TABLES,
    )
  ) {
    failures.push('enabled audit-event row trigger inventory differs');
  }
  for (const row of captureTriggers.rows) {
    const relationship = [
      'fee_letter_matters',
      'hearing_attendees',
      'invoice_allocations',
      'matter_fee_letter_references',
      'matter_lawyers',
      'matter_parties',
      'matter_party_roles',
      'power_of_attorney_lawyers',
    ].includes(row.table_name);
    if (
      !row.definition.includes(
        relationship ? 'AFTER INSERT OR DELETE OR UPDATE' : 'AFTER INSERT OR UPDATE',
      ) ||
      !row.definition.endsWith('EXECUTE FUNCTION audit_capture_row_event()')
    ) {
      failures.push(`${row.table_name}: audit-event trigger definition differs`);
    }
  }

  const immutableTriggers = await db.query<{ table_name: string; count: string }>(
    `
    SELECT c.relname table_name,count(*)::text count
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=ANY($1::text[])
       AND NOT t.tgisinternal AND t.tgenabled='O'
       AND t.tgname IN (c.relname||'_no_change',c.relname||'_no_truncate')
     GROUP BY c.relname ORDER BY c.relname`,
    [EVENT_TABLES],
  );
  if (
    immutableTriggers.rows.length !== 4 ||
    immutableTriggers.rows.some((row) => row.count !== '2')
  ) {
    failures.push('audit-event immutability trigger inventory differs');
  }

  const functions = await db.query<{
    name: string;
    security_definer: boolean;
    configuration: string[] | null;
    runtime_execute: boolean;
    public_execute: boolean;
    definition_md5: string;
  }>(
    `
    SELECT p.proname name,p.prosecdef security_definer,p.proconfig configuration,
           md5(pg_get_functiondef(p.oid)) definition_md5,
           has_function_privilege($1,p.oid,'EXECUTE') runtime_execute,
           EXISTS (
             SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
           ) public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=ANY($2::text[]) ORDER BY p.proname`,
    [runtimeRole, EVENT_FUNCTIONS],
  );
  if (
    !same(
      functions.rows.map((row) => row.name),
      EVENT_FUNCTIONS,
    )
  ) {
    failures.push('audit-event function inventory differs');
  }
  for (const row of functions.rows) {
    const shouldDefine = SECURITY_DEFINER_FUNCTIONS.has(row.name);
    const shouldExecute = RUNTIME_EVENT_GATEWAYS.includes(row.name as never);
    if (
      row.security_definer !== shouldDefine ||
      !same(row.configuration ?? [], ['search_path=pg_catalog, public, pg_temp']) ||
      row.runtime_execute !== shouldExecute ||
      row.public_execute ||
      (CORRECTION_FUNCTION_MD5.has(row.name) &&
        CORRECTION_FUNCTION_MD5.get(row.name) !== row.definition_md5)
    ) {
      failures.push(`${row.name}: security/search-path/execute boundary differs`);
    }
  }

  const relationPrivileges = await db.query<{
    relation_name: string;
    any_privilege: boolean;
    owner_name: string;
  }>(
    `
    SELECT c.relname relation_name,c.relowner::regrole::text owner_name,
      has_table_privilege($1,c.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') any_privilege
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=ANY($2::text[]) AND c.relkind='r'
     ORDER BY c.relname`,
    [runtimeRole, EVENT_TABLES],
  );
  if (
    relationPrivileges.rows.length !== 4 ||
    relationPrivileges.rows.some((row) => row.any_privilege) ||
    new Set(relationPrivileges.rows.map((row) => row.owner_name)).size !== 1
  ) {
    failures.push('runtime audit-event relation privilege/ownership boundary differs');
  }
  const sequencePrivilege = await db.query<{ any_privilege: boolean }>(
    `
    SELECT has_sequence_privilege($1,'public.audit_events_id_seq',
      'USAGE,SELECT,UPDATE') any_privilege`,
    [runtimeRole],
  );
  if (sequencePrivilege.rows[0]?.any_privilege !== false) {
    failures.push('runtime can access the audit-event identity sequence');
  }

  return failures;
}

export async function auditEventDigest(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(
      (to_jsonb(e)-'occurred_at')::text,E'\\n' ORDER BY e.id),''),'UTF8')),'hex') digest
      FROM audit_events e`);
  return result.rows[0]?.digest ?? '';
}

export async function auditEventDataFailures(
  db: ClientBase,
  options: { historicalLive?: boolean } = {},
): Promise<string[]> {
  const failures: string[] = [];
  const checkpoint = await db.query<{
    checkpoint_count: string;
    baseline_count: string;
    event_count: string;
    first_event_id: string;
    through_event_id: string;
    event_digest: string;
    recomputed_digest: string;
    profile: string;
  }>(
    `
    SELECT
      (SELECT count(*)::text FROM audit_event_checkpoints) checkpoint_count,
      (SELECT count(*)::text FROM audit_events
        WHERE action='audit_baseline_established') baseline_count,
      c.event_count::text,c.first_event_id::text,c.through_event_id::text,
      c.event_digest::text,
      encode(sha256(convert_to((to_jsonb(e)-'occurred_at')::text,'UTF8')),'hex') recomputed_digest,
      c.baseline_profile profile
      FROM audit_event_checkpoints c JOIN audit_events e ON e.id=c.first_event_id
     WHERE c.checkpoint_key=$1 AND c.migration_name=$2`,
    [TASK33B_CHECKPOINT, TASK33B_MIGRATION],
  );
  const row = checkpoint.rows[0];
  if (
    checkpoint.rows.length !== 1 ||
    !row ||
    row.checkpoint_count !== '1' ||
    row.baseline_count !== '1' ||
    row.event_count !== '1' ||
    row.first_event_id !== row.through_event_id ||
    row.event_digest !== row.recomputed_digest ||
    row.profile !== (options.historicalLive ? 'historical-live' : 'canonical-clean-replay')
  ) {
    failures.push('audit baseline/checkpoint count, profile or digest differs');
  }
  const baseline = await db.query<{
    actor_key: string;
    action: string;
    outcome: string;
    metadata: Record<string, unknown>;
    is_first: boolean;
  }>(`
    SELECT e.actor_key_snapshot actor_key,e.action,e.outcome,e.event_metadata metadata,
           e.id=(SELECT min(id) FROM audit_events) is_first
      FROM audit_events e WHERE e.action='audit_baseline_established'`);
  const baselineRow = baseline.rows[0];
  if (
    !baselineRow ||
    baselineRow.actor_key !== 'system_migration' ||
    baselineRow.outcome !== 'succeeded' ||
    !baselineRow.is_first ||
    baselineRow.metadata['access_history_available'] !== false ||
    baselineRow.metadata['migrations_applied_before'] !== 56
  ) {
    failures.push('audit baseline truthfulness/ordering metadata differs');
  }
  if (options.historicalLive) {
    if (
      baselineRow?.metadata['created_attributions'] !== 45_463 ||
      baselineRow.metadata['updated_attributions'] !== 45_459 ||
      baselineRow.metadata['unknown_update_actors'] !== 4 ||
      baselineRow.metadata['protected_rows'] !== 5_209 ||
      baselineRow.metadata['protected_digest'] !==
        'b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab' ||
      baselineRow.metadata['attribution_digest'] !==
        'edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d' ||
      baselineRow.metadata['reconciliation_digest'] !==
        'c314cd64142cc2cef36b4dc8a35715db7660fed9d9aba2d06b383e86d2fa54ec'
    ) {
      failures.push('historical-live aggregate baseline evidence differs');
    }
  }

  const leaked = await db.query<{ count: string }>(`
    SELECT count(DISTINCT e.id)::text count FROM audit_events e
    CROSS JOIN LATERAL jsonb_array_elements_text(jsonb_path_query_array(
      jsonb_build_array(e.before_values,e.after_values,e.parameters,e.event_metadata),
      'strict $.** ? (@.type() == "string")')) value
    WHERE value ~* '(postgres(?:ql)?://|-----begin [a-z ]*private key-----|\\$argon2(?:id|i|d)\\$|bearer[[:space:]]|auth_secret|database_url|connection_string|api_key|private_key)'`);
  if (leaked.rows[0]?.count !== '0')
    failures.push('audit-event JSON contains a secret sentinel pattern');

  return failures;
}
