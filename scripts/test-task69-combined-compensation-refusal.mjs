import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withTask69Fixture } from './lib/task69-runner.ts';
import { loadTask69Contract } from './lib/task69-contract.ts';
import { compensateTask69Operation } from './lib/task69-compensation-executor.ts';
const privateRoot = process.env.TASK69_PRIVATE_ROOT,
  output = process.env.TASK69_EVIDENCE_OUTPUT;
const descriptor = JSON.parse(readFileSync(join(privateRoot, 'fixture-descriptor.json')));
assert.equal(descriptor.database, 'litigation_task69_combined');
const operation = JSON.parse(readFileSync(join(privateRoot, 'sealed-operation.json'))),
  contract = loadTask69Contract(process.env.TASK69_APPROVED_DIRECTORY),
  authority = JSON.parse(readFileSync(join(privateRoot, 'fixture-logins.json'))).find(
    (x) => x.role === 'Administrator',
  ).claims;
const started = new Date().toISOString();
async function main() {
  let outcome;
  await withTask69Fixture(operation, async (db) => {
    const snapshot = async () => {
      const states = {};
      for (const table of ['powers_of_attorney', 'power_of_attorney_lawyers', 'audit_events'])
        states[table] = (
          await db.query(
            "SELECT count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) hash FROM public." +
              table +
              ' t',
          )
        ).rows[0];
      states.receipts = (
        await db.query(
          'SELECT count(*)::int n FROM _migration.task69_receipt WHERE operation_id=$1',
          [operation.operationId],
        )
      ).rows[0].n;
      return states;
    };
    const baseline = await snapshot();
    assert([3585, 7170].includes(baseline.receipts));
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
      await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
        randomUUID(),
        randomUUID(),
        authority.auditSessionId,
      ]);
      const args = [
        authority.userId,
        authority.sessionVersion,
        authority.role,
        new Date(authority.absoluteExpiresAt).toISOString(),
      ];
      await db.query('SET LOCAL ROLE litigation_runtime');
      const state = (
        await db.query('SELECT public.poa_edit_state($1,$2,$3,$4,$5) value', [...args, 100])
      ).rows[0].value;
      const native = (
        await db.query('SELECT public.poa_edit_save($1,$2,$3,$4,$5::jsonb) value', [
          ...args,
          JSON.stringify({
            operation: 'update',
            id: 100,
            version: state.record.version,
            submission: randomUUID(),
            values: { notes: 'TASK69 ISOLATED LATER EDIT REFUSAL' },
            lawyers: state.lawyers.filter((x) => !x.retired).map((x) => x.personId),
            facts: null,
          }),
        ])
      ).rows[0].value;
      await db.query('RESET ROLE');
      assert.equal(native.changed, true);
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      await db.query('SET CONSTRAINTS ALL DEFERRED');
      const afterNative = await snapshot();
      await db.query('SAVEPOINT compensation_attempt');
      let message;
      try {
        await compensateTask69Operation(db, operation, contract, authority);
      } catch (e) {
        message = e.message;
      }
      await db.query('ROLLBACK TO SAVEPOINT compensation_attempt');
      assert(message);
      assert.match(message, /changed|differs|postimage|stale/iu);
      assert.deepEqual(await snapshot(), afterNative);
      outcome = {
        status: 'PASS',
        phase: baseline.receipts === 3585 ? 'before-compensation' : 'after-compensation',
        message,
        genuineNativeEdit: true,
        completeOperationReceipts: baseline.receipts,
        failedCompensationAddedNothing: true,
      };
    } finally {
      await db.query('ROLLBACK');
    }
    assert.deepEqual(await snapshot(), baseline);
  });
  writeFileSync(
    output,
    JSON.stringify(
      {
        ...outcome,
        started,
        completed: new Date().toISOString(),
        ownerActions: 'NOT_APPLIED',
        rolledBack: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(outcome));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
