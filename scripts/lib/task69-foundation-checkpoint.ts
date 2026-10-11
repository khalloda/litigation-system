import { task69PoaApplied } from './task69-poa-checkpoint';
import { task69StepApplied } from './task69-step-checkpoint';
import {
  task69ContinuationApplied,
  currentTask69AuthorizationBody,
} from './task69-receipt-continuation-checkpoint';
import { task69AdminRestorationApplied } from './task69-admin-restoration-checkpoint';
import { task69DestinationApplied } from './task69-destination-checkpoint';
import { task69LawyerApplied } from './task69-lawyer-checkpoint';
import { task69RestorationApplied } from './task69-restoration-checkpoint';
import { task69PartyApplied, task69PartyExpected } from './task69-party-checkpoint';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';

export const TASK69_FOUNDATION_MIGRATION = '20261007120000_task69_operation_contract';
const tables = ['task69_allowlist', 'task69_delta', 'task69_operation', 'task69_receipt'];
const source = () => readFileSync(`prisma/migrations/${TASK69_FOUNDATION_MIGRATION}/migration.sql`);

export async function task69FoundationCatalog(db: ClientBase) {
  return {
    columns: (
      await db.query(
        "SELECT c.relname table_name,a.attname column_name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='_migration' AND c.relname=ANY($1::text[]) AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",
        [tables],
      )
    ).rows,
    constraints: (
      await db.query(
        "SELECT c.relname table_name,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='_migration' AND c.relname=ANY($1::text[]) ORDER BY 1,2",
        [tables],
      )
    ).rows,
    indexes: (
      await db.query(
        "SELECT c.relname table_name,pg_get_indexdef(i.indexrelid) definition,i.indisvalid,i.indisready,i.indislive FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='_migration' AND c.relname=ANY($1::text[]) ORDER BY 1,2",
        [tables],
      )
    ).rows,
    triggers: (
      await db.query(
        "SELECT c.relname table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='_migration' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal ORDER BY 1,2",
        [tables],
      )
    ).rows,
    functions: (
      await db.query(
        "SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,p.prokind,p.proisstrict,p.proleakproof,p.proparallel,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname=ANY($1::text[]) ORDER BY 1,2",
        [
          [
            ...source()
              .toString()
              .matchAll(/CREATE FUNCTION _migration\.(task69_\w+)\(/gu),
          ].map((m) => m[1]),
        ],
      )
    ).rows,
  };
}

export async function task69FoundationApplied(db: ClientBase): Promise<boolean> {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',
      [TASK69_FOUNDATION_MIGRATION],
    )
  ).rows;
  const relations = (
    await db.query(
      "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='_migration' AND c.relname=ANY($1::text[]) AND c.relkind='r' ORDER BY 1",
      [tables],
    )
  ).rows.map((r) => r.relname);
  if (!ledger.length) {
    assert.deepEqual(relations, [], 'Unledgered Task69 foundation');
    const functions = (await task69FoundationCatalog(db)).functions;
    assert.deepEqual(functions, [], 'Unledgered Task69 functions');
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && ledger[0].applied_steps_count === 1,
    'Task69 foundation incomplete',
  );
  assert.equal(ledger[0].checksum, task69Sha(source()), 'Task69 migration checksum differs');
  assert.deepEqual(relations, tables);
  return true;
}

/** Permanent checks retain the exact schema/ACL boundaries and immutable
 * historical receipt correspondence; later native edits need not erase history. */
export async function task69FoundationFailures(db: ClientBase): Promise<string[]> {
  const failures: string[] = [];
  try {
    if (!(await task69FoundationApplied(db))) return failures;
    const expected = JSON.parse(readFileSync('scripts/lib/task69-foundation-catalog.json', 'utf8'));
    if (await task69PartyApplied(db)) {
      expected.constraints.push(
        ...task69PartyExpected().constraints.filter(
          (c: { table_name: string }) => c.table_name === 'task69_delta',
        ),
      );
      expected.constraints.sort(
        (a: { table_name: string; conname: string }, b: { table_name: string; conname: string }) =>
          (a.table_name + '/' + a.conname).localeCompare(b.table_name + '/' + b.conname),
      );
    }
    if (await task69RestorationApplied(db)) {
      expected.constraints.push({
        table_name: 'task69_receipt',
        conname: 'task69_party_receipt_complete',
        contype: 't',
        convalidated: true,
        definition: 'TRIGGER DEFERRABLE INITIALLY DEFERRED',
      });
      expected.constraints.sort(
        (a: { table_name: string; conname: string }, b: { table_name: string; conname: string }) =>
          (a.table_name + '/' + a.conname).localeCompare(b.table_name + '/' + b.conname),
      );
      expected.triggers.push({
        table_name: 'task69_receipt',
        tgname: 'task69_party_receipt_complete',
        tgenabled: 'O',
        definition:
          'CREATE CONSTRAINT TRIGGER task69_party_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_party_receipt_complete()',
      });
      expected.triggers.sort(
        (a: { table_name: string; tgname: string }, b: { table_name: string; tgname: string }) =>
          (a.table_name + '/' + a.tgname).localeCompare(b.table_name + '/' + b.tgname),
      );
    }
    if (await task69LawyerApplied(db)) {
      expected.constraints.push({
        table_name: 'task69_receipt',
        conname: 'task69_lawyer_receipt_complete',
        contype: 't',
        convalidated: true,
        definition: 'TRIGGER DEFERRABLE INITIALLY DEFERRED',
      });
      expected.triggers.push({
        table_name: 'task69_receipt',
        tgname: 'task69_lawyer_receipt_complete',
        tgenabled: 'O',
        definition:
          'CREATE CONSTRAINT TRIGGER task69_lawyer_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_lawyer_receipt_complete()',
      });
    }
    if (await task69DestinationApplied(db)) {
      expected.constraints.push({
        table_name: 'task69_receipt',
        conname: 'task69_destination_receipt_complete',
        contype: 't',
        convalidated: true,
        definition: 'TRIGGER DEFERRABLE INITIALLY DEFERRED',
      });
      expected.triggers.push({
        table_name: 'task69_receipt',
        tgname: 'task69_destination_receipt_complete',
        tgenabled: 'O',
        definition:
          'CREATE CONSTRAINT TRIGGER task69_destination_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_destination_receipt_complete()',
      });
    }
    if (await task69AdminRestorationApplied(db)) {
      expected.constraints.push({
        table_name: 'task69_receipt',
        conname: 'task69_admin_receipt_complete',
        contype: 't',
        convalidated: true,
        definition: 'TRIGGER DEFERRABLE INITIALLY DEFERRED',
      });
      expected.triggers.push({
        table_name: 'task69_receipt',
        tgname: 'task69_admin_receipt_complete',
        tgenabled: 'O',
        definition:
          'CREATE CONSTRAINT TRIGGER task69_admin_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_admin_receipt_complete()',
      });
    }
    if (await task69StepApplied(db)) {
      expected.constraints.push({
        table_name: 'task69_receipt',
        conname: 'task69_step_receipt_complete',
        contype: 't',
        convalidated: true,
        definition: 'TRIGGER DEFERRABLE INITIALLY DEFERRED',
      });
      expected.triggers.push({
        table_name: 'task69_receipt',
        tgname: 'task69_step_receipt_complete',
        tgenabled: 'O',
        definition:
          'CREATE CONSTRAINT TRIGGER task69_step_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_step_receipt_complete()',
      });
    }
    if (await task69PoaApplied(db)) {
      expected.constraints.push({
        table_name: 'task69_receipt',
        conname: 'task69_poa_receipt_complete',
        contype: 't',
        convalidated: true,
        definition: 'TRIGGER DEFERRABLE INITIALLY DEFERRED',
      });
      expected.triggers.push({
        table_name: 'task69_receipt',
        tgname: 'task69_poa_receipt_complete',
        tgenabled: 'O',
        definition:
          'CREATE CONSTRAINT TRIGGER task69_poa_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_poa_receipt_complete()',
      });
    }
    expected.constraints.sort(
      (a: { table_name: string; conname: string }, b: { table_name: string; conname: string }) =>
        (a.table_name + '/' + a.conname).localeCompare(b.table_name + '/' + b.conname),
    );
    expected.triggers.sort(
      (a: { table_name: string; tgname: string }, b: { table_name: string; tgname: string }) =>
        (a.table_name + '/' + a.tgname).localeCompare(b.table_name + '/' + b.tgname),
    );
    if (await task69ContinuationApplied(db)) {
      const fn = expected.functions.find(
        (r: { proname: string }) => r.proname === 'task69_authorize_issue',
      );
      assert(fn);
      fn.prosrc = currentTask69AuthorizationBody();
    }
    assert.deepEqual(
      await task69FoundationCatalog(db),
      expected,
      'Task69 exact schema and function contract',
    );
    const grants = (
      await db.query(
        "SELECT c.relname,pg_get_userbyid(a.grantee) grantee,a.privilege_type FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname='_migration' AND c.relname=ANY($1::text[]) AND a.grantee<>c.relowner ORDER BY 1,2,3",
        [tables],
      )
    ).rows;
    assert.deepEqual(grants, [], 'Task69 private tables must have no external grants');
    const functions = expected.functions.map((r: { proname: string }) => r.proname);
    const execution = (
      await db.query(
        "SELECT p.proname,pg_get_userbyid(a.grantee) grantee,a.privilege_type FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='_migration' AND p.proname=ANY($1::text[]) AND a.grantee<>p.proowner ORDER BY 1,2,3",
        [functions],
      )
    ).rows;
    assert.deepEqual(execution, [], 'Task69 private functions must have no external grants');
    const invalidOperations = (
      await db.query(
        'SELECT operation_id FROM _migration.task69_operation WHERE NOT _migration.task69_contract_valid(operation_id)',
      )
    ).rows;
    assert.deepEqual(invalidOperations, [], 'Task69 sealed operation allowlist conservation');
    const invalidReceipts = (
      await db.query(
        'SELECT receipt_id FROM _migration.task69_receipt WHERE NOT _migration.task69_receipt_valid(receipt_id)',
      )
    ).rows;
    assert.deepEqual(invalidReceipts, [], 'Task69 atomic immutable audit/delta correspondence');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'Task69 foundation verification failed');
  }
  return failures;
}
