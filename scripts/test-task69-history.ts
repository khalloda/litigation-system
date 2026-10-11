import { task69HistoryCatalog } from './lib/task69-history-checkpoint';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionClaims } from '../src/lib/auth/session';
import { loadTask69Contract, task69Sha, task69Digest, type Row } from './lib/task69-contract';
import {
  prepareTask69Operation,
  withTask69Fixture,
  bindTask69Operation,
  task69RunnerSourceDigest,
} from './lib/task69-runner';
import { executeTask69History } from './lib/task69-history-executor';
async function main() {
  const started = new Date().toISOString(),
    directory = process.env['TASK69_APPROVED_DIRECTORY']!,
    root = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!,
    contract = loadTask69Contract(directory),
    descriptor = JSON.parse(readFileSync(join(root, 'fixture-descriptor.json'), 'utf8'));
  const accounts = JSON.parse(readFileSync(join(root, 'fixture-logins.json'), 'utf8')) as {
      role: string;
      claims: SessionClaims;
    }[],
    authority = accounts.find((a) => a.role === 'Administrator')!.claims;
  const sql = readFileSync(
      'prisma/migrations/20261008020000_task69_history_dispositions/migration.sql',
      'utf8',
    ),
    draft = process.argv.includes('--draft'),
    operation = prepareTask69Operation({
      directory,
      operationId: randomUUID(),
      cluster: descriptor.cluster,
      database: descriptor.database,
      runnerSha256: task69RunnerSourceDigest(resolve('.')),
      schemaSha256: task69Sha(sql),
    }),
    results: Row[] = [],
    probes: string[] = [],
    cells = new Map<string, Row>();
  await withTask69Fixture(operation, async (db) => {
    const tables = (
      await db.query(
        "SELECT n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND (n.nspname IN('public','quarantine') OR (n.nspname='_migration' AND c.relname IN('attendee_source_cell','attendee_source_span'))) ORDER BY 1,2",
      )
    ).rows;
    const capture = async () => {
      const rows = [];
      for (const t of tables)
        rows.push({
          table: t.schema + '.' + t.name,
          ...(
            await db.query(
              `SELECT count(*)::int n,md5(string_agg(to_jsonb(r)::text,E'\\n' ORDER BY to_jsonb(r)::text)) digest FROM "${t.schema}"."${t.name}" r`,
            )
          ).rows[0],
        });
      return rows;
    };
    const before = await capture();
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      if (draft) await db.query(sql.replace(/^BEGIN;$/mu, '').replace(/^COMMIT;$/mu, ''));
      writeFileSync(
        output.replace('.json', '-schema.json'),
        JSON.stringify(await task69HistoryCatalog(db), null, 2) + '\n',
        { flag: 'wx' },
      );
      await bindTask69Operation(db, operation, authority);
      for (const id of contract.stages['S8-history-dispositions']) {
        const entry = contract.byIssue.get(id)!,
          receipt = await executeTask69History(db, operation, entry, authority);
        assert.deepEqual(await executeTask69History(db, operation, entry, authority), receipt);
        const d = (
          await db.query(
            'SELECT * FROM _migration.task69_history_disposition WHERE receipt_id=$1',
            [receipt.receipt_id],
          )
        ).rows[0];
        assert.deepEqual(d.source_values, entry.originalIssue.original);
        assert.deepEqual(d.approved_outcome, entry.approvedOutcome);
        if (d.kind === 'attendee-fragment') {
          const w = d.witness as Row;
          const key = (w.cell as Row).cell_id as string;
          const old = cells.get(key);
          if (old) assert.deepEqual(old, w);
          else cells.set(key, w);
        }
        results.push({
          issueId: id,
          receiptId: receipt.receipt_id!,
          returned: receipt.returned_ids!,
          sourceSha256: entry.originalJsonSha256,
          witnessSha256: task69Digest(d.witness),
        });
      }
      assert.equal(results.length, 137);
      assert.equal(cells.size, 7);
      assert.equal(
        [...cells.values()].reduce((n, c) => n + (c.spans as Row[]).length, 0),
        23,
      );
      assert.deepEqual(
        (
          await db.query(
            'SELECT kind,count(*)::int n FROM _migration.task69_history_disposition GROUP BY kind ORDER BY kind',
          )
        ).rows,
        [
          { kind: 'attendee-fragment', n: 10 },
          { kind: 'historical-staff', n: 123 },
          { kind: 'unassigned-hearing', n: 4 },
        ],
      );
      assert.deepEqual(
        await capture(),
        before,
        'Every business, quarantine, audit and source cell row unchanged',
      );
      probes.push(
        'all137-exact-historical-dispositions',
        'seven-complete-cells23-UTF16-spans',
        'all-public-quarantine-source-rows-unchanged',
        'unchanged-retry-no-extra-receipts',
      );
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      await db.query('SET CONSTRAINTS ALL DEFERRED');
      const example = contract.byIssue.get(contract.stages['S8-history-dispositions'][0]!)!;
      const fault = async (name: string, pattern: RegExp, work: () => Promise<unknown>) => {
        await db.query('SAVEPOINT history_fault');
        let refused = false;
        try {
          await work();
        } catch (e) {
          assert.match(e instanceof Error ? e.message : String(e), pattern);
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT history_fault');
        assert(refused, name);
        probes.push(name);
      };
      await fault(
        'expired-old-receipt-refused',
        /Current authorized matter session required/u,
        () =>
          executeTask69History(db, operation, example, {
            ...authority,
            absoluteExpiresAt: Date.now() - 1,
          }),
      );
      for (const role of ['Lawyer', 'Paralegal'])
        await fault(
          role + '-restoration-refused',
          /Current authorized matter session required/u,
          () =>
            executeTask69History(
              db,
              operation,
              example,
              accounts.find((a) => a.role === role)!.claims,
            ),
        );
      await fault('runtime-has-no-journal-write', /permission denied/u, async () => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await executeTask69History(db, operation, example, authority);
      });
      const changed = structuredClone(example);
      changed.approvedOutcome.preserveAllValues = false;
      await fault(
        'changed-decision-refused',
        /Source, authority, payload or complete guard closure changed/u,
        () => executeTask69History(db, operation, changed, authority),
      );
      await fault('immutable-disposition-update-refused', /immutable|append-only/iu, () =>
        db.query(
          "UPDATE _migration.task69_history_disposition SET kind='attendee-fragment' WHERE receipt_id=$1",
          [results[0]!.receiptId],
        ),
      );
      const attendee = contract.stages['S8-history-dispositions']
        .map((id) => contract.byIssue.get(id)!)
        .find((e) => e.store === 'quarantine.attendee_span')!;
      await fault(
        'changed-full-cell-witness-refused',
        /Exact current approved factual history required/u,
        async () => {
          await db.query(
            "SELECT set_config('litigation.task69_operation',$1,true),set_config('litigation.task69_issue',$2,true)",
            [operation.operationId, attendee.issueId],
          );
          const witness = (
            await db.query('SELECT _migration.task69_history_context($1,$2::jsonb) value', [
              attendee.issueId,
              JSON.stringify(attendee.approvedOutcome),
            ])
          ).rows[0].value;
          witness.spans[0].start_offset = 1;
          await db.query(
            'INSERT INTO _migration.task69_history_disposition(receipt_id,kind,source_values,approved_outcome,witness) VALUES($1,$2,$3,$4,$5)',
            [
              randomUUID(),
              'attendee-fragment',
              attendee.originalIssue.original,
              attendee.approvedOutcome,
              witness,
            ],
          );
        },
      );
      await fault(
        'later-native-hearing-edit-refuses-historical-retry',
        /changed|differs|stale/iu,
        async () => {
          await db.query(
            "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
          );
          await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
          await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
            randomUUID(),
            randomUUID(),
            authority.auditSessionId,
          ]);
          const h = (
            await db.query('SELECT row_version FROM public.hearings WHERE id=$1', [
              example.approvedOutcome.hearingId,
            ])
          ).rows[0];
          await db.query('SET LOCAL ROLE litigation_runtime');
          await db.query('SELECT public.hearing_edit_save($1,$2,$3,$4::timestamptz,$5::jsonb)', [
            authority.userId,
            authority.sessionVersion,
            authority.role,
            new Date(authority.absoluteExpiresAt).toISOString(),
            JSON.stringify({
              id: example.approvedOutcome.hearingId,
              version: String(h.row_version),
              submission: randomUUID(),
              values: { notes: 'TASK69 ISOLATED LATER EDIT PROBE' },
            }),
          ]);
          await db.query('RESET ROLE');
          assert.equal(
            (
              await db.query('SELECT _migration.task69_history_receipt_valid($1) valid', [
                results[0]!.receiptId,
              ])
            ).rows[0].valid,
            true,
            'Factual receipt remains truthful after native edit',
          );
          await executeTask69History(db, operation, example, authority);
        },
      );
      const assistant = accounts.find((a) => a.role === 'Litigation Assistant')!.claims;
      assert.deepEqual(
        await executeTask69History(db, operation, example, assistant),
        await executeTask69History(db, operation, example, authority),
      );
      probes.push('current-assistant-authority-accepted');
      // Revoke the fixture account transactionally: even a previously completed receipt must reauthorize.
      await fault(
        'disabled-account-old-receipt-refused',
        /Current authorized matter session required/u,
        async () => {
          await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
          await db.query(
            'UPDATE public.user_accounts SET is_enabled=false,session_version=session_version+1 WHERE id=$1',
            [assistant.userId],
          );
          await executeTask69History(db, operation, example, assistant);
        },
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await capture(), before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'PASS',
            started,
            completed: new Date().toISOString(),
            draft,
            operationId: operation.operationId,
            runnerSha256: operation.runnerSha256,
            schemaSha256: operation.schemaSha256,
            results,
            probes,
            cells: [...cells.values()],
            before,
            after: before,
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log(
        JSON.stringify({
          status: 'PASS',
          issues: results.length,
          probes: probes.length,
          cells: cells.size,
          spans: 23,
          output,
        }),
      );
    } catch (e) {
      await db.query('ROLLBACK');
      assert.deepEqual(await capture(), before);
      throw e;
    }
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
