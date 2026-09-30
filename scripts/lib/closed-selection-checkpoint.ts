import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
export const CLOSED_SELECTION_MIGRATION = '20260930080000_closed_report_selection';
export const CLOSED_SELECTION_FIELDS = [
  ['closed_report_selections', 'hearing_id', 64, 'closed_report_selection_current'],
  ['closed_report_selections', 'id', 0, 'closed_report_selection_identity'],
  ['closed_report_selections', 'is_selected', 64, 'closed_report_selection_current'],
  ['closed_report_selections', 'row_version', 64, 'closed_report_selection_current'],
] as const;
const source = () =>
  readFileSync(`prisma/migrations/${CLOSED_SELECTION_MIGRATION}/migration.sql`, 'utf8');
const tables = [
  '_migration.closed_report_selection_change',
  '_migration.closed_report_selection_submission',
  'public.closed_report_selections',
];
export async function closedSelectionApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',
      [CLOSED_SELECTION_MIGRATION],
    )
  ).rows;
  const surfaces = (
    await db.query(
      "SELECT n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','_migration') AND c.relkind IN('r','v','m') AND c.relname LIKE 'closed_report_%' ORDER BY 1",
    )
  ).rows.map((r) => r.name);
  const functions = (
    await db.query(
      "SELECT n.nspname||'.'||p.proname name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'closed_report_%' ORDER BY 1",
    )
  ).rows.map((r) => r.name);
  if (!ledger.length) {
    assert.deepEqual(surfaces, [], 'Partial report selection storage');
    assert.deepEqual(functions, [], 'Partial report selection gateway');
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(ledger[0].finished_at);
  assert.equal(ledger[0].applied_steps_count, 1);
  assert.equal(ledger[0].checksum, createHash('sha256').update(source()).digest('hex'));
  assert.deepEqual(surfaces, tables);
  assert.deepEqual(
    functions,
    [...source().matchAll(/CREATE FUNCTION ((?:public|_migration)\.closed_report_\w+)\(/gu)]
      .map((m) => m[1])
      .sort(),
  );
  return true;
}
export async function closedSelectionFailures(db: ClientBase) {
  const failures: string[] = [];
  try {
    if (!(await closedSelectionApplied(db))) return failures;
    const migrationOwner = (
      await db.query(
        "SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='public._prisma_migrations'::regclass",
      )
    ).rows[0].owner;
    const normalize = (s: string) => s.replaceAll('\r\n', '\n').trim();
    for (const match of source().matchAll(
      /CREATE FUNCTION ((?:public|_migration)\.closed_report_\w+)\(([\s\S]*?)\)\s*RETURNS([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/gu,
    )) {
      const [schema, name] = match[1]!.split('.');
      const rows = (
        await db.query(
          'SELECT p.oid,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,p.prokind,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2',
          [schema, name],
        )
      ).rows;
      assert.equal(rows.length, 1);
      const r = rows[0];
      assert.equal(
        normalize(r.prosrc),
        normalize(match[4]!),
        'Exact report selection function ' + name,
      );
      assert.equal(r.prosecdef, /SECURITY DEFINER/u.test(match[3]!));
      assert.equal(r.prokind, 'f');
      assert.equal(r.owner, migrationOwner);
      assert.equal(r.provolatile, /STABLE/u.test(match[3]!) ? 's' : 'v');
      assert.deepEqual(r.proconfig, [
        'search_path=pg_catalog, public',
        ...(/SET TimeZone/u.test(match[3]!) ? ['TimeZone=UTC'] : []),
      ]);
      assert.equal(
        (await db.query('SELECT rolsuper FROM pg_roles WHERE rolname=$1', [r.owner])).rows[0]
          .rolsuper,
        true,
      );
      const access = (
        await db.query(
          "SELECT has_function_privilege('litigation_runtime',$1::oid,'EXECUTE') runtime, EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1 AND a.grantee=0 AND a.privilege_type='EXECUTE') public",
          [r.oid],
        )
      ).rows[0];
      assert.deepEqual(access, { runtime: name === 'closed_report_selection_save', public: false });
    }
    const columns: Record<string, string[]> = {
      'public.closed_report_selections': [
        'id:integer:true',
        'hearing_id:integer:false',
        'is_selected:boolean:true',
        'row_version:bigint:true',
      ],
      '_migration.closed_report_selection_change': [
        'matter_id:integer:true',
        'version:bigint:true',
        'actor_id:integer:true',
        'submission_id:uuid:true',
        'request_id:uuid:true',
        'before_values:jsonb:false',
        'after_values:jsonb:true',
      ],
      '_migration.closed_report_selection_submission': [
        'submission_id:uuid:true',
        'actor_id:integer:true',
        'request_payload:jsonb:true',
        'matter_id:integer:true',
        'result_version:bigint:true',
        'changed:boolean:true',
        'created_at:timestamp with time zone:true',
      ],
    };
    for (const table of tables) {
      assert.equal(
        (
          await db.query(
            'SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass',
            [table],
          )
        ).rows[0].owner,
        migrationOwner,
      );
      const declaredTriggers = [
        ...source().matchAll(
          /CREATE (?:CONSTRAINT )?TRIGGER (\w+) .*? ON ((?:public|_migration)\.\w+).*? EXECUTE FUNCTION /gu,
        ),
      ]
        .filter((m) => m[2] === table)
        .map((m) => m[1])
        .sort();
      assert.deepEqual(
        (
          await db.query(
            'SELECT tgname FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname',
            [table],
          )
        ).rows.map((r) => r.tgname),
        declaredTriggers,
      );
      const defaults = (
        await db.query(
          'SELECT a.attname name,pg_get_expr(d.adbin,d.adrelid) expression FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid=$1::regclass ORDER BY a.attname',
          [table],
        )
      ).rows;
      assert.deepEqual(
        defaults,
        table.endsWith('_submission')
          ? [{ name: 'created_at', expression: 'statement_timestamp()' }]
          : [],
      );

      assert.deepEqual(
        (
          await db.query(
            "SELECT attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text value FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",
            [table],
          )
        ).rows.map((r) => r.value),
        columns[table],
      );
      const grants = (
        await db.query(
          "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema=split_part($1,'.',1) AND table_name=split_part($1,'.',2) AND grantee IN('PUBLIC','litigation_runtime') ORDER BY privilege_type",
          [table],
        )
      ).rows.map((r) => r.privilege_type);
      assert.deepEqual(grants, table.startsWith('public.') ? ['SELECT'] : []);
      const indexes = (
        await db.query(
          'SELECT indisvalid,indisready,indislive FROM pg_index WHERE indrelid=$1::regclass',
          [table],
        )
      ).rows;
      assert.ok(indexes.every((r) => r.indisvalid && r.indisready && r.indislive));
      const expectedConstraints: Record<string, string[]> = {
        'public.closed_report_selections': [
          'PRIMARY KEY (id)',
          'FOREIGN KEY (id) REFERENCES matters(id) ON DELETE RESTRICT',
          'FOREIGN KEY (hearing_id) REFERENCES hearings(id) ON DELETE RESTRICT',
          'CHECK (row_version > 0)',
          'TRIGGER DEFERRABLE INITIALLY DEFERRED',
        ],
        '_migration.closed_report_selection_change': [
          'PRIMARY KEY (matter_id, version)',
          'UNIQUE (submission_id)',
          'FOREIGN KEY (matter_id) REFERENCES matters(id)',
          'FOREIGN KEY (actor_id) REFERENCES audit_actors(id)',
          'FOREIGN KEY (submission_id) REFERENCES _migration.closed_report_selection_submission(submission_id) DEFERRABLE INITIALLY DEFERRED',
          'CHECK (version > 0)',
          'TRIGGER DEFERRABLE INITIALLY DEFERRED',
        ],
        '_migration.closed_report_selection_submission': [
          'PRIMARY KEY (submission_id)',
          'FOREIGN KEY (actor_id) REFERENCES audit_actors(id)',
          'FOREIGN KEY (matter_id) REFERENCES matters(id)',
          "CHECK (jsonb_typeof(request_payload) = 'object'::text)",
          'CHECK (result_version >= 0)',
          'TRIGGER DEFERRABLE INITIALLY DEFERRED',
        ],
      };
      const constraints = (
        await db.query(
          'SELECT pg_get_constraintdef(oid,true) definition,convalidated FROM pg_constraint WHERE conrelid=$1::regclass',
          [table],
        )
      ).rows;
      assert.ok(constraints.every((r) => r.convalidated));
      assert.deepEqual(
        constraints.map((r) => r.definition).sort(),
        expectedConstraints[table]!.toSorted(),
      );
      const expectedIndexes: Record<string, string[]> = {
        'public.closed_report_selections': [
          'CREATE UNIQUE INDEX closed_report_selections_pkey ON public.closed_report_selections USING btree (id)',
          'CREATE INDEX closed_report_selections_hearing ON public.closed_report_selections USING btree (hearing_id) WHERE (hearing_id IS NOT NULL)',
        ],
        '_migration.closed_report_selection_change': [
          'CREATE UNIQUE INDEX closed_report_selection_change_pkey ON _migration.closed_report_selection_change USING btree (matter_id, version)',
          'CREATE UNIQUE INDEX closed_report_selection_change_submission_id_key ON _migration.closed_report_selection_change USING btree (submission_id)',
        ],
        '_migration.closed_report_selection_submission': [
          'CREATE UNIQUE INDEX closed_report_selection_submission_pkey ON _migration.closed_report_selection_submission USING btree (submission_id)',
          'CREATE UNIQUE INDEX closed_report_selection_changed_version ON _migration.closed_report_selection_submission USING btree (matter_id, result_version) WHERE changed',
        ],
      };
      assert.deepEqual(
        (
          await db.query(
            'SELECT pg_get_indexdef(indexrelid) definition FROM pg_index WHERE indrelid=$1::regclass',
            [table],
          )
        ).rows
          .map((r) => r.definition)
          .sort(),
        expectedIndexes[table]!.toSorted(),
      );
    }
    // The source is the canonical DDL. Assert every declared trigger's event,
    // timing, deferral, row/statement level, function and absence of conditions.
    for (const match of source().matchAll(
      /CREATE (CONSTRAINT )?TRIGGER (\w+) (.*?) ON ((?:public|_migration)\.\w+)(.*?) EXECUTE FUNCTION ([\w.]+)\(\);/gu,
    )) {
      const [, constraint, name, event, table, tail, fn] = match;
      const rows = (
        await db.query(
          'SELECT tgtype,tgenabled,tgdeferrable,tginitdeferred,tgfoid::regprocedure::text function,tgqual IS NULL unqualified,tgnargs,tgattr::text attributes FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname=$2 AND NOT tgisinternal',
          [table, name],
        )
      ).rows;
      assert.equal(rows.length, 1);
      const row = rows[0];
      const type =
        (tail!.includes('FOR EACH ROW') ? 1 : 0) +
        (event!.startsWith('BEFORE') ? 2 : 0) +
        (event!.includes('INSERT') ? 4 : 0) +
        (event!.includes('DELETE') ? 8 : 0) +
        (event!.includes('UPDATE') ? 16 : 0) +
        (event!.includes('TRUNCATE') ? 32 : 0);
      assert.equal(row.tgtype, type);
      assert.equal(row.tgenabled, 'O');
      assert.equal(row.tgdeferrable, !!constraint);
      assert.equal(row.tginitdeferred, !!constraint);
      assert.equal(row.function, fn!.replace(/^public\./u, '') + '()');
      assert.equal(row.unqualified, true);
      assert.equal(row.tgnargs, 0);
      if (!event!.includes('UPDATE OF')) assert.equal(row.attributes, '');
      else
        assert.equal(
          row.attributes,
          String(
            (
              await db.query(
                "SELECT attnum FROM pg_attribute WHERE attrelid='public.hearings'::regclass AND attname='matter_id'",
              )
            ).rows[0].attnum,
          ),
        );
    }
    const bad = (
      await db.query(
        `SELECT id FROM (SELECT id FROM public.closed_report_selections UNION SELECT matter_id FROM _migration.closed_report_selection_change UNION SELECT matter_id FROM _migration.closed_report_selection_submission) x WHERE NOT _migration.closed_report_selection_valid(id)`,
      )
    ).rows;
    assert.deepEqual(
      bad,
      [],
      'Report selection current/history/receipt/audit correspondence and exact parent membership',
    );
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'Report selection invariant failed');
  }
  return failures;
}
