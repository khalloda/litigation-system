import {
  task69CompensationCatalog,
  assertTask69Compensation,
} from './lib/task69-compensation-checkpoint';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionClaims } from '../src/lib/auth/session';
import {
  loadTask69Contract,
  type Row,
  type Task69Entry,
  task69Digest,
} from './lib/task69-contract';
import {
  prepareTask69Operation,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
  withTask69Fixture,
  bindTask69Operation,
} from './lib/task69-runner';
import { executeTask69Lookup, executeTask69Parties } from './lib/task69-matter-executor';
import { executeTask69Lawyers } from './lib/task69-lawyer-executor';
import { executeTask69Admin } from './lib/task69-admin-executor';
import { executeTask69Step, executeTask69GeneratedParent } from './lib/task69-step-executor';
import { executeTask69Destination } from './lib/task69-destination-executor';
import { executeTask69Poa } from './lib/task69-poa-executor';
import { executeTask69Document } from './lib/task69-document-executor';
import { executeTask69Fee } from './lib/task69-fee-executor';
import { executeTask69History } from './lib/task69-history-executor';
import { compensateTask69Operation } from './lib/task69-compensation-executor';
async function main() {
  const started = new Date().toISOString(),
    directory = process.env.TASK69_APPROVED_DIRECTORY!,
    privateRoot = process.env.TASK69_PRIVATE_ROOT!,
    output = process.env.TASK69_EVIDENCE_OUTPUT!,
    draft = process.argv.includes('--draft');
  const descriptor = JSON.parse(readFileSync(join(privateRoot, 'fixture-descriptor.json'), 'utf8')),
    sessions = JSON.parse(readFileSync(join(privateRoot, 'fixture-logins.json'), 'utf8')) as {
      role: string;
      claims: SessionClaims;
    }[],
    authority = sessions.find((s) => s.role === 'Administrator')!.claims,
    contract = loadTask69Contract(directory);
  const operation = prepareTask69Operation({
    directory,
    operationId: randomUUID(),
    cluster: descriptor.cluster,
    database: descriptor.database,
    runnerSha256: task69RunnerSourceDigest(process.cwd()),
    schemaSha256: task69SchemaSourceDigest(process.cwd()),
  });
  const probes: string[] = [],
    applied: Row[] = [],
    tables = [
      'matters',
      'matter_parties',
      'matter_party_roles',
      'matter_lawyers',
      'lookup_party_role',
      'lookup_court',
      'lookup_matter_destination',
      'admin_tasks',
      'admin_task_assignees',
      'task_actions',
      'powers_of_attorney',
      'power_of_attorney_lawyers',
      'documents',
      'document_matters',
      'document_responsible_people',
      'fee_letters',
      'fee_letter_matters',
      'fee_letter_matter_scopes',
      'matter_fee_letter_references',
    ];
  let result: Row = {};
  await withTask69Fixture(operation, async (db) => {
    const snapshot = async () => {
      const values: Record<string, Row[]> = {};
      for (const table of tables)
        values[table] = (
          await db.query(`SELECT to_jsonb(t) value FROM public.${table} t ORDER BY id`)
        ).rows.map((r) => r.value);
      return values;
    };
    const baseline = await snapshot();
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      if (draft)
        await db.query(
          readFileSync('prisma/migrations/20261008030000_task69_compensation/migration.sql', 'utf8')
            .replace(/^BEGIN;$/mu, '')
            .replace(/^COMMIT;$/mu, ''),
        );
      writeFileSync(
        output.replace('.json', '-schema.json'),
        JSON.stringify(await task69CompensationCatalog(db), null, 2) + '\n',
        { flag: 'wx' },
      );
      await bindTask69Operation(db, operation, authority);
      applied.push(await executeTask69Destination(db, operation, authority));
      const stage = (name: keyof typeof contract.stages) =>
        contract.stages[name].map((id) => contract.byIssue.get(id)!);
      const selections: [Task69Entry[], typeof executeTask69Parties][] = [
        [
          stage('S1-party-display').filter((e) =>
            [402, 701, 702].some((n) => e.issueId.endsWith(':' + n)),
          ),
          executeTask69Parties,
        ],
        [
          stage('S2-lawyer-membership').filter((e) => e.issueId.endsWith(':431')),
          executeTask69Lawyers,
        ],
        [
          stage('S3-admin-parents')
            .filter((e, i) => i === 0 || Number((e.approvedOutcome.task as Row).legacy_id) === 8971)
            .slice(0, 2),
          executeTask69Admin,
        ],
        [
          stage('S4-step-restoration')
            .filter(
              (e) =>
                typeof (e.approvedOutcome.step as Row).parentTask === 'number' ||
                (e.approvedOutcome.step as Row).parentTask === null,
            )
            .slice(0, 2),
          executeTask69Step,
        ],
        [
          stage('S5-poa-membership')
            .filter((e, i) => i === 0 || Number(e.approvedOutcome.poaId) === 100)
            .slice(0, 2),
          executeTask69Poa,
        ],
        [
          stage('S6-documents').filter(
            (e, i) => i < 2 || [173, 180, 342].includes(Number(e.approvedOutcome.documentId)),
          ),
          executeTask69Document,
        ],
        [
          stage('S7-fee-provenance')
            .filter(
              (e, i) =>
                i < 2 ||
                e.approvedOutcome.scope === 'BOUNDED_ORIGINAL_WORK' ||
                e.approvedOutcome.direction === 'REVERSE',
            )
            .slice(0, 24),
          executeTask69Fee,
        ],
        [
          stage('S8-history-dispositions')
            .filter((e, i) => i === 0 || e.store.startsWith('deferred.'))
            .filter((e, i, a) => i === 0 || e.store !== a[i - 1]!.store),
          executeTask69History,
        ],
      ];
      for (const [entries, execute] of selections) {
        assert(entries.length > 0);
        for (const entry of entries) {
          for (const lookup of entry.expectedStateGuards.lookupPreconditions.filter(
            (l) => l.expectedCardinality === 0,
          )) {
            if (lookup.exactLabel === 'الهيئة العامة للاستثمار والمناطق الحرة') continue;
            const dependency = operation.allowlist.find(
              (a) =>
                a.issue_id.startsWith('LOOKUP/') &&
                JSON.parse(a.payload_text).namespace === lookup.table &&
                JSON.parse(a.payload_text).exactLabel === lookup.exactLabel,
            )!;
            assert(dependency);
            applied.push(await executeTask69Lookup(db, operation, dependency.issue_id, authority));
          }
          applied.push(await execute(db, operation, entry, authority));
        }
      }
      applied.push(
        await executeTask69GeneratedParent(
          db,
          operation,
          operation.allowlist.find((a) => a.issue_id.startsWith('GENERATED-PARENT/'))!.issue_id,
          authority,
        ),
      );
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      const auditBefore = (await db.query('SELECT count(*)::int n FROM public.audit_events'))
        .rows[0].n;
      console.log(
        'Applied compensation representatives',
        new Set(applied.map((r) => r.receipt_id)).size,
      );
      const fault = async (name: string, pattern: RegExp, work: () => Promise<unknown>) => {
        const faultBefore = await snapshot(),
          faultAudit = (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0]
            .n;
        await db.query('SAVEPOINT fault');
        let error: unknown;
        try {
          await work();
        } catch (e) {
          error = e;
        }
        await db.query('ROLLBACK TO SAVEPOINT fault');
        assert(error instanceof Error, name);
        assert.match(error.message, pattern, name + ': ' + error.message);
        assert.deepEqual(
          await snapshot(),
          faultBefore,
          'Refusal preserves complete business state',
        );
        assert.equal(
          (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0].n,
          faultAudit,
        );
        probes.push(name);
      };
      await fault('denied-role-cannot-compensate', /authorized matter session/u, () =>
        compensateTask69Operation(
          db,
          operation,
          contract,
          sessions.find((s) => s.role === 'Lawyer')!.claims,
        ),
      );
      await fault('expired-session-cannot-compensate', /authorized matter session/u, () =>
        compensateTask69Operation(db, operation, contract, {
          ...authority,
          absoluteExpiresAt: Date.now() - 1000,
        }),
      );
      await fault(
        'failure-before-compensation-journal-rolls-back-business-and-audit',
        /isolated_compensation_journal_failure/u,
        async () => {
          await db.query(
            "ALTER TABLE _migration.task69_receipt ADD CONSTRAINT isolated_compensation_journal_failure CHECK(phase<>'compensate') NOT VALID",
          );
          await compensateTask69Operation(db, operation, contract, authority);
        },
      );
      await fault(
        'later-genuine-native-edit-refuses-compensation',
        /changed|differs|postimage|stale/iu,
        async () => {
          assert(
            applied.some((r) => (r.returned_ids as Row).poaId === 100),
            'POA100 history disposition included',
          );
          await db.query('SET CONSTRAINTS ALL DEFERRED');
          const id = 100;
          await db.query(
            "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
          );
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
            await db.query('SELECT public.poa_edit_state($1,$2,$3,$4,$5) value', [...args, id])
          ).rows[0].value;
          await db.query('SELECT public.poa_edit_save($1,$2,$3,$4,$5::jsonb)', [
            ...args,
            JSON.stringify({
              operation: 'update',
              id,
              version: state.record.version,
              submission: randomUUID(),
              values: { notes: 'TASK69 ISOLATED COMPENSATION REFUSAL' },
              lawyers: state.lawyers
                .filter((r: { retired: boolean }) => !r.retired)
                .map((r: { personId: number }) => r.personId),
              facts: null,
            }),
          ]);
          await db.query('RESET ROLE');
          await db.query('SET CONSTRAINTS ALL IMMEDIATE');
          await compensateTask69Operation(db, operation, contract, authority);
        },
      );
      const compensation = await compensateTask69Operation(db, operation, contract, authority),
        after = await snapshot();
      const clean = (r: Row) =>
        Object.fromEntries(
          Object.entries(r).filter(
            ([k]) => !['row_version', 'updated_at', 'updated_by'].includes(k),
          ),
        );
      for (const table of tables) {
        const old = new Map(baseline[table]!.map((r) => [r.id, r]));
        for (const row of after[table]!) {
          const prior = old.get(row.id);
          if (prior) {
            assert.deepEqual(
              clean(row),
              clean(prior),
              'Existing business fields restored: ' + table + '/' + row.id,
            );
            old.delete(row.id);
            continue;
          }
          if (table === 'admin_task_assignees')
            assert(after.admin_tasks!.some((t) => t.id === row.task_id && t.is_archived === true));
          else if (table === 'fee_letter_matter_scopes')
            assert(after.fee_letter_matters!.some((m) => m.id === row.id && m.is_retired === true));
          else
            assert(
              row.is_retired === true || row.is_archived === true || row.is_active === false,
              'Restored source object retained but removed from active business projection: ' +
                table,
            );
        }
        assert.equal(old.size, 0, 'No original object deleted');
      }
      probes.push('exact-original-business-projection-with-source-rows-retained');
      const auditAfter = (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0]
        .n;
      assert.deepEqual(
        await compensateTask69Operation(db, operation, contract, authority),
        compensation,
      );
      assert.deepEqual(await snapshot(), after);
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0].n,
        auditAfter,
      );
      probes.push('duplicate-compensation-keeps-receipts-rows-and-audits');
      await fault(
        'later-native-edit-refuses-historical-compensation-retry',
        /changed|differs|postimage|stale/iu,
        async () => {
          assert(
            applied.some((r) => (r.returned_ids as Row).poaId === 100),
            'POA100 history disposition included',
          );
          await db.query('SET CONSTRAINTS ALL DEFERRED');
          const id = 100;
          await db.query(
            "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
          );
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
            await db.query('SELECT public.poa_edit_state($1,$2,$3,$4,$5) value', [...args, id])
          ).rows[0].value;
          await db.query('SELECT public.poa_edit_save($1,$2,$3,$4,$5::jsonb)', [
            ...args,
            JSON.stringify({
              operation: 'update',
              id,
              version: state.record.version,
              submission: randomUUID(),
              values: { notes: 'TASK69 ISOLATED COMPENSATION REFUSAL' },
              lawyers: state.lawyers
                .filter((r: { retired: boolean }) => !r.retired)
                .map((r: { personId: number }) => r.personId),
              facts: null,
            }),
          ]);
          await db.query('RESET ROLE');
          await db.query('SET CONSTRAINTS ALL IMMEDIATE');
          await compensateTask69Operation(db, operation, contract, authority);
        },
      );
      await assertTask69Compensation(db);
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      result = {
        status: 'PASS',
        draft,
        operation: operation.operationId,
        receiptCount: compensation.length,
        probes,
        compensation,
        baselineDigest: task69Digest(baseline),
        afterDigest: task69Digest(after),
        businessProjection:
          'Original fields restored; new objects retained inactive/retired/archived; truthful metadata advances',
        auditBefore,
        auditAfter,
      };
    } finally {
      await db.query('ROLLBACK');
    }
    assert.deepEqual(
      await snapshot(),
      baseline,
      'Disposable test transaction restored all business rows',
    );
  });
  writeFileSync(
    output,
    JSON.stringify(
      {
        ...result,
        started,
        completed: new Date().toISOString(),
        runnerSha256: operation.runnerSha256,
        schemaSha256: operation.schemaSha256,
        ownerActions: 'NOT_APPLIED',
        rolledBack: true,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  console.log(JSON.stringify({ status: 'PASS', output, probes }));
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
