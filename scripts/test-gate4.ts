import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertGate4DatabaseUrl,
  assertGate4Fingerprint,
  assertIndependentImplementations,
  assertReadOnlySnapshot,
  compareGate4Datasets,
  gate4AccountingFailures,
  gate4Date,
  gate4FileEvidenceFailures,
  type Gate4Dataset,
  type Gate4Row,
} from './lib/gate4-contract';

type Test = Readonly<{ name: string; run: () => void | Promise<void> }>;

const fields = ['matter', 'lawyer', 'status', 'amount', 'credit', 'debit', 'date'];
const parameters = { from: '2009-01-01', to: '2026-12-31' };
const ordering = ['matter', 'lawyer'];

function row(identity: string, values: readonly (string | null)[]): Gate4Row {
  return { identity, values };
}

function dataset(
  rows: readonly Gate4Row[],
  options: Partial<Pick<Gate4Dataset, 'parameters' | 'ordering'>> = {},
): Gate4Dataset {
  return {
    name: 'fixture',
    fields,
    parameters: options.parameters ?? parameters,
    rows,
    ordering: options.ordering ?? ordering,
  };
}

function mustDiffer(
  sourceRows: readonly Gate4Row[],
  targetRows: readonly Gate4Row[],
  expected: RegExp,
  targetOptions: Partial<Pick<Gate4Dataset, 'parameters' | 'ordering'>> = {},
): void {
  const result = compareGate4Datasets(dataset(sourceRows), dataset(targetRows, targetOptions));
  assert.match(result.defects.join('\n'), expected);
}

function mustThrow(run: () => unknown, expected: RegExp): void {
  assert.throws(run, expected);
}

const source = [
  row('matter:1:lawyer:10', ['1', '10', 'سارية', '100.00', '80.00', '20.00', '2026-01-01']),
  row('matter:1:lawyer:11', ['1', '11', 'سارية', '100.00', '80.00', '20.00', '2026-01-01']),
];

const tests: readonly Test[] = [
  {
    name: 'same count but wrong join',
    run: () =>
      mustDiffer(
        source,
        [
          source[0]!,
          row('matter:2:lawyer:11', ['2', '11', 'سارية', '100.00', '80.00', '20.00', '2026-01-01']),
        ],
        /missing|additional/u,
      ),
  },
  {
    name: 'fee-letter contract join replaced by the rejected client join',
    run: () =>
      mustDiffer(
        [row('invoice:1', ['contractID:6001', 'client:3'])],
        [row('invoice:1', ['Cont-No:6001', 'client:3'])],
        /changed/u,
      ),
  },
  {
    name: 'missing row',
    run: () => mustDiffer(source, [source[0]!], /missing/u),
  },
  {
    name: 'additional row',
    run: () => mustDiffer([source[0]!], source, /additional/u),
  },
  {
    name: 'duplicated row and duplicate multiplicity',
    run: () => mustDiffer([source[0]!, source[0]!], [source[0]!], /missing/u),
  },
  {
    name: 'lawyer attached to wrong matter',
    run: () =>
      mustDiffer(
        [source[0]!],
        [row('matter:2:lawyer:10', ['2', '10', 'سارية', '100.00', '80.00', '20.00', '2026-01-01'])],
        /missing|additional/u,
      ),
  },
  {
    name: 'wrong lawyer-combination expansion',
    run: () =>
      mustDiffer(
        source,
        [
          source[0]!,
          row('matter:1:lawyer:12', ['1', '12', 'سارية', '100.00', '80.00', '20.00', '2026-01-01']),
        ],
        /missing|additional/u,
      ),
  },
  {
    name: 'changed matter status',
    run: () =>
      mustDiffer(
        [source[0]!],
        [row(source[0]!.identity, ['1', '10', 'منتهية', '100.00', '80.00', '20.00', '2026-01-01'])],
        /changed/u,
      ),
  },
  {
    name: 'NULL collapsed into empty text',
    run: () => mustDiffer([row('1', [null])], [row('1', [''])], /changed/u),
  },
  {
    name: 'quarantined row omitted',
    run: () => {
      assert.match(
        gate4AccountingFailures([
          {
            name: 'matter',
            classification: 'migrated',
            sourceRows: 2,
            representedSourceRows: 1,
            targetRows: 1,
            transformedRows: 1,
            quarantinedRows: 0,
          },
        ]).join('\n'),
        /source !=/u,
      );
    },
  },
  {
    name: 'reference-only table misclassified as producing rows',
    run: () => {
      assert.match(
        gate4AccountingFailures([
          {
            name: 'reference',
            classification: 'reference',
            sourceRows: 1,
            representedSourceRows: 1,
            targetRows: 1,
            transformedRows: 1,
            quarantinedRows: 0,
          },
        ]).join('\n'),
        /produced a business outcome/u,
      );
    },
  },
  {
    name: 'archive-only table misclassified as producing rows',
    run: () => {
      assert.match(
        gate4AccountingFailures([
          {
            name: 'archive',
            classification: 'archive',
            sourceRows: 1,
            representedSourceRows: 1,
            targetRows: 0,
            transformedRows: 0,
            quarantinedRows: 1,
          },
        ]).join('\n'),
        /produced a business outcome/u,
      );
    },
  },
  {
    name: 'invoice currency changed',
    run: () => mustDiffer([row('invoice:1', ['EGP'])], [row('invoice:1', ['USD'])], /changed/u),
  },
  {
    name: 'payment Credit and Debit swapped',
    run: () =>
      mustDiffer(
        [row('payment:1', ['80.00', '20.00'])],
        [row('payment:1', ['20.00', '80.00'])],
        /changed/u,
      ),
  },
  {
    name: 'decimal rounding',
    run: () => mustDiffer([row('money:1', ['1.005'])], [row('money:1', ['1.01'])], /changed/u),
  },
  {
    name: 'hearing shifted into another year',
    run: () => {
      assert.equal(gate4Date('2025-12-31 00:00:00'), '2025-12-31');
      mustDiffer(
        [row('hearing:1', ['2025-12-31'])],
        [row('hearing:1', ['2026-01-01'])],
        /changed/u,
      );
    },
  },
  {
    name: 'administrative business date replaced by created_at',
    run: () =>
      mustDiffer([row('task:1', ['2018-02-22'])], [row('task:1', ['2026-08-25'])], /changed/u),
  },
  {
    name: 'reviewed source merge without an accounting explanation',
    run: () => {
      assert.match(
        gate4AccountingFailures([
          {
            name: 'teams',
            classification: 'migrated',
            sourceRows: 3,
            representedSourceRows: 3,
            targetRows: 2,
            transformedRows: 2,
            quarantinedRows: 0,
          },
        ]).join('\n'),
        /needs an explicit accounting note/u,
      );
    },
  },
  {
    name: 'reviewed exclusion without an accounting explanation',
    run: () => {
      assert.match(
        gate4AccountingFailures([
          {
            name: 'lawyers',
            classification: 'migrated',
            sourceRows: 23,
            representedSourceRows: 22,
            targetRows: 22,
            transformedRows: 22,
            quarantinedRows: 0,
            reviewedExcludedRows: 1,
          },
        ]).join('\n'),
        /reviewed exclusions need an explicit accounting note/u,
      );
    },
  },
  {
    name: 'report parameter mismatch',
    run: () =>
      mustDiffer(source, source, /parameter/u, {
        parameters: { from: '2010-01-01', to: '2026-12-31' },
      }),
  },
  {
    name: 'defined report row order mismatch',
    run: () => mustDiffer(source, [...source].reverse(), /order/u),
  },
  {
    name: 'source extraction fingerprint mismatch',
    run: () =>
      mustThrow(
        () => assertGate4Fingerprint('0'.repeat(64), 'A'.repeat(64)),
        /fingerprint differs/u,
      ),
  },
  {
    name: 'shared source and target implementation',
    run: () =>
      mustThrow(
        () => assertIndependentImplementations('shared-query', 'shared-query'),
        /same implementation/u,
      ),
  },
  {
    name: 'wrong PostgreSQL port',
    run: () =>
      mustThrow(
        () => assertGate4DatabaseUrl('postgresql://user:secret@localhost:5432/litigation'),
        /refuses/u,
      ),
  },
  {
    name: 'writable PostgreSQL transaction',
    run: () =>
      mustThrow(
        () =>
          assertReadOnlySnapshot({
            database: 'litigation',
            readOnly: 'off',
            isolation: 'repeatable read',
            serverPort: 5432,
          }),
        /writable/u,
      ),
  },
  {
    name: 'unchanged rerun keeps the semantic digest',
    run: () => {
      const first = compareGate4Datasets(dataset(source), dataset(source));
      const second = compareGate4Datasets(dataset(source), dataset(source));
      assert.deepEqual(first.defects, []);
      assert.equal(first.sourceDigest, first.targetDigest);
      assert.equal(first.sourceDigest, second.sourceDigest);
    },
  },
];

async function logoFixtures(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'litigation-gate4-fixture-'));
  const path = join(root, 'logo.bin');
  const bytes = Buffer.from('fixture image bytes', 'utf8');
  const expectedHash = createHash('sha256').update(bytes).digest('hex');
  try {
    await writeFile(path, bytes);
    const item = await stat(path);
    const actualBytes = await readFile(path);
    const actual = {
      path: '1/logo.png',
      bytes: item.size,
      sha256: createHash('sha256').update(actualBytes).digest('hex'),
      mime: 'image/png',
    };
    assert.deepEqual(
      gate4FileEvidenceFailures(
        { path: '1/logo.png', bytes: bytes.length, sha256: expectedHash, mime: 'image/png' },
        actual,
      ),
      [],
    );
    assert.match(
      gate4FileEvidenceFailures(
        { path: '1/logo.png', bytes: bytes.length, sha256: expectedHash, mime: 'image/png' },
        null,
      ).join('\n'),
      /missing/u,
    );
    assert.match(
      gate4FileEvidenceFailures(
        { path: '1/logo.png', bytes: bytes.length, sha256: expectedHash, mime: 'image/png' },
        { ...actual, bytes: actual.bytes + 1, mime: 'text/plain' },
      ).join('\n'),
      /byte size|content type/u,
    );
    assert.match(
      gate4FileEvidenceFailures(
        { path: '1/logo.png', bytes: bytes.length, sha256: 'f'.repeat(64), mime: 'image/png' },
        actual,
      ).join('\n'),
      /SHA-256/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  let passed = 0;
  for (const test of tests) {
    await test.run();
    passed += 1;
    console.log(`PASS ${test.name}`);
  }
  await logoFixtures();
  passed += 3;
  console.log('PASS logo missing, corrupt/type-size mismatch and hash mismatch');
  console.log(`\nGate 4 fixtures: ${passed}/${passed} passed; every task-owned fixture removed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
