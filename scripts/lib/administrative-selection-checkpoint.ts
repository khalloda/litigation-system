import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';

export const ADMINISTRATIVE_SELECTION_MIGRATION = '20261001123000_administrative_report_selections';
const kinds = ['hearing', 'step'] as const;
const prefix = (kind: string) => `administrative_${kind}_report_selection`;
export const ADMINISTRATIVE_SELECTION_TABLES = kinds.map((kind) => `${prefix(kind)}s`);
export const ADMINISTRATIVE_SELECTION_FIELDS = kinds.flatMap((kind) => [
  [`${prefix(kind)}s`, 'id', 0, `${prefix(kind)}_identity`] as const,
  [`${prefix(kind)}s`, 'is_selected', 64, `${prefix(kind)}_current`] as const,
  [`${prefix(kind)}s`, 'row_version', 64, `${prefix(kind)}_current`] as const,
]);
export const ADMINISTRATIVE_SELECTION_GATEWAYS = kinds.map(
  (kind) =>
    `public.${prefix(kind)}_save(p_account integer, p_person integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)`,
);
const source = () =>
  readFileSync(`prisma/migrations/${ADMINISTRATIVE_SELECTION_MIGRATION}/migration.sql`, 'utf8');
const tables = [
  '_migration.administrative_report_submission_scope',
  ...kinds.flatMap((kind) => [
    `public.${prefix(kind)}s`,
    `_migration.${prefix(kind)}_submission`,
    `_migration.${prefix(kind)}_change`,
  ]),
].sort();
const functionPattern =
  /CREATE FUNCTION ((?:public|_migration)\.administrative_\w+)\(([\s\S]*?)\)\s*RETURNS([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/gu;

export async function administrativeSelectionApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',
      [ADMINISTRATIVE_SELECTION_MIGRATION],
    )
  ).rows;
  const surfaces = (
    await db.query(
      "SELECT n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','_migration') AND c.relkind IN('r','v','m') AND c.relname LIKE 'administrative_%report_%' ORDER BY 1",
    )
  ).rows.map((r) => r.name);
  const functions = (
    await db.query(
      "SELECT n.nspname||'.'||p.proname name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'administrative_%report_%' ORDER BY 1",
    )
  ).rows.map((r) => r.name);
  if (!ledger.length) {
    assert.deepEqual(surfaces, [], 'Partial administrative selection storage');
    assert.deepEqual(functions, [], 'Partial administrative selection gateway');
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(ledger[0].finished_at);
  assert.equal(ledger[0].applied_steps_count, 1);
  assert.equal(ledger[0].checksum, createHash('sha256').update(source()).digest('hex'));
  assert.deepEqual(surfaces, tables);
  assert.deepEqual(functions, [...source().matchAll(functionPattern)].map((m) => m[1]).sort());
  return true;
}

/** Exact structural and semantic checks apply on every db:check, including empty tables. */
export async function administrativeSelectionFailures(db: ClientBase) {
  const failures: string[] = [];
  try {
    if (!(await administrativeSelectionApplied(db))) return failures;
    const owner = (
      await db.query(
        "SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='public._prisma_migrations'::regclass",
      )
    ).rows[0].owner;
    assert.equal(
      (await db.query('SELECT rolsuper FROM pg_roles WHERE rolname=$1', [owner])).rows[0].rolsuper,
      true,
    );
    const normalize = (value: string) => value.replaceAll('\r\n', '\n').trim();
    for (const match of source().matchAll(functionPattern)) {
      const [schema, name] = match[1]!.split('.');
      const rows = (
        await db.query(
          'SELECT p.oid,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,p.prokind,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2',
          [schema, name],
        )
      ).rows;
      assert.equal(rows.length, 1);
      const row = rows[0];
      assert.equal(normalize(row.prosrc), normalize(match[4]!), `Exact ${name}`);
      assert.equal(row.prosecdef, /SECURITY DEFINER/u.test(match[3]!));
      assert.equal(
        row.provolatile,
        /IMMUTABLE/u.test(match[3]!) ? 'i' : /STABLE/u.test(match[3]!) ? 's' : 'v',
      );
      assert.equal(row.prokind, 'f');
      assert.equal(row.owner, owner);
      assert.deepEqual(row.proconfig, [
        'search_path=pg_catalog, public',
        ...(/SET TimeZone/u.test(match[3]!) ? ['TimeZone=UTC'] : []),
      ]);
      assert.deepEqual(
        (
          await db.query(
            "SELECT has_function_privilege('litigation_runtime',$1::oid,'EXECUTE') runtime, EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1 AND a.grantee=0 AND a.privilege_type='EXECUTE') public",
            [row.oid],
          )
        ).rows[0],
        { runtime: schema === 'public' && name!.endsWith('_save'), public: false },
      );
    }
    const triggerMatches = [
      ...source().matchAll(
        /CREATE (CONSTRAINT )?TRIGGER (\w+) (.*?) ON ((?:public|_migration)\.\w+)(.*?) EXECUTE FUNCTION ([\w.]+)\(\);/gu,
      ),
    ];
    for (const table of tables) {
      const kind = table.includes('_hearing_') ? 'hearing' : 'step';
      const p = prefix(kind),
        ref = kind === 'hearing' ? 'hearings' : 'task_actions';
      const registry = table.endsWith('_scope'),
        current = table.startsWith('public.'),
        receipt = table.endsWith('_submission');
      const columns = registry
        ? ['submission_id:uuid:true', 'purpose:text:true']
        : current
          ? ['id:integer:true', 'is_selected:boolean:true', 'row_version:bigint:true']
          : receipt
            ? [
                'submission_id:uuid:true',
                'actor_id:integer:true',
                'request_payload:jsonb:true',
                'record_id:integer:true',
                'result_version:bigint:true',
                'changed:boolean:true',
                'created_at:timestamp with time zone:true',
              ]
            : [
                'record_id:integer:true',
                'version:bigint:true',
                'actor_id:integer:true',
                'submission_id:uuid:true',
                'request_id:uuid:true',
                'before_values:jsonb:false',
                'after_values:jsonb:true',
              ];
      assert.equal(
        (
          await db.query(
            'SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass',
            [table],
          )
        ).rows[0].owner,
        owner,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text value FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",
            [table],
          )
        ).rows.map((r) => r.value),
        columns,
      );
      assert.deepEqual(
        (
          await db.query(
            'SELECT tgname FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname',
            [table],
          )
        ).rows.map((r) => r.tgname),
        triggerMatches
          .filter((m) => m[4] === table)
          .map((m) => m[2])
          .sort(),
      );
      assert.deepEqual(
        (
          await db.query(
            'SELECT a.attname name,pg_get_expr(d.adbin,d.adrelid) expression FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid=$1::regclass ORDER BY a.attname',
            [table],
          )
        ).rows,
        receipt ? [{ name: 'created_at', expression: 'statement_timestamp()' }] : [],
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema=split_part($1,'.',1) AND table_name=split_part($1,'.',2) AND grantee IN('PUBLIC','litigation_runtime') ORDER BY grantee,privilege_type",
            [table],
          )
        ).rows,
        current ? [{ grantee: 'litigation_runtime', privilege_type: 'SELECT' }] : [],
      );
      const constraints = (
        await db.query(
          'SELECT pg_get_constraintdef(oid,true) definition,convalidated FROM pg_constraint WHERE conrelid=$1::regclass',
          [table],
        )
      ).rows;
      assert.ok(constraints.every((r) => r.convalidated));
      const expected = registry
        ? [
            'PRIMARY KEY (submission_id)',
            "CHECK (purpose = ANY (ARRAY['client'::text, 'closed'::text, 'lawyer'::text, 'administrative-hearing'::text, 'administrative-step'::text]))",
          ]
        : current
          ? [
              'PRIMARY KEY (id)',
              `FOREIGN KEY (id) REFERENCES ${ref}(id) ON DELETE RESTRICT`,
              'CHECK (row_version > 0)',
            ]
          : receipt
            ? [
                'PRIMARY KEY (submission_id)',
                'FOREIGN KEY (actor_id) REFERENCES audit_actors(id)',
                `FOREIGN KEY (record_id) REFERENCES ${ref}(id)`,
                "CHECK (jsonb_typeof(request_payload) = 'object'::text)",
                'CHECK (result_version >= 0)',
              ]
            : [
                'PRIMARY KEY (record_id, version)',
                'UNIQUE (submission_id)',
                `FOREIGN KEY (record_id) REFERENCES ${ref}(id)`,
                'FOREIGN KEY (actor_id) REFERENCES audit_actors(id)',
                `FOREIGN KEY (submission_id) REFERENCES _migration.${p}_submission(submission_id) DEFERRABLE INITIALLY DEFERRED`,
                'CHECK (version > 0)',
              ];
      assert.deepEqual(
        constraints.map((r) => r.definition).sort(),
        [...expected, 'TRIGGER DEFERRABLE INITIALLY DEFERRED'].sort(),
      );
      // Compare index semantics; PostgreSQL shortens generated names at 63 bytes.
      const indexes = (
        await db.query(
          'SELECT indisunique,indisvalid,indisready,indislive,pg_get_indexdef(indexrelid) definition FROM pg_index WHERE indrelid=$1::regclass',
          [table],
        )
      ).rows;
      assert.ok(indexes.every((r) => r.indisvalid && r.indisready && r.indislive));
      const signatures = indexes
        .map((r) => `${r.indisunique}:${r.definition.split(' USING btree ')[1]}`)
        .sort();
      assert.deepEqual(
        signatures,
        (registry
          ? ['true:(submission_id)']
          : current
            ? ['true:(id)']
            : receipt
              ? ['true:(submission_id)', 'true:(record_id, result_version) WHERE changed']
              : ['true:(record_id, version)', 'true:(submission_id)']
        ).sort(),
      );
    }
    for (const [, constraint, name, event, table, tail, fn] of triggerMatches) {
      const rows = (
        await db.query(
          'SELECT tgtype,tgenabled,tgdeferrable,tginitdeferred,tgfoid::regprocedure::text function,tgqual IS NULL unqualified,tgnargs,tgattr::text attributes FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname=$2 AND NOT tgisinternal',
          [table, name],
        )
      ).rows;
      assert.equal(rows.length, 1);
      const type =
        (tail!.includes('FOR EACH ROW') ? 1 : 0) +
        (event!.startsWith('BEFORE') ? 2 : 0) +
        (event!.includes('INSERT') ? 4 : 0) +
        (event!.includes('DELETE') ? 8 : 0) +
        (event!.includes('UPDATE') ? 16 : 0) +
        (event!.includes('TRUNCATE') ? 32 : 0);
      assert.deepEqual(rows[0], {
        tgtype: type,
        tgenabled: 'O',
        tgdeferrable: !!constraint,
        tginitdeferred: !!constraint,
        function: fn!.replace(/^public\./u, '') + '()',
        unqualified: true,
        tgnargs: 0,
        attributes: '',
      });
    }
    assert.deepEqual(
      (
        await db.query(`WITH receipts AS (
      SELECT submission_id,'client'::text purpose FROM _migration.client_report_selection_submission
      UNION ALL SELECT submission_id,'closed' FROM _migration.closed_report_selection_submission
      UNION ALL SELECT submission_id,'lawyer' FROM _migration.lawyer_report_selection_submission
      UNION ALL SELECT submission_id,'administrative-hearing' FROM _migration.administrative_hearing_report_selection_submission
      UNION ALL SELECT submission_id,'administrative-step' FROM _migration.administrative_step_report_selection_submission)
      SELECT coalesce(r.submission_id,s.submission_id) id FROM receipts r FULL JOIN _migration.administrative_report_submission_scope s USING(submission_id) WHERE r.purpose IS DISTINCT FROM s.purpose
      UNION ALL SELECT submission_id FROM receipts GROUP BY submission_id HAVING count(*)<>1`)
      ).rows,
      [],
      'Exact five-purpose receipt registry',
    );
    for (const kind of kinds) {
      const p = prefix(kind);
      assert.deepEqual(
        (
          await db.query(
            `SELECT id FROM (SELECT id FROM public.${p}s UNION SELECT record_id FROM _migration.${p}_change UNION SELECT record_id FROM _migration.${p}_submission) x WHERE NOT _migration.${p}_valid(id)`,
          )
        ).rows,
        [],
        'Exact administrative current/history/receipt/audit correspondence',
      );
    }
  } catch (error) {
    failures.push(
      error instanceof Error ? error.message : 'Administrative selection invariant failed',
    );
  }
  return failures;
}
