import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import { assertStaffConstraintsAndIndexes } from './staff-roster-catalog';
import {
  assertStaffCheckpoint,
  STAFF_FIELD_RULES,
  STAFF_RUNTIME_GATEWAYS,
  STAFF_TABLES,
  staffMigrationSql,
  type StaffProfile,
} from './staff-roster-checkpoint';

export type StaffInvariant = {
  id: string;
  description: string;
  scope: 'both';
  historicalArtifact: null;
  command: string;
  expected60: string;
  expected61: string;
};
export const STAFF_INVARIANTS: readonly StaffInvariant[] = [
  { id: 'STAFF-01', description: 'Exact profile and complete migration-60/61 ledger' },
  { id: 'STAFF-02', description: 'Immutable imported and native snapshot identity populations' },
  {
    id: 'STAFF-03',
    description:
      'Immutable business projections, actual roster snapshot and complete pre-boundary audit digests',
  },
  {
    id: 'STAFF-04',
    description: 'Imported alias spelling, normalized identity, owner, provenance and existence',
  },
  { id: 'STAFF-05', description: 'Fixed team identity and original reviewer evidence' },
  {
    id: 'STAFF-06',
    description: 'Current native/import classification and stable person identities',
  },
  {
    id: 'STAFF-07',
    description: 'Database versions, application provenance and audited full-row continuity',
  },
  { id: 'STAFF-08', description: 'Exactly one active canonical primary for every person' },
  {
    id: 'STAFF-09',
    description: 'Cross-table normalized identity domain has no different-owner collision',
  },
  {
    id: 'STAFF-10',
    description: 'Normalized non-null email shape and both uniqueness protections',
  },
  {
    id: 'STAFF-11',
    description: 'Current reviewer eligibility and enabled-account person eligibility',
  },
  {
    id: 'STAFF-12',
    description: 'Exact database code, immutable evidence guards and deferred constraints',
  },
  {
    id: 'STAFF-13',
    description:
      'Exact new audit field classifications; historical classifications preserved separately',
  },
  {
    id: 'STAFF-14',
    description: 'Source artifact presence or absence matches the declared profile exactly',
  },
].map((row) => ({
  ...row,
  scope: 'both' as const,
  historicalArtifact: null,
  command:
    'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>; tsx scripts/test-staff-roster.ts --profile-acceptance',
  expected60:
    'The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent.',
  expected61:
    'The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures.',
}));

const EXCLUDED_AUDIT_COLUMNS = "ARRAY['created_at','updated_at','created_by','updated_by']";
export const STAFF_ALIAS_BASELINES: Readonly<Record<StaffProfile, string>> = {
  'historical-full-state-upgrade':
    'a7466bda93ea6045822f55bed90e93f00561f3fc60dd2922cbb780d6d799091d',
  'canonical-clean-replay': '716fea9249b0faeda9285e3881bce60d9b5f5a73341a77b97d3dbec3e8eda6c8',
};

async function zero(db: ClientBase, sql: string, label: string): Promise<void> {
  const result = (await db.query<{ n: number }>(`SELECT count(*)::integer n FROM (${sql}) defects`))
    .rows;
  assert.equal(result[0]?.n, 0, label);
}

export async function assertStaffFunctions(db: ClientBase): Promise<void> {
  const expected = [
    ...staffMigrationSql().matchAll(
      /CREATE FUNCTION ([a-z_]+)\.([a-z_]+)\(([^)]*)\) RETURNS ([\s\S]*?)\s+LANGUAGE (sql|plpgsql)([\s\S]*?) AS \$\$([\s\S]*?)\$\$;/gu,
    ),
  ];
  assert.equal(
    expected.length,
    [...staffMigrationSql().matchAll(/CREATE FUNCTION /gu)].length,
    'unparsed Phase 1 function',
  );
  const functions = (
    await db.query<{
      schema: string;
      name: string;
      body: string;
      language: string;
      definer: boolean;
      volatility: string;
      strict: boolean;
      parallel: string;
      kind: string;
      configuration: string[];
      owner: string;
      public_execute: boolean;
      runtime_execute: boolean;
      signature: string;
    }>(`
    SELECT n.nspname schema,p.proname name,p.prosrc body,l.lanname language,p.prosecdef definer,p.provolatile volatility,
      p.proisstrict strict,p.proparallel parallel,p.prokind kind,p.proconfig configuration,pg_get_userbyid(p.proowner) owner,
      n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' signature,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
      has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE (n.nspname='public' AND p.proname LIKE 'staff_%') OR
      (n.nspname='_migration' AND (p.proname LIKE 'staff_%' OR p.proname IN ('lock_staff_roster','refuse_staff_evidence_change')))
  `)
  ).rows;
  assert.equal(functions.length, expected.length, 'extra, missing or overloaded staff function');
  for (const match of expected) {
    const rows = functions.filter((row) => row.schema === match[1] && row.name === match[2]);
    assert.equal(rows.length, 1, 'missing or overloaded staff function');
    const row = rows[0]!;
    assert.equal(
      row.body.trim().replaceAll('\r\n', '\n'),
      match[7]!.trim().replaceAll('\r\n', '\n'),
      `${row.name}: function body differs`,
    );
    assert.equal(row.language, match[5]);
    assert.equal(row.definer, true);
    assert.equal(row.volatility, 'v');
    assert.equal(row.strict, false);
    assert.equal(row.parallel, 'u');
    assert.equal(row.kind, 'f');
    assert.deepEqual(
      row.configuration,
      row.name === 'staff_json_row'
        ? ['search_path=pg_catalog, public', 'TimeZone=UTC']
        : ['search_path=pg_catalog, public'],
    );
    assert.equal(row.public_execute, false);
    assert.equal(row.runtime_execute, row.schema === 'public');
    assert.notEqual(row.owner, 'litigation_runtime');
  }
  assert.deepEqual(
    functions
      .filter((row) => row.runtime_execute)
      .map((row) => row.signature)
      .sort(),
    [...STAFF_RUNTIME_GATEWAYS].sort(),
  );
}

export async function assertStaffGuards(db: ClientBase): Promise<void> {
  await assertStaffConstraintsAndIndexes(db);
  const sql = staffMigrationSql();
  const definitions = [...sql.matchAll(/^CREATE (?:CONSTRAINT )?TRIGGER [^;]+;/gmu)].map(
    (match) => match[0],
  );
  for (const table of [
    'staff_roster_person',
    'staff_roster_alias',
    'staff_roster_team',
    'staff_roster_boundary',
  ])
    definitions.push(
      `CREATE TRIGGER staff_evidence_no_change BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON _migration.${table} FOR EACH STATEMENT EXECUTE FUNCTION _migration.refuse_staff_evidence_change();`,
    );
  for (const table of ['people', 'person_name_alias', 'lookup_team', 'user_accounts'])
    definitions.push(
      `CREATE TRIGGER aa_staff_roster_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.${table} FOR EACH STATEMENT EXECUTE FUNCTION _migration.staff_roster_statement_lock();`,
    );
  const expected = definitions.map((definition) => {
    const match =
      /^CREATE (CONSTRAINT )?TRIGGER (\w+) (BEFORE|AFTER) (.*?) ON (\w+)\.(\w+) (.*?)FOR EACH (ROW|STATEMENT) EXECUTE FUNCTION (\w+)\.(\w+)\(\);$/u.exec(
        definition,
      );
    assert.ok(match, 'Unparsed staff trigger');
    const events = match[4]!;
    const columns = /UPDATE OF (\w+(?:,\s*\w+)*)/u.exec(events)?.[1]?.split(/,\s*/u) ?? [];
    return {
      schema: match[5],
      table: match[6],
      name: match[2],
      type:
        (match[8] === 'ROW' ? 1 : 0) +
        (match[3] === 'BEFORE' ? 2 : 0) +
        (/\bINSERT\b/u.test(events) ? 4 : 0) +
        (/\bDELETE\b/u.test(events) ? 8 : 0) +
        (/\bUPDATE\b/u.test(events) ? 16 : 0) +
        (/\bTRUNCATE\b/u.test(events) ? 32 : 0),
      function_schema: match[9],
      function_name: match[10],
      columns,
      deferrable: !!match[1],
      deferred: !!match[1],
      enabled: 'O',
      internal: false,
      nargs: 0,
      when: null,
    };
  });
  const actual = (
    await db.query(`SELECT n.nspname::text schema,c.relname::text "table",t.tgname::text name,t.tgtype::integer type,
    fn.nspname::text function_schema,p.proname::text function_name,
    ARRAY(SELECT a.attname::text FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY x(num,ord) JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=x.num ORDER BY x.ord) columns,
    t.tgdeferrable deferrable,t.tginitdeferred deferred,t.tgenabled::text enabled,t.tgisinternal internal,t.tgnargs::integer nargs,pg_get_expr(t.tgqual,t.tgrelid) "when"
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=p.pronamespace
    WHERE t.tgname LIKE '%staff%' OR (fn.nspname='_migration' AND (p.proname LIKE 'staff_%' OR p.proname='refuse_staff_evidence_change'))`)
  ).rows;
  const ordered = (rows: { schema?: string; table?: string; name?: string }[]) =>
    rows.sort((a, b) =>
      `${a.schema}.${a.table}.${a.name}`.localeCompare(`${b.schema}.${b.table}.${b.name}`),
    );
  assert.deepEqual(
    ordered(actual),
    ordered(expected),
    'Staff trigger definition, order, target or enablement differs',
  );
  assert.deepEqual(
    (await db.query('SELECT singleton,revision>=0 valid FROM _migration.staff_roster_mutex')).rows,
    [{ singleton: true, valid: true }],
    'Serialization mutex missing, extra or invalid',
  );
  for (const table of STAFF_TABLES) {
    await zero(
      db,
      `SELECT a.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE n.nspname='_migration' AND c.relname='${table}' AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='litigation_runtime'))`,
      'Private staff evidence ACL differs',
    );
  }
  const columns = (
    await db.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND
    (table_name,column_name) IN (('people','row_version'),('people','alias_epoch'),('people','application_modified_at'),('people','application_modified_by'),('person_name_alias','is_retired'),('person_name_alias','retirement_reason'),('lookup_team','row_version')) ORDER BY table_name,column_name`)
  ).rows;
  assert.deepEqual(
    columns,
    [
      ['lookup_team', 'row_version', 'bigint', 'NO', '1'],
      ['people', 'alias_epoch', 'bigint', 'NO', '0'],
      ['people', 'application_modified_at', 'timestamp with time zone', 'YES', null],
      ['people', 'application_modified_by', 'integer', 'YES', null],
      ['people', 'row_version', 'bigint', 'NO', '1'],
      ['person_name_alias', 'is_retired', 'boolean', 'NO', 'false'],
      ['person_name_alias', 'retirement_reason', 'text', 'YES', null],
    ].map(([table_name, column_name, data_type, is_nullable, column_default]) => ({
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default,
    })),
    'Staff column/default contract differs',
  );
}

export async function assertStaffBoundary(
  db: ClientBase,
  profile: StaffProfile,
): Promise<readonly StaffInvariant[]> {
  assert.ok(
    [61, 62, 63, 64, 65, 66, 67, 68, 69].includes(await assertStaffCheckpoint(db, profile)),
    'complete staff boundary required',
  );
  const population = (
    await db.query(`SELECT
    (SELECT count(*)::integer FROM _migration.staff_roster_person) people,
    (SELECT count(*)::integer FROM _migration.staff_roster_person WHERE NOT is_application_native) imported,
    (SELECT count(*)::integer FROM _migration.staff_roster_person WHERE NOT is_application_native AND is_staff) imported_staff,
    (SELECT count(*)::integer FROM _migration.staff_roster_person WHERE NOT is_staff) external,
    (SELECT count(*)::integer FROM _migration.staff_roster_alias) aliases,
    (SELECT count(*)::integer FROM _migration.staff_roster_alias WHERE is_imported) imported_aliases,
    (SELECT count(*)::integer FROM _migration.staff_roster_alias WHERE is_primary) original_primaries,
    (SELECT count(*)::integer FROM _migration.staff_roster_team) teams`)
  ).rows[0];
  assert.deepEqual(
    population,
    {
      people: 137,
      imported: 135,
      imported_staff: 64,
      external: 71,
      aliases: 350,
      imported_aliases: 348,
      original_primaries: 137,
      teams: 2,
    },
    'boundary population differs',
  );
  const hashes = (
    await db.query<{ people: string; aliases: string; teams: string; complete: boolean }>(`SELECT
    (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(p)-${EXCLUDED_AUDIT_COLUMNS}-'can_login' ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_person p) people,
    (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(a)-${EXCLUDED_AUDIT_COLUMNS}-'is_imported' ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_alias a) aliases,
    (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(t)-${EXCLUDED_AUDIT_COLUMNS} ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_team t) teams,
    (people_sha256=(SELECT encode(sha256(convert_to(jsonb_agg(_migration.staff_json_row(p) ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_person p)
      AND aliases_sha256=(SELECT encode(sha256(convert_to(jsonb_agg(_migration.staff_json_row(a) ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_alias a)
      AND teams_sha256=(SELECT encode(sha256(convert_to(jsonb_agg(_migration.staff_json_row(t) ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_team t)) complete
    FROM _migration.staff_roster_boundary`)
  ).rows[0];
  assert.deepEqual(
    hashes,
    {
      people: '073f4cf16867bf56f02366f908ee22fe025d0711a6130159428f2da09c2f2647',
      aliases: STAFF_ALIAS_BASELINES[profile],
      teams: '494f8d73dbe6da5bf4aa1aa0b170f06e21abf40caa7e064c8a6f37a1044bcb60',
      complete: true,
    },
    'forged or partial roster snapshot',
  );
  await zero(
    db,
    `SELECT b.singleton FROM _migration.staff_roster_boundary b WHERE
      b.prior_event_count<>(SELECT count(*) FROM public.audit_events WHERE id<=b.last_prior_event_id)
      OR b.last_prior_event_id<>(SELECT max(id) FROM public.audit_events WHERE id<=b.last_prior_event_id)
      OR b.prior_events_sha256 IS DISTINCT FROM (SELECT encode(sha256(convert_to(string_agg(_migration.staff_json_row(e)::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM public.audit_events e WHERE id<=b.last_prior_event_id)
      OR b.last_prior_event_id<CASE b.profile WHEN 'historical-full-state-upgrade' THEN 824 ELSE 1 END
      OR (b.profile='historical-full-state-upgrade' AND (
        (SELECT count(*) FROM public.audit_events WHERE id<=824)<>824
        OR (SELECT encode(sha256(convert_to(string_agg(_migration.staff_json_row(e)::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM public.audit_events e WHERE id<=824)
          IS DISTINCT FROM 'e49706d35eeae3dcb15bc08f1da8196528924d40495c7e092864ad71393cbf29'))`,
    'protected pre-boundary audit trail changed',
  );
  await zero(
    db,
    `SELECT s.id FROM _migration.staff_roster_alias s LEFT JOIN public.person_name_alias a ON a.id=s.id
    LEFT JOIN _migration.staff_roster_person p ON p.id=s.person_id
    WHERE a.id IS NULL OR ROW(a.person_id,a.alias_ar,a.alias_ar_normalised,a.created_at,a.created_by)
      IS DISTINCT FROM ROW(s.person_id,s.alias_ar,s.alias_ar_normalised,s.created_at,s.created_by)
      OR s.is_imported IS DISTINCT FROM NOT p.is_application_native OR (s.is_imported AND (a.is_retired OR a.retirement_reason IS NOT NULL))`,
    'imported/native original alias identity or evidence changed',
  );
  await zero(
    db,
    `SELECT p.id FROM public.people p FULL JOIN _migration.staff_roster_person s ON s.id=p.id
    WHERE p.id IS NULL OR (s.id IS NOT NULL AND ROW(p.is_staff,p.is_application_native,p.created_at,p.created_by) IS DISTINCT FROM ROW(s.is_staff,s.is_application_native,s.created_at,s.created_by))
      OR (s.id IS NULL AND (NOT p.is_application_native OR NOT p.is_staff))`,
    'person classification or original stable identity changed',
  );
  await zero(
    db,
    `SELECT t.id FROM public.lookup_team t FULL JOIN _migration.staff_roster_team s ON s.id=t.id
    WHERE t.id IS NULL OR s.id IS NULL OR ROW(t.code,t.label_ar,t.specialisms,t.sort_order,t.is_active,t.created_at,t.created_by)
      IS DISTINCT FROM ROW(s.code,s.label_ar,s.specialisms,s.sort_order,s.is_active,s.created_at,s.created_by)`,
    'fixed team identity changed',
  );
  await zero(
    db,
    `SELECT p.id FROM public.people p WHERE p.row_version<1 OR p.alias_epoch<0
    OR (p.application_modified_at IS NULL)<>(p.application_modified_by IS NULL)
    OR (p.application_modified_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.audit_actors a WHERE a.id=p.application_modified_by AND a.actor_kind='human'))`,
    'invalid row version or modification provenance',
  );
  await zero(
    db,
    `SELECT p.id FROM public.people p LEFT JOIN public.person_name_alias a ON a.person_id=p.id AND a.is_primary AND NOT a.is_retired
    GROUP BY p.id,p.name_ar HAVING count(a.id)<>1 OR bool_and(a.alias_ar=p.name_ar) IS NOT TRUE`,
    'active-primary invariant failed',
  );
  await zero(
    db,
    `SELECT normal FROM (SELECT id person,ar_normalise(name_ar) normal FROM public.people
    UNION ALL SELECT person_id,ar_normalise(alias_ar) FROM public.person_name_alias WHERE NOT is_retired) identities
    GROUP BY normal HAVING coalesce(normal,'')='' OR count(DISTINCT person)>1`,
    'cross-table normalized identity collision',
  );
  await zero(
    db,
    `SELECT id FROM public.people WHERE email IS NOT NULL AND (email<>lower(btrim(email)) OR email='')
    UNION ALL SELECT min(id) FROM public.people WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*)>1`,
    'email normalization or uniqueness failed',
  );
  await zero(
    db,
    `SELECT t.id FROM public.lookup_team t LEFT JOIN public.people p ON p.id=t.reviewer_id
    WHERE p.id IS NULL OR NOT p.is_staff OR NOT p.is_active OR p.is_trainee
    UNION ALL SELECT u.id FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.is_enabled AND (NOT p.is_active OR NOT p.is_staff)`,
    'reviewer/account eligibility failed',
  );
  await zero(
    db,
    `SELECT p.id FROM public.people p WHERE p.can_login IS DISTINCT FROM
      (p.is_active AND EXISTS(SELECT 1 FROM public.user_accounts u WHERE u.person_id=p.id AND u.is_enabled))`,
    'current account-derived login eligibility differs',
  );
  await zero(
    db,
    `SELECT c.entity_id FROM _migration.staff_roster_change c LEFT JOIN public.audit_events e ON e.id=c.audit_event_id
    WHERE e.id IS NULL OR e.entity_schema<>'public' OR e.entity_table<>c.entity_table OR e.entity_key<>jsonb_build_object('id',c.entity_id)
      OR e.action NOT IN ('record_created','record_updated') OR e.outcome<>'succeeded'
      OR c.row_sha256<>encode(sha256(convert_to(c.row_value::text,'UTF8')),'hex')
      OR c.event_sha256<>encode(sha256(convert_to(_migration.staff_json_row(e)::text,'UTF8')),'hex')
      OR e.id<=(SELECT last_prior_event_id FROM _migration.staff_roster_boundary)`,
    'roster history or its structural event was forged',
  );
  for (const [table, snapshot, defaults] of [
    [
      'people',
      'staff_roster_person',
      "jsonb_build_object('row_version',1,'alias_epoch',0,'application_modified_at',NULL,'application_modified_by',NULL)",
    ],
    [
      'person_name_alias',
      'staff_roster_alias',
      "jsonb_build_object('is_retired',false,'retirement_reason',NULL)",
    ],
    ['lookup_team', 'staff_roster_team', "jsonb_build_object('row_version',1)"],
  ]) {
    await zero(
      db,
      `SELECT t.id FROM public.${table} t LEFT JOIN _migration.${snapshot} s ON s.id=t.id
      LEFT JOIN LATERAL (SELECT row_value FROM _migration.staff_roster_change c WHERE c.entity_table='${table}' AND c.entity_id=t.id ORDER BY revision DESC LIMIT 1) h ON true
      WHERE _migration.staff_json_row(t) IS DISTINCT FROM coalesce(h.row_value,${table === 'person_name_alias' ? "_migration.staff_json_row(s)-'is_imported'" : '_migration.staff_json_row(s)'}||${defaults})`,
      'current roster row lacks exact immutable/audited continuity',
    );
  }
  await assertStaffFunctions(db);
  await assertStaffGuards(db);
  const primaryGuards = (
    await db.query(
      `SELECT tgname,tgenabled,tgdeferrable,tginitdeferred FROM pg_trigger WHERE tgname IN ('staff_people_primary_complete','staff_alias_primary_complete') ORDER BY tgname`,
    )
  ).rows;
  assert.deepEqual(primaryGuards, [
    {
      tgname: 'staff_alias_primary_complete',
      tgenabled: 'O',
      tgdeferrable: true,
      tginitdeferred: true,
    },
    {
      tgname: 'staff_people_primary_complete',
      tgenabled: 'O',
      tgdeferrable: true,
      tginitdeferred: true,
    },
  ]);
  const fieldRules = (
    await db.query(
      `SELECT entity_table,field_name,max_text_characters,capture_mode,classification_reason FROM public.audit_event_fields WHERE (entity_table,field_name) IN (${STAFF_FIELD_RULES.map(([table, field]) => `('${table}','${field}')`).join(',')}) ORDER BY entity_table,field_name`,
    )
  ).rows;
  assert.deepEqual(
    fieldRules,
    STAFF_FIELD_RULES.map(
      ([entity_table, field_name, max_text_characters, classification_reason]) => ({
        entity_table,
        field_name,
        max_text_characters,
        capture_mode: 'value',
        classification_reason,
      }),
    ).sort((a, b) =>
      `${a.entity_table}.${a.field_name}`.localeCompare(`${b.entity_table}.${b.field_name}`),
    ),
  );
  const source = (
    await db.query<{
      extraction_sha256: string | null;
      source_inventory: { table: string; count: number; sha256: string }[];
      roster_sources: Record<string, unknown>;
    }>(
      `SELECT extraction_sha256,source_inventory,roster_sources FROM _migration.staff_roster_boundary`,
    )
  ).rows[0]!;
  assert.equal(source.source_inventory.length, 20);
  assert.equal(new Set(source.source_inventory.map((row) => row.table)).size, 20);
  const actualNames = (
    await db.query<{ tablename: string }>(
      'SELECT tablename FROM pg_tables WHERE schemaname=\'staging\' ORDER BY tablename COLLATE "C"',
    )
  ).rows.map((row) => row.tablename);
  assert.deepEqual(
    source.source_inventory.map((row) => row.table),
    actualNames,
  );
  for (const expected of source.source_inventory) {
    const table = '"' + expected.table.replaceAll('"', '""') + '"';
    const row = (
      await db.query<{ count: number; sha256: string }>(
        `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,E'\\n' ORDER BY to_jsonb(s)::text COLLATE "C"),''),'UTF8')),'hex') sha256 FROM staging.${table} s`,
      )
    ).rows[0]!;
    assert.deepEqual(
      row,
      { count: expected.count, sha256: expected.sha256 },
      'staged source fingerprint or durable identity changed',
    );
    if (profile === 'canonical-clean-replay')
      assert.deepEqual(
        row,
        { count: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
        'unexpected extraction in canonical replay',
      );
    if (['lawyers', 'المحامين', 'فريق العمل'].includes(expected.table)) {
      const payload = (
        await db.query<{ value: unknown }>(
          `SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY src_record_key COLLATE "C"),'[]'::jsonb) value FROM staging.${table} s`,
        )
      ).rows[0]!.value;
      assert.deepEqual(
        source.roster_sources[expected.table],
        payload,
        'roster source identity payload changed',
      );
    }
  }
  if (profile === 'historical-full-state-upgrade') {
    const fingerprint = (
      await db.query<{ fingerprint: string }>(
        'SELECT _migration.current_staging_fingerprint() fingerprint',
      )
    ).rows[0]!.fingerprint;
    assert.equal(fingerprint, '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979');
    assert.equal(source.extraction_sha256, fingerprint);
  } else {
    assert.equal(source.extraction_sha256, null);
    for (const table of [
      'quarantine.review_value',
      'quarantine.finding',
      '_migration.high_impact_application',
      '_migration.high_impact_resolution',
      '_migration.high_impact_row_proof',
    ]) {
      await zero(db, `SELECT * FROM ${table}`, 'unexpected historical payload in canonical replay');
    }
  }
  return STAFF_INVARIANTS;
}
