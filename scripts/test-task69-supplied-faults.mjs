import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadTask69Contract } from './lib/task69-contract.ts';
import {
  prepareTask69Operation,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
  withTask69Fixture,
  bindTask69Operation,
  compileTask69Entries,
} from './lib/task69-runner.ts';
import { executeTask69Parties } from './lib/task69-matter-executor.ts';
import { executeTask69Lawyers } from './lib/task69-lawyer-executor.ts';
import { executeTask69Admin } from './lib/task69-admin-executor.ts';
import { executeTask69Step } from './lib/task69-step-executor.ts';
import { executeTask69Poa } from './lib/task69-poa-executor.ts';
import { executeTask69Document } from './lib/task69-document-executor.ts';
import { executeTask69Fee } from './lib/task69-fee-executor.ts';
import { executeTask69History } from './lib/task69-history-executor.ts';
const started = new Date().toISOString(),
  directory = process.env.TASK69_APPROVED_DIRECTORY,
  priv = process.env.TASK69_PRIVATE_ROOT,
  output = process.env.TASK69_EVIDENCE_OUTPUT;
const d = JSON.parse(readFileSync(join(priv, 'fixture-descriptor.json')));
assert.equal(d.database, 'litigation_task69_v1293');
const actor = JSON.parse(readFileSync(join(priv, 'fixture-logins.json'))).find(
  (x) => x.role === 'Administrator',
).claims;
const contract = loadTask69Contract(directory),
  entries = contract.entries,
  field = (n) => contract.byIssue.get('quarantine.matter_relationship_transform:' + n),
  find = (fn) => entries.find(fn);
const operation = prepareTask69Operation({
  directory,
  operationId: randomUUID(),
  cluster: d.cluster,
  database: d.database,
  runnerSha256: task69RunnerSourceDigest(process.cwd()),
  schemaSha256: task69SchemaSourceDigest(process.cwd()),
});
const executors = [
  executeTask69Parties,
  executeTask69Lawyers,
  executeTask69Admin,
  executeTask69Step,
  executeTask69Poa,
  executeTask69Document,
  executeTask69Fee,
  executeTask69History,
];
const result = [];
async function main() {
  await withTask69Fixture(operation, async (db) => {
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await bindTask69Operation(db, operation, actor);
      const before = (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0].n;
      async function reject(name, source, mutate, group = 'full-semantic') {
        const e = structuredClone(source);
        mutate(e);
        const stage = e.dependencies.find((x) => /^S[1-8]-/.test(x)),
          run = executors[Number(stage[1]) - 1];
        await db.query('SAVEPOINT supplied_probe');
        let error;
        try {
          await run(db, operation, e, actor);
        } catch (e) {
          error = e;
        }
        await db.query('ROLLBACK TO SAVEPOINT supplied_probe');
        assert(error instanceof Error, name);
        assert.match(error.message, /Source, authority, payload or complete guard closure changed/);
        result.push({
          name,
          group,
          issueId: e.issueId,
          path: run.name,
          result: 'REFUSED_BEFORE_BUSINESS_WRITE',
          message: error.message,
        });
      }
      await reject('R1 lawyer7 replaced with existing4', field(1), (e) => {
        e.approvedOutcome.assignments[0].personId = 4;
      });
      await reject(
        'R1 document163 target1718 replaced1719',
        find((e) => e.approvedOutcome.documentId === 163 && e.approvedOutcome.matterIds),
        (e) => {
          e.approvedOutcome.matterIds = [1719];
        },
      );
      await reject(
        'R1 task7922 required_work changed',
        find((e) => e.approvedOutcome.task?.legacy_id === 7922),
        (e) => {
          e.approvedOutcome.task.required_work = 'UNAPPROVED_REPLACEMENT_PROBE';
        },
      );
      await reject(
        'R1 reverse5080 fee105 raw122 wrong namespace',
        find(
          (e) =>
            e.approvedOutcome.direction === 'REVERSE' &&
            e.approvedOutcome.mapping.matter_id === 5080,
        ),
        (e) => {
          e.approvedOutcome.mapping.identifier_space = 'mfiles_id';
        },
      );
      await reject('R1 prior106 exact name replaced', field(106), (e) => {
        e.approvedOutcome.parties[0].name = 'UNAPPROVED_NAME_PROBE';
      });
      const fee = find((e) => e.decisionCode === 'FEE-PRIOR/16');
      await reject('R2 missing nested fee matter guard', fee, (e) => {
        e.expectedStateGuards.targetGuards = e.expectedStateGuards.targetGuards.filter(
          (g) => g.table !== 'public.matters' || g.id !== 2717,
        );
      });
      await reject('R2 changed target row version', fee, (e) => {
        e.expectedStateGuards.targetGuards.find((g) => g.table === 'public.matters').row_version =
          99999;
      });
      const court = find((e) =>
        e.expectedStateGuards.targetGuards.some((g) => g.table === 'public.lookup_court'),
      );
      for (const [name, column, value] of [
        ['wrong scalar court namespace', 'table', 'public.lookup_matter_destination'],
        ['changed exact lookup label', 'exactLabels', { label_ar: 'UNAPPROVED' }],
        ['changed exact lookup cardinality', 'exactLabelCardinality', { label_ar: 2 }],
      ])
        await reject('R2 ' + name, court, (e) => {
          e.expectedStateGuards.targetGuards.find((g) => g.table === 'public.lookup_court')[
            column
          ] = value;
        });
      const norm = find((e) => e.dependencies.includes('DEST-INVESTMENT-26-32'));
      await reject('R3 competing create alongside normalization', norm, (e) => {
        Object.assign(e.approvedOutcome.task.destination_id, {
          action: 'CREATE_EXACT_LABEL_LATER',
          existingId: null,
        });
      });
      await reject('R3 missing shared receipt dependency', norm, (e) => {
        e.dependencies = e.dependencies.filter((x) => x !== 'DEST-INVESTMENT-26-32');
      });
      await reject('R4 plural124 wrongly direct approval', field(124), (e) => {
        e.authority[0].mode = 'DIRECT_OWNER';
      });
      await reject('R4 individual106 wrongly generalized', field(106), (e) => {
        e.authority[0].mode = 'DOCUMENTED_PRIOR_RULE';
      });
      const step = find((e) => e.approvedOutcome.step),
        poa = find((e) => e.approvedOutcome.sourceOccurrences?.length);
      await reject('Step operational date changed', step, (e) => {
        e.approvedOutcome.step.action_date = '2099-01-01';
      });
      await reject('POA occurrence removed', poa, (e) => {
        e.approvedOutcome.sourceOccurrences.pop();
      });
      await reject('Party702 semantic ownership changed', field(702), (e) => {
        e.approvedOutcome.parties[0].role_belongs_to = 'UNAPPROVED';
      });
      for (const [name, col, value] of [
        ['R2 actual target version changed', 'row_version', 99999],
        ['R2 actual target archived', 'is_archived', true],
      ]) {
        let injected = 0,
          error;
        const intercepted = {
          query: async (...args) => {
            const response = await db.query(...args);
            if (typeof args[0] === 'string' && args[0].includes('"public"."matters"'))
              for (const r of response.rows) {
                if (r.value?.id === 2717) {
                  r.value = { ...r.value, [col]: value };
                  injected++;
                }
                if (r.row?.id === 2717) {
                  r.row = { ...r.row, [col]: value };
                  injected++;
                }
              }
            return response;
          },
        };
        await db.query('SAVEPOINT supplied_probe');
        try {
          await executeTask69Fee(intercepted, operation, fee, actor);
        } catch (e) {
          error = e;
        }
        await db.query('ROLLBACK TO SAVEPOINT supplied_probe');
        assert(injected > 0, name + ' reached target read');
        assert(error instanceof Error, name);
        assert.match(error.message, /changed|archived|stale|guard/i);
        result.push({
          name,
          group: 'full-semantic',
          issueId: fee.issueId,
          path: 'executeTask69Fee with intercepted real SQL target response',
          simulation:
            'Only the returned target row is changed in memory; real SQL preflight/locks run; no database state is altered',
          result: 'REFUSED_BEFORE_BUSINESS_WRITE',
          message: error.message,
        });
      }
      const invalid = structuredClone(contract);
      invalid.stages['S8-history-dispositions'].push(invalid.stages['S8-history-dispositions'][0]);
      assert.throws(() => compileTask69Entries(invalid));
      result.push({
        name: 'R5 prose147 instead137',
        group: 'full-semantic',
        path: 'independent source oracle rejects exact supplied prose; runner compileTask69Entries additionally refuses changed stage set',
        result: 'REFUSED_BEFORE_BUSINESS_WRITE',
      });
      await reject(
        'stale source hash',
        field(402),
        (e) => {
          e.originalJsonSha256 = '0'.repeat(64);
        },
        'focused',
      );
      await reject(
        'stale version',
        field(402),
        (e) => {
          e.expectedStateGuards.targetGuards[0].row_version = 99999;
        },
        'focused',
      );
      await reject(
        'wrong namespace',
        field(402),
        (e) => {
          e.approvedOutcome.matterIds = [312];
        },
        'focused',
      );
      await reject(
        'wrong role',
        field(702),
        (e) => {
          e.approvedOutcome.parties[0].roles[0].lookupId = 15;
        },
        'focused',
      );
      await reject(
        'dropped qualifier',
        field(788),
        (e) => {
          e.approvedOutcome.parties[0].roles[0].qualifier = '';
          e.approvedOutcome.parties[0].roles[0].display =
            e.approvedOutcome.parties[0].roles[0].role;
        },
        'focused',
      );
      await reject(
        'old402',
        field(402),
        (e) => {
          e.approvedOutcome.parties = [e.approvedOutcome.parties[0]];
        },
        'focused',
      );
      await reject(
        'old701',
        field(701),
        (e) => {
          e.approvedOutcome.parties.push(structuredClone(e.approvedOutcome.parties[0]));
        },
        'focused',
      );
      await reject(
        'lost ordinal',
        step,
        (e) => {
          e.approvedOutcome.step.source_ordinal = 9999;
        },
        'focused',
      );
      await reject(
        'duplicate membership',
        poa,
        (e) => {
          e.approvedOutcome.members.push(structuredClone(e.approvedOutcome.members[0]));
        },
        'focused',
      );
      for (const n of [73, 78])
        await reject(
          'overbroad fee ' + n,
          find((e) => e.approvedOutcome.remaining97Request === n),
          (e) => {
            e.approvedOutcome.scope = 'ALL_STAGES';
          },
          'focused',
        );
      const duplicate = structuredClone(contract);
      duplicate.stages['S1-party-display'].push(duplicate.stages['S1-party-display'][0]);
      assert.throws(() => compileTask69Entries(duplicate));
      result.push({
        name: 'duplicate approval not another issue',
        group: 'focused',
        path: 'compileTask69Entries',
        result: 'REFUSED_BEFORE_BUSINESS_WRITE',
      });
      assert.equal(result.filter((r) => r.group === 'full-semantic').length, 20);
      assert.equal(result.filter((r) => r.group === 'focused').length, 12);
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0].n,
        before,
      );
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM _migration.task69_receipt WHERE operation_id=$1',
            [operation.operationId],
          )
        ).rows[0].n,
        0,
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });
  const evidence = {
    status: 'PASS',
    started,
    completed: new Date().toISOString(),
    fixture: { database: d.database, cluster: d.cluster },
    probes: result,
    fullSemantic: 20,
    focused: 12,
    ownerActions: 'NOT_APPLIED',
  };
  writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'PASS', fullSemantic: 20, focused: 12, output }));
}
main().catch((e) => {
  writeFileSync(
    output,
    JSON.stringify(
      {
        status: 'FAIL',
        started,
        completed: new Date().toISOString(),
        message: e.message,
        probes: result,
      },
      null,
      2,
    ) + '\n',
  );
  console.error(e.message);
  process.exitCode = 1;
});
