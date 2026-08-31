import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertGate4DatabaseUrl,
  assertGate4Fingerprint,
  assertReadOnlySnapshot,
  compareGate4Datasets,
  gate4AccountingFailures,
  gate4Date,
  gate4FileEvidenceFailures,
  type Gate4Dataset,
  type Gate4Row,
} from './lib/gate4-contract';
import {
  GATE4_ACCESS_DEFINITION_BASELINE,
  gate4AccessDefinitionFailures,
} from './lib/gate4-access';
import { gate4ArchitectureFailures } from './lib/gate4-architecture';
import { isGate4CreatedAtSubstitution, parseGate4AccessDate } from './lib/gate4-admin-date';
import {
  GATE4_BILLING_CURRENCY_RULE_DIGEST,
  GATE4_PREREQUISITE_NAMES,
  gate4BillingCurrencyRuleDigest,
  gate4PrerequisiteFailures,
  type Gate4PrerequisiteResult,
} from './lib/gate4-database';
import {
  gate4LogicalEvidenceFailures,
  gate4LogicalFixtureEvidence,
  GATE4_LOGICAL_BASELINE,
} from './lib/gate4-logical-equivalence';
import {
  MATTER_RECONCILIATION_DEFECT_FIELDS,
  matterReconciliationFailures,
  type MatterReconciliationRow,
} from './lib/matter-reconciliation';
import { withGate4TaskTempDir } from './lib/gate4-temp';
import {
  GATE4_APPROVED_CLEAN_ROLLBACKS,
  GATE4_CANONICAL_STAGE2_MIGRATIONS,
  GATE4_HISTORICAL_STAGE2_MIGRATIONS,
  GATE4_STAGE2_DATABASE_PROFILES,
  GATE4_WHITESPACE_CANONICAL_CHECKSUM,
  GATE4_WHITESPACE_HISTORICAL_CHECKSUM,
  GATE4_WHITESPACE_MIGRATION,
  gate4MigrationIdentityDigest,
  readGate4RepositoryMigrationInventory,
  reconcileGate4Migrations,
  type Gate4MigrationHistoryRow,
  type Gate4RepositoryMigration,
  type Gate4RepositoryMigrationInventory,
} from './lib/gate4-migrations';

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

function prerequisiteResults(): Gate4PrerequisiteResult[] {
  return GATE4_PREREQUISITE_NAMES.map((name) => ({
    name,
    implementation: 'independent permanent oracle',
    defects: [],
  }));
}

function matterOracleDefects(changed: Partial<MatterReconciliationRow>): string[] {
  const row = Object.fromEntries(
    MATTER_RECONCILIATION_DEFECT_FIELDS.map((field) => [field, 0]),
  ) as MatterReconciliationRow;
  row.source_rows = 2;
  row.target_rows = 1;
  row.quarantine_rows = 1;
  Object.assign(row, changed);
  return matterReconciliationFailures(row);
}

function mustChangeLogical(
  before: readonly Readonly<{ name: string; rows: readonly (readonly (string | null)[])[] }>[],
  after: readonly Readonly<{ name: string; rows: readonly (readonly (string | null)[])[] }>[],
): void {
  assert.notEqual(gate4LogicalFixtureEvidence(before), gate4LogicalFixtureEvidence(after));
}

function appliedMigration(name: string, checksum: string): Gate4MigrationHistoryRow {
  return {
    migrationName: name,
    checksum,
    finishedAt: '2026-08-30 10:00:01+00',
    rolledBackAt: null,
    appliedStepsCount: 1,
  };
}

function migrationFixtureHistory(
  profile: 'historical-live' | 'canonical-clean-replay' = 'historical-live',
): Gate4MigrationHistoryRow[] {
  const required =
    profile === 'historical-live'
      ? GATE4_HISTORICAL_STAGE2_MIGRATIONS
      : GATE4_CANONICAL_STAGE2_MIGRATIONS;
  return [
    ...required.map((row) => appliedMigration(row.name, row.checksum)),
    ...(profile === 'historical-live'
      ? GATE4_APPROVED_CLEAN_ROLLBACKS.map((row) => ({
          migrationName: row.name,
          checksum: row.checksum,
          finishedAt: null,
          rolledBackAt: '2026-08-21 08:20:59+00',
          appliedStepsCount: 0,
        }))
      : []),
  ];
}

function laterMigration(sequence: number): Gate4MigrationHistoryRow {
  return appliedMigration(
    `20260831${String(sequence).padStart(6, '0')}_stage3_fixture_${sequence}`,
    createHash('sha256').update(`later migration ${sequence}`, 'utf8').digest('hex'),
  );
}

function repositoryFixture(
  later: readonly Gate4RepositoryMigration[] = [],
  defects: readonly string[] = [],
): Gate4RepositoryMigrationInventory {
  const migrations = [
    ...GATE4_CANONICAL_STAGE2_MIGRATIONS.map((migration) => ({
      ...migration,
      byteLength: 1,
    })),
    ...later,
  ].sort((left, right) => left.name.localeCompare(right.name, 'en'));
  return {
    migrations,
    digest: gate4MigrationIdentityDigest(migrations),
    defects,
  };
}

function laterRepositoryMigration(sequence: number): Gate4RepositoryMigration {
  const migration = laterMigration(sequence);
  return {
    name: migration.migrationName,
    checksum: migration.checksum,
    byteLength: 24,
  };
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
    name: 'historical live migration profile passes as one indivisible profile',
    run: () => {
      const evidence = reconcileGate4Migrations(
        migrationFixtureHistory('historical-live'),
        repositoryFixture(),
      );
      assert.deepEqual(evidence.defects, []);
      assert.equal(evidence.acceptedDatabaseProfile, 'historical-live');
      assert.equal(evidence.requiredStage2Proved, 51);
      assert.equal(evidence.totalApplied, 51);
      assert.equal(evidence.cleanRollbacks, 1);
      assert.equal(evidence.unfinishedOrFailed, 0);
    },
  },
  {
    name: 'canonical clean-replay migration profile passes as one indivisible profile',
    run: () => {
      const evidence = reconcileGate4Migrations(
        migrationFixtureHistory('canonical-clean-replay'),
        repositoryFixture(),
      );
      assert.deepEqual(evidence.defects, []);
      assert.equal(evidence.acceptedDatabaseProfile, 'canonical-clean-replay');
      assert.equal(evidence.cleanRollbacks, 0);
    },
  },
  {
    name: 'actual canonical migration 0033 and its historical extra-LF bytes are exact',
    run: async () => {
      const inventory = await readGate4RepositoryMigrationInventory();
      assert.deepEqual(inventory.defects, []);
      const canonical = inventory.migrations.find(
        (migration) => migration.name === GATE4_WHITESPACE_MIGRATION,
      );
      assert.equal(canonical?.checksum, GATE4_WHITESPACE_CANONICAL_CHECKSUM);
      assert.equal(canonical?.byteLength, 2381);
      const bytes = await readFile(
        join('prisma', 'migrations', GATE4_WHITESPACE_MIGRATION, 'migration.sql'),
      );
      assert.equal(bytes.at(-1), 0x0a);
      assert.equal(
        createHash('sha256')
          .update(Buffer.concat([bytes, Buffer.from([0x0a])]))
          .digest('hex'),
        GATE4_WHITESPACE_HISTORICAL_CHECKSUM,
      );
      const historical = GATE4_HISTORICAL_STAGE2_MIGRATIONS.find(
        (migration) => migration.name === GATE4_WHITESPACE_MIGRATION,
      );
      assert.equal(historical?.checksum, GATE4_WHITESPACE_HISTORICAL_CHECKSUM);
    },
  },
  {
    name: 'historical extra-LF bytes can never replace canonical repository migration 0033',
    run: () => {
      const repository = repositoryFixture();
      const migrations = repository.migrations.map((migration) =>
        migration.name === GATE4_WHITESPACE_MIGRATION
          ? { ...migration, checksum: GATE4_WHITESPACE_HISTORICAL_CHECKSUM }
          : migration,
      );
      const changed = {
        migrations,
        digest: gate4MigrationIdentityDigest(migrations),
        defects: [],
      };
      assert.match(
        reconcileGate4Migrations(migrationFixtureHistory(), changed).defects.join('\n'),
        /canonical repository checksum differs/u,
      );
    },
  },
  {
    name: 'any other canonical repository byte change fails',
    run: () => {
      const repository = repositoryFixture();
      const migrations = repository.migrations.map((migration, index) =>
        index === 0 ? { ...migration, checksum: 'a'.repeat(64) } : migration,
      );
      assert.match(
        reconcileGate4Migrations(migrationFixtureHistory(), {
          migrations,
          digest: gate4MigrationIdentityDigest(migrations),
          defects: [],
        }).defects.join('\n'),
        /canonical repository checksum differs/u,
      );
    },
  },
  {
    name: 'required checksum substitution and an invented profile fail',
    run: () => {
      const history = migrationFixtureHistory();
      history[3] = { ...history[3]!, checksum: 'f'.repeat(64) };
      const evidence = reconcileGate4Migrations(history, repositoryFixture());
      assert.equal(evidence.acceptedDatabaseProfile, null);
      assert.match(evidence.defects.join('\n'), /matches 0 complete approved profiles/u);
    },
  },
  {
    name: 'missing and duplicated required migrations fail',
    run: () => {
      const required = GATE4_CANONICAL_STAGE2_MIGRATIONS[0]!;
      const missing = migrationFixtureHistory().filter(
        (migration) => migration.migrationName !== required.name,
      );
      assert.match(
        reconcileGate4Migrations(missing, repositoryFixture()).defects.join('\n'),
        /expected exactly one history row/u,
      );
      const duplicate = migrationFixtureHistory();
      duplicate.push(appliedMigration(required.name, required.checksum));
      assert.match(
        reconcileGate4Migrations(duplicate, repositoryFixture()).defects.join('\n'),
        /duplicate migration history/u,
      );
    },
  },
  {
    name: 'missing and duplicated required repository migrations fail',
    run: () => {
      const repository = repositoryFixture();
      const required = GATE4_CANONICAL_STAGE2_MIGRATIONS[0]!;
      const missing = repository.migrations.filter((migration) => migration.name !== required.name);
      assert.match(
        reconcileGate4Migrations(migrationFixtureHistory(), {
          migrations: missing,
          digest: gate4MigrationIdentityDigest(missing),
          defects: [],
        }).defects.join('\n'),
        /expected one canonical repository file, found 0/u,
      );
      const duplicate = [
        ...repository.migrations,
        { ...repository.migrations.find((migration) => migration.name === required.name)! },
      ];
      assert.match(
        reconcileGate4Migrations(migrationFixtureHistory(), {
          migrations: duplicate,
          digest: gate4MigrationIdentityDigest(duplicate),
          defects: [],
        }).defects.join('\n'),
        /expected one canonical repository file, found 2/u,
      );
    },
  },
  {
    name: 'required rolled-back, failed or unfinished migration fails',
    run: () => {
      for (const changed of [
        { finishedAt: null, rolledBackAt: '2026-08-31 00:00:00+00', appliedStepsCount: 0 },
        { finishedAt: null, rolledBackAt: null, appliedStepsCount: 0 },
        { finishedAt: '2026-08-31 00:00:00+00', rolledBackAt: null, appliedStepsCount: 0 },
      ]) {
        const history = migrationFixtureHistory();
        history[2] = { ...history[2]!, ...changed };
        assert.notEqual(reconcileGate4Migrations(history, repositoryFixture()).defects.length, 0);
      }
    },
  },
  {
    name: 'later applied migration passes only with the matching repository bytes',
    run: () => {
      const later = laterMigration(1);
      const repositoryLater = laterRepositoryMigration(1);
      const evidence = reconcileGate4Migrations(
        [...migrationFixtureHistory(), later],
        repositoryFixture([repositoryLater]),
      );
      assert.deepEqual(evidence.defects, []);
      assert.deepEqual(evidence.laterAppliedMigrations, [
        { name: later.migrationName, checksum: later.checksum },
      ]);
    },
  },
  {
    name: 'later database-only and repository-only migrations fail',
    run: () => {
      const later = laterMigration(1);
      assert.match(
        reconcileGate4Migrations(
          [...migrationFixtureHistory(), later],
          repositoryFixture(),
        ).defects.join('\n'),
        /has 0 repository files/u,
      );
      assert.match(
        reconcileGate4Migrations(
          migrationFixtureHistory(),
          repositoryFixture([laterRepositoryMigration(1)]),
        ).defects.join('\n'),
        /pending or not successfully applied/u,
      );
    },
  },
  {
    name: 'later database/repository checksum mismatch fails',
    run: () => {
      const later = laterMigration(1);
      const repositoryLater = { ...laterRepositoryMigration(1), checksum: 'b'.repeat(64) };
      assert.match(
        reconcileGate4Migrations(
          [...migrationFixtureHistory(), later],
          repositoryFixture([repositoryLater]),
        ).defects.join('\n'),
        /database\/repository checksum differs/u,
      );
    },
  },
  {
    name: 'later failed, rolled-back and unfinished migrations all fail',
    run: () => {
      for (const changed of [
        { finishedAt: null, rolledBackAt: null, appliedStepsCount: 0 },
        { finishedAt: null, rolledBackAt: '2026-08-31 00:00:00+00', appliedStepsCount: 0 },
        { finishedAt: '2026-08-31 00:00:00+00', rolledBackAt: null, appliedStepsCount: 0 },
      ]) {
        const later = { ...laterMigration(1), ...changed };
        assert.match(
          reconcileGate4Migrations(
            [...migrationFixtureHistory(), later],
            repositoryFixture([laterRepositoryMigration(1)]),
          ).defects.join('\n'),
          /later migration is/u,
        );
      }
    },
  },
  {
    name: 'unsafe migration directory and unexpected directory content fail inventory',
    run: async () => {
      const root = await mkdtemp(join(tmpdir(), 'litigation-gate4-migrations-'));
      try {
        const unsafe = join(root, '20260831120000_BAD');
        await mkdir(unsafe);
        await writeFile(join(unsafe, 'migration.sql'), 'SELECT 1;\n', 'utf8');
        const unexpected = join(root, '20260831130000_unexpected_content');
        await mkdir(unexpected);
        await writeFile(join(unexpected, 'migration.sql'), 'SELECT 1;\n', 'utf8');
        await writeFile(join(unexpected, 'notes.txt'), 'not allowed\n', 'utf8');
        const inventory = await readGate4RepositoryMigrationInventory(root);
        assert.match(inventory.defects.join('\n'), /unsafe or malformed/u);
        assert.match(inventory.defects.join('\n'), /exactly one migration.sql/u);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'historical rollback is profile evidence and canonical replay has none',
    run: () => {
      const historical = reconcileGate4Migrations(migrationFixtureHistory(), repositoryFixture());
      assert.deepEqual(
        historical.cleanRollbackNames,
        GATE4_APPROVED_CLEAN_ROLLBACKS.map((migration) => migration.name),
      );
      const withoutRollback = migrationFixtureHistory().filter(
        (migration) => migration.migrationName !== GATE4_APPROVED_CLEAN_ROLLBACKS[0]!.name,
      );
      assert.match(
        reconcileGate4Migrations(withoutRollback, repositoryFixture()).defects.join('\n'),
        /expected one profile clean rollback/u,
      );
      const canonical = reconcileGate4Migrations(
        migrationFixtureHistory('canonical-clean-replay'),
        repositoryFixture(),
      );
      assert.deepEqual(canonical.cleanRollbackNames, []);

      const mixed = reconcileGate4Migrations(
        [
          ...migrationFixtureHistory('canonical-clean-replay'),
          ...GATE4_APPROVED_CLEAN_ROLLBACKS.map((migration) => ({
            migrationName: migration.name,
            checksum: migration.checksum,
            finishedAt: null,
            rolledBackAt: '2026-08-21 08:20:59+00',
            appliedStepsCount: 0,
          })),
        ],
        repositoryFixture(),
      );
      assert.match(
        mixed.defects.join('\n'),
        /unexpected migration at or before the Stage 2 boundary/u,
      );
    },
  },
  {
    name: 'migration evidence and both profile digests remain deterministic',
    run: () => {
      const repository = repositoryFixture([
        laterRepositoryMigration(1),
        laterRepositoryMigration(2),
      ]);
      const history = [...migrationFixtureHistory(), laterMigration(1), laterMigration(2)];
      const first = reconcileGate4Migrations(history, repository);
      const second = reconcileGate4Migrations([...history].reverse(), {
        ...repository,
        migrations: [...repository.migrations].reverse(),
      });
      assert.deepEqual(first, second);
      assert.equal(GATE4_STAGE2_DATABASE_PROFILES.length, 2);
      assert.notEqual(
        GATE4_STAGE2_DATABASE_PROFILES[0]!.digest,
        GATE4_STAGE2_DATABASE_PROFILES[1]!.digest,
      );
    },
  },
  {
    name: 'source reader cannot import target planner or database implementation',
    run: () => {
      const failures = gate4ArchitectureFailures({
        database:
          "import './matter-reconciliation'; import './matter-relationship-reconciliation'; import './hearing-reconciliation'; import './admin-reconciliation'; import './billing-reconciliation'; import('./matter-transform-plan'); async function loadReports() {}",
        sourceReports:
          "import './gate4-extraction'; import './gate4-database'; export function buildGate4SourceReports() {}",
        runner: "import './lib/gate4-database'; import './lib/gate4-source-reports';",
      });
      assert.match(
        failures.join('\n'),
        /Access-side builder|transform writer\/planner|target writer, planner or oracle/u,
      );
      const commentSpoof = gate4ArchitectureFailures({
        database:
          "import './matter-reconciliation'; import './matter-relationship-reconciliation'; import './hearing-reconciliation'; import './admin-reconciliation'; /* import './billing-reconciliation'; async function loadReports() {} */",
        sourceReports:
          "import './gate4-extraction'; /* export function buildGate4SourceReports() {} */",
        runner: "import './lib/gate4-database'; import './lib/gate4-source-reports';",
      });
      assert.match(commentSpoof.join('\n'), /billing-reconciliation|not implemented/u);
    },
  },
  {
    name: 'missing permanent prerequisite oracle cannot be bypassed',
    run: () => {
      const results = prerequisiteResults().filter((item) => item.name !== 'billing');
      assert.match(gate4PrerequisiteFailures(results).join('\n'), /billing/u);
    },
  },
  {
    name: 'weakened prerequisite cannot claim independence',
    run: () => {
      const results = prerequisiteResults();
      results[0] = { ...results[0]!, implementation: 'shared implementation' as never };
      assert.match(gate4PrerequisiteFailures(results).join('\n'), /not independent/u);
    },
  },
  {
    name: 'same-count transformed/quarantine swap fails the permanent matter oracle',
    run: () => {
      const defects = matterOracleDefects({
        safe_row_in_quarantine: 1,
        unsafe_row_missing_quarantine: 1,
      });
      assert.deepEqual(defects, ['safe_row_in_quarantine', 'unsafe_row_missing_quarantine']);
    },
  },
  {
    name: 'wrong quarantine identity with unchanged count fails the permanent matter oracle',
    run: () =>
      assert.deepEqual(matterOracleDefects({ quarantine_source_key_mismatch: 1 }), [
        'quarantine_source_key_mismatch',
      ]),
  },
  {
    name: 'changed quarantine reason and detail fail the permanent matter oracle',
    run: () =>
      assert.deepEqual(
        matterOracleDefects({
          quarantine_reason_codes_mismatch: 1,
          quarantine_reason_details_mismatch: 1,
        }),
        ['quarantine_reason_codes_mismatch', 'quarantine_reason_details_mismatch'],
      ),
  },
  {
    name: 'same-count reviewed billing-rule change blocks Gate 4',
    run: () => {
      const results = prerequisiteResults();
      const index = results.findIndex((item) => item.name === 'billing');
      results[index] = { ...results[index]!, defects: ['reviewed billing currency rules changed'] };
      assert.match(gate4PrerequisiteFailures(results).join('\n'), /currency rules changed/u);
      const approved = [
        {
          field_kind: 'receipt_currency',
          source_value: '0',
          target_value: null,
          require_zero_amount: true,
          reviewed_by: 'Khaled Helmy',
          reviewed_at: '2026-08-25',
          reviewer_note:
            'Raw receipt currency 0 becomes NULL only when the receipt amount is zero; non-zero must fail safely.',
        },
        {
          field_kind: 'transaction_currency',
          source_value: ' USD',
          target_value: 'USD',
          require_zero_amount: false,
          reviewed_by: 'Khaled Helmy',
          reviewed_at: '2026-08-25',
          reviewer_note:
            'Exact leading-space normalization for invoice 21352 and its two payments; never trim or case-fold another value.',
        },
      ];
      assert.equal(gate4BillingCurrencyRuleDigest(approved), GATE4_BILLING_CURRENCY_RULE_DIGEST);
      approved[1]!.target_value = 'EGP';
      assert.notEqual(gate4BillingCurrencyRuleDigest(approved), GATE4_BILLING_CURRENCY_RULE_DIGEST);
    },
  },
  {
    name: 'created_at substitution requires equality and a different safely parsed source date',
    run: () => {
      assert.equal(
        isGate4CreatedAtSubstitution({
          taskCreatedDate: '2026-08-25',
          sourceCreatedDate: '2018-02-22 00:00:00',
          createdAtDate: '2026-08-25',
        }),
        true,
      );
      assert.equal(
        isGate4CreatedAtSubstitution({
          taskCreatedDate: '2026-08-25',
          sourceCreatedDate: '2026-08-25 00:00:00',
          createdAtDate: '2026-08-25',
        }),
        false,
      );
      assert.equal(parseGate4AccessDate('2026-99-99 00:00:00'), null);
      assert.equal(
        isGate4CreatedAtSubstitution({
          taskCreatedDate: '2018-02-22',
          sourceCreatedDate: 'invalid',
          createdAtDate: '2026-08-25',
        }),
        false,
      );
    },
  },
  {
    name: 'unrelated wrong administrative date still fails the row comparison',
    run: () =>
      mustDiffer([row('task:1', ['2018-02-22'])], [row('task:1', ['2018-02-23'])], /changed/u),
  },
  {
    name: 'logical multiset detects same-count value swaps and exact text changes',
    run: () => {
      const before = [
        {
          name: 'table',
          rows: [
            ['أحمد', null],
            ['x', ''],
          ],
        },
      ];
      mustChangeLogical(before, [
        {
          name: 'table',
          rows: [
            ['x', null],
            ['أحمد', ''],
          ],
        },
      ]);
      mustChangeLogical(before, [
        {
          name: 'table',
          rows: [
            ['احمد', null],
            ['x', ''],
          ],
        },
      ]);
      mustChangeLogical(before, [
        {
          name: 'table',
          rows: [
            [' أحمد', null],
            ['x', ''],
          ],
        },
      ]);
      mustChangeLogical(before, [
        {
          name: 'table',
          rows: [
            ['أحمد', ''],
            ['x', ''],
          ],
        },
      ]);
    },
  },
  {
    name: 'logical multiset detects duplicate multiplicity and complex add/remove/change',
    run: () => {
      const before = [
        {
          name: 'complex',
          rows: [
            ['1', 'A'],
            ['1', 'A'],
          ],
        },
      ];
      mustChangeLogical(before, [{ name: 'complex', rows: [['1', 'A']] }]);
      mustChangeLogical(before, [
        {
          name: 'complex',
          rows: [
            ['1', 'A'],
            ['1', 'B'],
          ],
        },
      ]);
      mustChangeLogical(before, [
        {
          name: 'complex',
          rows: [
            ['1', 'A'],
            ['1', 'A'],
            ['2', 'B'],
          ],
        },
      ]);
    },
  },
  {
    name: 'relationship attribute change fails the logical baseline',
    run: () => {
      const actual = {
        ...GATE4_LOGICAL_BASELINE,
        relationships: { ...GATE4_LOGICAL_BASELINE.relationships, digest: '0'.repeat(64) },
      };
      assert.match(
        gate4LogicalEvidenceFailures(GATE4_LOGICAL_BASELINE, actual).join('\n'),
        /relationship definitions/u,
      );
    },
  },
  {
    name: 'selected query and report metadata drift fail exact definition evidence',
    run: () => {
      const query = {
        ...GATE4_ACCESS_DEFINITION_BASELINE,
        selectedQueries: GATE4_ACCESS_DEFINITION_BASELINE.selectedQueries.map((item, index) =>
          index === 0 ? { ...item, sqlDigest: '0'.repeat(64) } : item,
        ),
      };
      assert.match(
        gate4AccessDefinitionFailures(GATE4_ACCESS_DEFINITION_BASELINE, query).join('\n'),
        /selectedQueries/u,
      );
      const report = {
        ...GATE4_ACCESS_DEFINITION_BASELINE,
        selectedReports: GATE4_ACCESS_DEFINITION_BASELINE.selectedReports.map((item, index) =>
          index === 0 ? { ...item, modified: '2026-08-30T00:00:00.0000000Z' } : item,
        ),
      };
      assert.match(
        gate4AccessDefinitionFailures(GATE4_ACCESS_DEFINITION_BASELINE, report).join('\n'),
        /selectedReports/u,
      );
      const contract = {
        ...GATE4_ACCESS_DEFINITION_BASELINE,
        reportContractDigest: '0'.repeat(64),
      };
      assert.match(
        gate4AccessDefinitionFailures(GATE4_ACCESS_DEFINITION_BASELINE, contract).join('\n'),
        /reportContractDigest/u,
      );
    },
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
    const changedBytes = Buffer.from('different fixture image bytes', 'utf8');
    assert.match(
      gate4FileEvidenceFailures(
        { path: '1/logo.png', bytes: bytes.length, sha256: expectedHash, mime: 'image/png' },
        {
          ...actual,
          bytes: changedBytes.length,
          sha256: createHash('sha256').update(changedBytes).digest('hex'),
        },
      ).join('\n'),
      /byte size|SHA-256/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function tempCleanupFixtures(): Promise<void> {
  let successRoot = '';
  await withGate4TaskTempDir('fixture-success', async (root) => {
    successRoot = root;
    await writeFile(join(root, 'leftover.txt'), 'fixture', 'utf8');
  });
  await assert.rejects(access(successRoot), /ENOENT/u);

  let failureRoot = '';
  await assert.rejects(
    withGate4TaskTempDir('fixture-failure', async (root) => {
      failureRoot = root;
      await writeFile(join(root, 'leftover.txt'), 'fixture', 'utf8');
      throw new Error('deliberate fixture failure');
    }),
    /deliberate fixture failure/u,
  );
  await assert.rejects(access(failureRoot), /ENOENT/u);
}

async function main(): Promise<void> {
  let passed = 0;
  for (const test of tests) {
    await test.run();
    passed += 1;
    console.log(`PASS ${test.name}`);
  }
  await logoFixtures();
  passed += 4;
  console.log(
    'PASS logo missing, corrupt/type-size mismatch, hash mismatch and same-name byte drift',
  );
  await tempCleanupFixtures();
  passed += 2;
  console.log('PASS task-owned temporary output is removed after success and failure');
  console.log(`\nGate 4 fixtures: ${passed}/${passed} passed; every task-owned fixture removed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
