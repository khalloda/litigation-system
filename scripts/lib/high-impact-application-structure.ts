import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';

export const HIGH_IMPACT_MIGRATION = '20260904180000_prepare_high_impact_application';

/** Bounded checks for the new migration's own guards, not a general security scan. */
export async function assertHighImpactStructure(db: ClientBase): Promise<boolean> {
  const tables = (
    await db.query<{ name: string }>(
      `SELECT tablename name FROM pg_tables WHERE schemaname='_migration'
     AND tablename IN ('client_branch_compatibility','high_impact_application','high_impact_resolution') ORDER BY tablename`,
    )
  ).rows.map((row) => row.name);
  const migrations = (
    await db.query<{ checksum: string }>(
      `SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      [HIGH_IMPACT_MIGRATION],
    )
  ).rows;
  if (tables.length === 0 && migrations.length === 0) return false;
  assert.deepEqual(
    tables,
    ['client_branch_compatibility', 'high_impact_application', 'high_impact_resolution'],
    'incomplete Task 3.5B schema',
  );
  // During the migration transaction Prisma has not marked it finished yet;
  // normal checks must see exactly one completed migration with identical bytes.
  assert.equal(migrations.length, 1, 'Task 3.5B migration is not deployed completely');
  const bytes = readFileSync(`prisma/migrations/${HIGH_IMPACT_MIGRATION}/migration.sql`);
  assert.equal(
    migrations[0]!.checksum,
    createHash('sha256').update(bytes).digest('hex'),
    'Task 3.5B migration provenance changed',
  );
  const sql = bytes.toString('utf8');
  const expected = [
    ...sql.matchAll(
      /CREATE FUNCTION _migration\.([a-z_]+)\(\) RETURNS trigger\s+LANGUAGE plpgsql( SECURITY DEFINER)? SET search_path=([^\n]+) AS \$\$([\s\S]*?)\$\$;/g,
    ),
  ];
  assert.equal(expected.length, 4);
  const functions = (
    await db.query<{
      name: string;
      body: string;
      definer: boolean;
      config: string[];
      public_execute: boolean;
      runtime_execute: boolean;
    }>(
      `SELECT p.proname name,p.prosrc body,p.prosecdef definer,p.proconfig config,
       EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
       has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime_execute
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='_migration' AND p.proname=ANY($1::text[])`,
      [expected.map((match) => match[1])],
    )
  ).rows;
  assert.equal(functions.length, 4, 'missing Task 3.5B guard function');
  for (const match of expected) {
    const actual = functions.find((row) => row.name === match[1])!;
    assert.equal(
      actual.body.trim().replaceAll('\r\n', '\n'),
      match[4]!.trim().replaceAll('\r\n', '\n'),
      'Task 3.5B guard body changed',
    );
    assert.equal(actual.definer, Boolean(match[2]));
    assert.deepEqual(actual.config, [`search_path=${match[3]!.split(',').join(', ')}`]);
    assert.equal(actual.public_execute, false, 'public guard execution grant');
    assert.equal(actual.runtime_execute, false, 'runtime guard execution grant');
  }
  const triggers = (
    await db.query<{
      name: string;
      enabled: string;
      deferred: boolean;
      definition: string;
      relation: string;
      routine: string;
      type: number;
      deferrable: boolean;
      qualifier: string | null;
      arguments: number;
      columns: string[];
    }>(
      `SELECT t.tgname name,t.tgenabled enabled,t.tginitdeferred deferred,pg_get_triggerdef(t.oid) definition,
       t.tgrelid::regclass::text relation,t.tgfoid::regproc::text routine,t.tgtype::integer type,
       t.tgdeferrable deferrable,t.tgqual::text qualifier,t.tgnargs::integer arguments,
       ARRAY(SELECT a.attname::text FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY x(attnum,position)
         JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=x.attnum ORDER BY x.position) columns
     FROM pg_trigger t WHERE NOT t.tgisinternal AND (t.tgrelid IN (
       '_migration.client_branch_compatibility'::regclass,'_migration.high_impact_application'::regclass,
       '_migration.high_impact_resolution'::regclass) OR t.tgname='matters_client_branch_compatibility') ORDER BY t.tgname`,
    )
  ).rows;
  assert.equal(triggers.length, 7, 'Task 3.5B trigger inventory changed');
  assert.ok(
    triggers.every((row) => row.enabled === 'O'),
    'disabled Task 3.5B guard',
  );
  assert.equal(
    triggers.filter((row) => row.deferred).length,
    2,
    'incomplete deferred resolution guard',
  );
  const expectedTriggers = new Map([
    [
      'matters_client_branch_compatibility',
      ['matters', '_migration.enforce_client_branch_compatibility', 23, false],
    ],
    [
      'client_branch_compatibility_audit',
      ['_migration.client_branch_compatibility', '_migration.audit_branch_compatibility', 5, false],
    ],
    [
      'high_impact_application_complete',
      ['_migration.high_impact_application', '_migration.check_high_impact_completeness', 5, true],
    ],
    [
      'high_impact_resolution_complete',
      ['_migration.high_impact_resolution', '_migration.check_high_impact_completeness', 5, true],
    ],
    ...tables.map((table): [string, (string | number | boolean)[]] => [
      `${table}_append_only`,
      [`_migration.${table}`, '_migration.refuse_high_impact_evidence_change', 58, false],
    ]),
  ]);
  for (const trigger of triggers) {
    assert.deepEqual(
      [trigger.relation, trigger.routine, trigger.type, trigger.deferrable],
      expectedTriggers.get(trigger.name),
      'Task 3.5B trigger definition changed',
    );
    assert.equal(trigger.qualifier, null, 'conditional Task 3.5B trigger');
    assert.equal(trigger.arguments, 0, 'unexpected Task 3.5B trigger arguments');
    assert.deepEqual(
      trigger.columns,
      trigger.name === 'matters_client_branch_compatibility' ? ['client_id', 'branch_id'] : [],
    );
  }
  for (const table of tables) {
    const privileges = (
      await db.query<{ allowed: boolean }>(
        `SELECT has_table_privilege('litigation_runtime',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`,
        [`_migration.${table}`],
      )
    ).rows[0]!.allowed;
    assert.equal(privileges, false, 'runtime can access private Task 3.5B evidence');
  }
  const constraints = (
    await db.query<{ bad: number }>(
      `SELECT count(*)::integer bad FROM pg_constraint WHERE conrelid IN (
       '_migration.client_branch_compatibility'::regclass,'_migration.high_impact_application'::regclass,
       '_migration.high_impact_resolution'::regclass) AND NOT convalidated`,
    )
  ).rows[0]!.bad;
  assert.equal(constraints, 0, 'unvalidated Task 3.5B constraint');
  const constraintInventory = (
    await db.query<{ digest: string; count: number }>(`
    SELECT count(*)::integer count,encode(sha256(convert_to(string_agg(
      c.conrelid::regclass::text||':'||c.conname||':'||pg_get_constraintdef(c.oid),E'\n'
      ORDER BY c.conrelid::regclass::text COLLATE "C",c.conname COLLATE "C"),'UTF8')),'hex') digest
    FROM pg_constraint c WHERE c.conrelid IN (
      '_migration.client_branch_compatibility'::regclass,'_migration.high_impact_application'::regclass,
      '_migration.high_impact_resolution'::regclass)`)
  ).rows[0]!;
  assert.equal(constraintInventory.count, 31, 'Task 3.5B constraint inventory changed');
  assert.equal(
    constraintInventory.digest,
    'a0310468acf5caa18c64a488d0fe24d42ff22c282a58d64b69907ad48a5b4bc7',
    'Task 3.5B constraint definitions changed',
  );
  return true;
}
