import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import ts from 'typescript';
import { loadTask69Contract, task69Digest } from './lib/task69-contract';
import { compileTask69Entries, type Task69PreparedOperation } from './lib/task69-runner';
import { classifyTask69Receipts, task69PhaseSets } from './lib/task69-receipt-state';

async function main() {
  const contract = loadTask69Contract(process.env.TASK69_APPROVED_DIRECTORY!);
  const operation = {
    operationId: randomUUID(),
    allowlist: compileTask69Entries(contract),
  } as Task69PreparedOperation;
  const sets = task69PhaseSets(operation);
  assert.equal(sets.parents.length, 1598);
  assert.equal(sets.remaining.length, 1987);
  assert.equal(sets.all.length, 3585);
  const make = (ids: string[], phase = 'apply') =>
    ids.map((issue_id) => ({
      operation_id: operation.operationId,
      issue_id,
      phase,
      receipt_id: randomUUID(),
    }));
  const parent = make(sets.parents),
    full = make(sets.all);
  const cases = [
    { name: 'zero committed', rows: [], state: 'ZERO_COMMITTED', dispatch: false },
    { name: 'complete parents', rows: parent, state: 'APPLIED', dispatch: true },
    { name: 'complete full operation', rows: full, state: 'APPLIED', dispatch: true },
    {
      name: 'parents compensated retry',
      rows: [...parent, ...make(sets.parents, 'compensate')],
      state: 'COMPENSATED',
      dispatch: true,
    },
    {
      name: 'full compensated retry',
      rows: [...full, ...make(sets.all, 'compensate')],
      state: 'COMPENSATED',
      dispatch: true,
    },
    { name: 'missing parent', rows: parent.slice(1) },
    {
      name: 'same count mixed phase',
      rows: [...parent.slice(1), make(sets.remaining.slice(0, 1))[0]!],
    },
    {
      name: 'parents plus partial remaining',
      rows: [...parent, make(sets.remaining.slice(0, 1))[0]!],
    },
    { name: 'remaining only', rows: make(sets.remaining) },
    { name: 'full minus one', rows: full.slice(1) },
    {
      name: 'duplicate issue new UUID',
      rows: [...parent, { ...parent[0]!, receipt_id: randomUUID() }],
    },
    {
      name: 'duplicate receipt UUID',
      rows: parent.map((x, i) => (i === 1 ? { ...x, receipt_id: parent[0]!.receipt_id } : x)),
    },
    {
      name: 'foreign same count issue',
      rows: parent.map((x, i) => (i === 0 ? { ...x, issue_id: 'FOREIGN' } : x)),
    },
    {
      name: 'foreign operation',
      rows: parent.map((x, i) => (i === 0 ? { ...x, operation_id: randomUUID() } : x)),
    },
    {
      name: 'unknown phase',
      rows: parent.map((x, i) => (i === 0 ? { ...x, phase: 'unknown' } : x)),
    },
    {
      name: 'malformed receipt ID',
      rows: parent.map((x, i) => (i === 0 ? { ...x, receipt_id: 'not-a-uuid' } : x)),
    },
    { name: 'compensation without apply', rows: make(sets.parents, 'compensate') },
    {
      name: 'partial parent inverse',
      rows: [...parent, ...make(sets.parents.slice(1), 'compensate')],
    },
    {
      name: 'full apply with parent-only inverse',
      rows: [...full, ...make(sets.parents, 'compensate')],
    },
    { name: 'parent apply with full inverse', rows: [...parent, ...make(sets.all, 'compensate')] },
  ];
  let reached = 0;
  const require = createRequire(import.meta.url);
  const source = readFileSync('scripts/lib/task69-operation-execution.ts', 'utf8');
  const stubs: Record<string, unknown> = {
    './task69-receipt-state': { classifyTask69Receipts, task69PhaseSets },
    './task69-contract': { task69Digest },
    './task69-runner': { bindTask69Operation: async () => {} },
    './task69-compensation-executor': {
      compensateTask69Operation: async () => {
        reached++;
        throw Error('EXACT_SET_DISPATCH_REACHED');
      },
    },
  };
  const code = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loadedModule = {
    exports: {} as { executeTask69BoundPhase: (x: unknown) => Promise<void> },
  };
  new Script('(function(require,module,exports){' + code + '\n})').runInThisContext()(
    (name: string) => (name.startsWith('node:') ? require(name) : (stubs[name] ?? {})),
    loadedModule,
    loadedModule.exports,
  );
  const results = [];
  for (const test of cases) {
    if (test.state) assert.equal(classifyTask69Receipts(operation, test.rows).state, test.state);
    else assert.throws(() => classifyTask69Receipts(operation, test.rows));
    const priorReached = reached,
      queries: string[] = [],
      outcome: Record<string, unknown> = {};
    const db = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.startsWith('SELECT to_jsonb(t)') || sql.includes('FROM pg_sequences'))
          return { rows: [] };
        if (sql.includes('FROM public.audit_events'))
          return { rows: [{ count: 0, last_id: null, digest: 'CONTROL_ONLY' }] };
        if (sql.startsWith('SELECT * FROM _migration.task69_receipt')) return { rows: test.rows };
        if (sql.startsWith('BEGIN') || sql === 'ROLLBACK') return { rows: [] };
        throw Error('Unexpected control SQL: ' + sql);
      },
    };
    let error = '';
    try {
      await loadedModule.exports.executeTask69BoundPhase({
        db,
        operation,
        contract,
        authority: {},
        action: 'compensate',
        fault: '',
        baselineFile: 'NOT_READ',
        beforeBind: async () => {},
        beforeCommit: async () => {},
        outcome,
        persist: () => {},
      });
    } catch (e) {
      error = (e as Error).message;
    }
    assert.equal(reached > priorReached, test.dispatch === true, test.name);
    assert(!queries.includes('COMMIT'));
    assert(queries.includes('ROLLBACK'));
    if (test.dispatch) assert.equal(error, 'EXACT_SET_DISPATCH_REACHED');
    results.push({
      name: test.name,
      classifier: test.state ?? 'REFUSED',
      compensatorReached: reached > priorReached,
      status: outcome.status,
    });
  }
  const out = {
    status: 'PASS',
    checks: results.length,
    phaseSizes: {
      parents: sets.parents.length,
      remaining: sets.remaining.length,
      all: sets.all.length,
    },
    results,
    scope:
      'Real compiled classifier and coordinator; captured contract identities, stubbed database and inverse boundary. Control-flow proof only; no PostgreSQL execution.',
  };
  if (process.env.TASK69_EVIDENCE_OUTPUT)
    writeFileSync(process.env.TASK69_EVIDENCE_OUTPUT, JSON.stringify(out, null, 2) + '\n', {
      flag: 'wx',
    });
  console.log(JSON.stringify(out));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
