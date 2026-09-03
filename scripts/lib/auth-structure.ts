import type { ClientBase } from 'pg';

type ConstraintRow = {
  name: string;
  schema_name: string;
  table_name: string;
  type: string;
  validated: boolean;
  no_inherit: boolean;
  deferrable: boolean;
  deferred: boolean;
  definition: string;
  source_columns: string[];
  target_schema: string | null;
  target_table: string | null;
  target_columns: string[];
  update_action: string;
  delete_action: string;
  match_type: string;
};

type IndexRow = {
  name: string;
  schema_name: string;
  table_name: string;
  method: string;
  unique_index: boolean;
  valid: boolean;
  ready: boolean;
  live: boolean;
  immediate: boolean;
  key_count: number;
  attribute_count: number;
  columns: string[];
  predicate: string | null;
  expressions: string | null;
  definition: string;
};

type TriggerRow = {
  name: string;
  schema_name: string;
  table_name: string;
  enabled: string;
  internal: boolean;
  trigger_type: number;
  function_schema: string;
  function_name: string;
  definition: string;
};

type FunctionRow = {
  name: string;
  schema_name: string;
  return_type: string;
  arguments: string;
  identity_arguments: string;
  language_name: string;
  function_kind: string;
  volatility: string;
  strict: boolean;
  security_definer: boolean;
  leakproof: boolean;
  parallel_safety: string;
  configuration: string[] | null;
  body: string;
};

const constraintDefinitions: Readonly<Record<string, string>> = {
  user_accounts_pkey: 'PRIMARY KEY (id)',
  user_accounts_person_id_key: 'UNIQUE (person_id)',
  user_accounts_username_normalized_key: 'UNIQUE (username_normalized)',
  user_accounts_person_id_fkey:
    'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE RESTRICT',
  user_accounts_username_display_shape:
    "CHECK (username = btrim(username) AND username ~ '^[A-Za-z][A-Za-z0-9._-]{2,63}$'::text)",
  user_accounts_username_normalized_shape:
    "CHECK (username_normalized = lower(username) AND username_normalized ~ '^[a-z][a-z0-9._-]{2,63}$'::text)",
  user_accounts_role_code_shape:
    "CHECK (role_code = ANY (ARRAY['Administrator'::text, 'Litigation Assistant'::text, 'Lawyer'::text, 'Paralegal'::text]))",
  user_accounts_lockout_shape:
    'CHECK (failed_login_attempts >= 0 AND failed_login_attempts <= 5 AND (failed_login_attempts < 5 AND locked_until IS NULL OR failed_login_attempts = 5 AND locked_until IS NOT NULL))',
  user_accounts_session_version_shape: 'CHECK (session_version >= 0)',
  user_accounts_password_state_shape:
    "CHECK (password_hash IS NULL AND must_change_password AND password_changed_at IS NULL AND failed_login_attempts = 0 AND locked_until IS NULL OR password_hash ~ '^\\$argon2id\\$v=19\\$m=19456,p=1,t=2\\$[A-Za-z0-9+/]+={0,2}\\$[A-Za-z0-9+/]+={0,2}$'::text AND password_changed_at IS NOT NULL)",
};

const indexDefinitions = {
  user_accounts_pkey: ['id'],
  user_accounts_person_id_key: ['person_id'],
  user_accounts_username_normalized_key: ['username_normalized'],
} as const;

const triggerDefinitions = {
  people_login_eligibility_guard: {
    table: 'people',
    type: 23,
    function: 'enforce_person_login_eligibility',
    definition:
      'CREATE TRIGGER people_login_eligibility_guard BEFORE INSERT OR UPDATE OF is_active, can_login ON people FOR EACH ROW EXECUTE FUNCTION enforce_person_login_eligibility()',
  },
  user_accounts_security_guard: {
    table: 'user_accounts',
    type: 19,
    function: 'guard_user_account_security',
    definition:
      'CREATE TRIGGER user_accounts_security_guard BEFORE UPDATE OF person_id, username, username_normalized, password_hash, role_code, is_enabled, must_change_password, failed_login_attempts, locked_until, session_version, password_changed_at ON user_accounts FOR EACH ROW EXECUTE FUNCTION guard_user_account_security()',
  },
  user_accounts_administrator_availability_guard: {
    table: 'user_accounts',
    type: 19,
    function: 'guard_usable_administrator',
    definition:
      'CREATE TRIGGER user_accounts_administrator_availability_guard BEFORE UPDATE OF role_code, is_enabled, password_hash ON user_accounts FOR EACH ROW EXECUTE FUNCTION guard_usable_administrator()',
  },
  people_administrator_availability_guard: {
    table: 'people',
    type: 19,
    function: 'guard_usable_administrator',
    definition:
      'CREATE TRIGGER people_administrator_availability_guard BEFORE UPDATE OF is_active, can_login ON people FOR EACH ROW EXECUTE FUNCTION guard_usable_administrator()',
  },
  user_accounts_sync_person_login: {
    table: 'user_accounts',
    type: 29,
    function: 'sync_user_account_person_login',
    definition:
      'CREATE TRIGGER user_accounts_sync_person_login AFTER INSERT OR DELETE OR UPDATE OF is_enabled ON user_accounts FOR EACH ROW EXECUTE FUNCTION sync_user_account_person_login()',
  },
} as const;

const functionBodies: Readonly<Record<string, string>> = {
  enforce_person_login_eligibility: `BEGIN
  NEW.can_login := NEW.is_active AND EXISTS (
    SELECT 1 FROM public.user_accounts a
     WHERE a.person_id = NEW.id AND a.is_enabled
  );
  RETURN NEW;
END;`,
  guard_user_account_security: `DECLARE
    lifecycle_changed boolean :=
        NEW.username IS DISTINCT FROM OLD.username
        OR NEW.username_normalized IS DISTINCT FROM OLD.username_normalized
        OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
        OR NEW.role_code IS DISTINCT FROM OLD.role_code
        OR NEW.is_enabled IS DISTINCT FROM OLD.is_enabled;
BEGIN
  IF NEW.person_id <> OLD.person_id THEN
    RAISE EXCEPTION 'A user account cannot be moved to another person';
  END IF;
  IF NEW.session_version < OLD.session_version THEN
    RAISE EXCEPTION 'A user account session version cannot decrease';
  END IF;
  IF OLD.password_hash IS NOT NULL AND NEW.password_hash IS NULL THEN
    RAISE EXCEPTION 'An initialized user password cannot be cleared';
  END IF;
  IF lifecycle_changed AND NEW.session_version <> OLD.session_version+1 THEN
    RAISE EXCEPTION 'Account lifecycle changes must increment the session version exactly once';
  END IF;
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash
     OR NEW.is_enabled IS DISTINCT FROM OLD.is_enabled THEN
    IF NEW.failed_login_attempts <> 0 OR NEW.locked_until IS NOT NULL THEN
      RAISE EXCEPTION 'Password and enablement changes must clear lockout state';
    END IF;
  END IF;
  IF NOT OLD.is_enabled AND NEW.is_enabled THEN
    IF NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash
       OR NEW.password_hash IS NULL
       OR NOT NEW.must_change_password
       OR NEW.password_changed_at IS NOT DISTINCT FROM OLD.password_changed_at THEN
      RAISE EXCEPTION 'Reactivation requires a new temporary password and forced change';
    END IF;
  END IF;
  RETURN NEW;
END;`,
  sync_user_account_person_login: `DECLARE
  affected_person_id integer;
BEGIN
  affected_person_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.person_id ELSE NEW.person_id END;
  UPDATE public.people
     SET can_login = is_active AND EXISTS (
           SELECT 1 FROM public.user_accounts a
            WHERE a.person_id = affected_person_id AND a.is_enabled
         ),
         updated_at = CURRENT_TIMESTAMP
   WHERE id = affected_person_id;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;`,
};

function canon(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim();
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function authStructureFailures(db: ClientBase): Promise<string[]> {
  const failures: string[] = [];
  const constraints = await db.query<ConstraintRow>(`
    SELECT con.conname name,ns.nspname schema_name,rel.relname table_name,
           con.contype::text type,con.convalidated validated,con.connoinherit no_inherit,
           con.condeferrable deferrable,con.condeferred deferred,
           pg_get_constraintdef(con.oid,true) definition,
           coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)
             FROM unnest(con.conkey) WITH ORDINALITY k(attnum,ordinality)
             JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum),
             ARRAY[]::name[])::text[] source_columns,
           tns.nspname target_schema,trel.relname target_table,
           coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)
             FROM unnest(con.confkey) WITH ORDINALITY k(attnum,ordinality)
             JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum),
             ARRAY[]::name[])::text[] target_columns,
           con.confupdtype::text update_action,con.confdeltype::text delete_action,
           con.confmatchtype::text match_type
      FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      LEFT JOIN pg_class trel ON trel.oid=con.confrelid
      LEFT JOIN pg_namespace tns ON tns.oid=trel.relnamespace
     WHERE ns.nspname='public' AND rel.relname='user_accounts'
     ORDER BY con.conname`);
  const expectedNames = Object.keys(constraintDefinitions).sort();
  for (const name of expectedNames) {
    const row = constraints.rows.find((candidate) => candidate.name === name);
    if (!row) {
      failures.push(`missing constraint ${name}`);
      continue;
    }
    const expectedType =
      name === 'user_accounts_pkey'
        ? 'p'
        : name.endsWith('_key')
          ? 'u'
          : name.endsWith('_fkey')
            ? 'f'
            : 'c';
    if (
      row.schema_name !== 'public' ||
      row.table_name !== 'user_accounts' ||
      row.type !== expectedType ||
      !row.validated ||
      row.no_inherit !== (expectedType !== 'c') ||
      row.deferrable ||
      row.deferred ||
      row.definition !== constraintDefinitions[name]
    ) {
      failures.push(`constraint ${name} definition/options differ`);
    }
    if (
      name === 'user_accounts_person_id_fkey' &&
      (!same(row.source_columns, ['person_id']) ||
        row.target_schema !== 'public' ||
        row.target_table !== 'people' ||
        !same(row.target_columns, ['id']) ||
        row.update_action !== 'c' ||
        row.delete_action !== 'r' ||
        row.match_type !== 's')
    ) {
      failures.push('user_accounts_person_id_fkey relation actions/columns differ');
    }
  }

  const indexes = await db.query<IndexRow>(`
    SELECT ir.relname name,ins.nspname schema_name,tr.relname table_name,
           am.amname method,i.indisunique unique_index,i.indisvalid valid,
           i.indisready ready,i.indislive live,i.indimmediate immediate,
           i.indnkeyatts key_count,i.indnatts attribute_count,
           ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true)
                   FROM generate_series(1,i.indnkeyatts)n ORDER BY n) columns,
           pg_get_expr(i.indpred,i.indrelid,true) predicate,
           pg_get_expr(i.indexprs,i.indrelid,true) expressions,
           pg_get_indexdef(i.indexrelid,0,true) definition
      FROM pg_index i JOIN pg_class ir ON ir.oid=i.indexrelid
      JOIN pg_namespace ins ON ins.oid=ir.relnamespace
      JOIN pg_class tr ON tr.oid=i.indrelid JOIN pg_am am ON am.oid=ir.relam
     WHERE ins.nspname='public' AND tr.relname='user_accounts'
     ORDER BY ir.relname`);
  for (const [name, columns] of Object.entries(indexDefinitions)) {
    const row = indexes.rows.find((candidate) => candidate.name === name);
    const expectedDefinition = `CREATE UNIQUE INDEX ${name} ON user_accounts USING btree (${columns.join(', ')})`;
    if (
      !row ||
      row.schema_name !== 'public' ||
      row.table_name !== 'user_accounts' ||
      row.method !== 'btree' ||
      !row.unique_index ||
      !row.valid ||
      !row.ready ||
      !row.live ||
      !row.immediate ||
      row.key_count !== 1 ||
      row.attribute_count !== 1 ||
      !same(row.columns, columns) ||
      row.predicate !== null ||
      row.expressions !== null ||
      row.definition !== expectedDefinition
    ) {
      failures.push(`index ${name} definition/options differ`);
    }
  }

  const triggers = await db.query<TriggerRow>(`
    SELECT t.tgname name,ns.nspname schema_name,r.relname table_name,
           t.tgenabled::text enabled,t.tgisinternal internal,t.tgtype trigger_type,
           fns.nspname function_schema,p.proname function_name,
           pg_get_triggerdef(t.oid,true) definition
      FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
      JOIN pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_namespace fns ON fns.oid=p.pronamespace
     WHERE ns.nspname='public' AND NOT t.tgisinternal
       AND t.tgname IN (
         'people_administrator_availability_guard','people_login_eligibility_guard',
         'user_accounts_administrator_availability_guard','user_accounts_security_guard',
         'user_accounts_sync_person_login'
       )
     ORDER BY t.tgname`);
  for (const [name, expected] of Object.entries(triggerDefinitions)) {
    const row = triggers.rows.find((candidate) => candidate.name === name);
    if (
      !row ||
      row.schema_name !== 'public' ||
      row.table_name !== expected.table ||
      row.enabled !== 'O' ||
      row.internal ||
      row.trigger_type !== expected.type ||
      row.function_schema !== 'public' ||
      row.function_name !== expected.function ||
      row.definition !== expected.definition
    ) {
      failures.push(`trigger ${name} definition/options differ`);
    }
  }

  const functions = await db.query<FunctionRow>(`
    SELECT p.proname name,ns.nspname schema_name,
           pg_get_function_result(p.oid) return_type,
           pg_get_function_arguments(p.oid) arguments,
           pg_get_function_identity_arguments(p.oid) identity_arguments,
           l.lanname language_name,p.prokind::text function_kind,
           p.provolatile::text volatility,p.proisstrict strict,
           p.prosecdef security_definer,p.proleakproof leakproof,
           p.proparallel::text parallel_safety,p.proconfig configuration,p.prosrc body
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
     WHERE ns.nspname='public'
       AND p.proname IN ('guard_user_account_security','enforce_person_login_eligibility','sync_user_account_person_login')
     ORDER BY p.proname`);
  for (const [name, expectedBody] of Object.entries(functionBodies)) {
    const row = functions.rows.find((candidate) => candidate.name === name);
    if (
      !row ||
      row.schema_name !== 'public' ||
      row.return_type !== 'trigger' ||
      row.arguments !== '' ||
      row.identity_arguments !== '' ||
      row.language_name !== 'plpgsql' ||
      row.function_kind !== 'f' ||
      row.volatility !== 'v' ||
      row.strict ||
      row.security_definer ||
      row.leakproof ||
      row.parallel_safety !== 'u' ||
      !same(row.configuration ?? [], ['search_path=pg_catalog, public']) ||
      canon(row.body) !== canon(expectedBody)
    ) {
      failures.push(`function ${name} definition/configuration differ`);
    }
  }
  return failures;
}

export async function authDataFailures(db: ClientBase): Promise<string[]> {
  const result = await db.query<{ defect: string }>(`
    WITH expected(original_username,name_ar,email,native,person_id) AS (VALUES
      ('KHelmy','خالد حلمي','khelmy@sarieldin.com',true,NULL::integer),
      ('MHussien','محمد حسين','mhussien@sarieldin.com',true,NULL::integer),
      ('IHamdy','إيهاب حمدي','ihamdy@sarieldin.com',false,4),
      ('SKhattab','سامي إبراهيم خطاب','skhattab@sarieldin.com',false,5)
    ), defects AS (
      SELECT 'approved account mapping differs' defect FROM expected e
      LEFT JOIN audit_actors actor
        ON actor.actor_kind='human'
       AND actor.identity_label=e.original_username||' (account '||actor.user_account_id::text||')'
      LEFT JOIN user_accounts u ON u.id=actor.user_account_id
      LEFT JOIN people p ON p.id=u.person_id
      LEFT JOIN person_name_alias a ON a.person_id=p.id AND a.alias_ar=e.name_ar
      WHERE u.id IS NULL OR p.name_ar IS DISTINCT FROM e.name_ar
         OR p.email IS DISTINCT FROM e.email
         OR p.is_application_native IS DISTINCT FROM e.native
         OR (e.person_id IS NOT NULL AND p.id IS DISTINCT FROM e.person_id)
         OR a.person_id IS NULL
      UNION ALL
      SELECT 'protected canonical roster no longer has 135 people'
       WHERE (SELECT count(*) FROM people WHERE NOT is_application_native) <> 135
      UNION ALL
      SELECT 'the two Task 3.1 native people are not exact'
       WHERE (SELECT count(*) FROM people WHERE is_application_native
               AND name_ar IN ('خالد حلمي','محمد حسين')) <> 2
      UNION ALL
      SELECT 'people.can_login differs from active enabled-account eligibility'
       WHERE EXISTS (
         SELECT 1 FROM people p WHERE p.can_login IS DISTINCT FROM
           (p.is_active AND EXISTS (SELECT 1 FROM user_accounts u WHERE u.person_id=p.id AND u.is_enabled))
       )
      UNION ALL
      SELECT 'an initialized password does not use the approved Argon2id parameters'
       WHERE EXISTS (SELECT 1 FROM user_accounts WHERE password_hash IS NOT NULL AND
         password_hash !~ '^\\$argon2id\\$v=19\\$m=19456,p=1,t=2\\$[A-Za-z0-9+/]+={0,2}\\$[A-Za-z0-9+/]+={0,2}$')
    ) SELECT defect FROM defects ORDER BY defect`);
  return result.rows.map((row) => row.defect);
}
