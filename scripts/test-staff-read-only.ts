import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { createDatabaseClient } from '../src/lib/db';
import { setHumanAuditContext } from '../src/lib/audit';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import type { Session } from 'next-auth';
import { AUTH_ROLES } from '../src/lib/auth/constants';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import {
  parseStaffFilters,
  readStaffDetail,
  readStaffRoster,
  staffCountQuery,
  staffRowsQuery,
  staffListHref,
  staffPersonId,
  StaffFilterError,
} from '../src/lib/staff-roster-query';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { withCurrentClientFixture } from './lib/current-client-fixture';
import { assertStaffCheckpoint } from './lib/staff-roster-checkpoint';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { auditStructureFailures, auditDataFailures } from './lib/audit-structure';
import { auditEventStructureFailures, auditEventDataFailures } from './lib/audit-event-structure';

function viewer(role: string): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: '1',
      personId: 1,
      name: 'TEST ONLY',
      username: 'test',
      role,
      mustChangePassword: false,
      sessionVersion: 1,
      auditSessionId: '00000000-0000-4000-8000-000000000000',
    },
  } as Session;
}

function one<T>(rows: T[]): T {
  assert.equal(rows.length, 1);
  return rows[0]!;
}

export async function proveStaffReads(
  database: PrismaClient,
  migrationUrl?: string,
  synthetic = false,
) {
  for (const input of [
    { status: 'unknown' },
    { q: ['a', 'b'] },
    { team: '-1' },
    { team: '99999' },
    { trainee: 'true' },
    { page: '0' },
    { page: '1e2' },
    { q: 'x'.repeat(161) },
    { q: 'a\0b' },
  ]) {
    assert.throws(() => parseStaffFilters(input), StaffFilterError);
  }
  for (const id of ['0', '-1', '1.0', '1e2', 'new', '2147483648', '01'])
    assert.equal(staffPersonId(id), null);
  assert.equal(staffPersonId('137'), 137);
  assert.equal(parseStaffFilters({}).status, 'active');
  const filters = parseStaffFilters({
    q: 'أحمد',
    status: 'former',
    team: 'unassigned',
    trainee: 'no',
    page: '2',
  });
  const linked = new URL(staffListHref(filters, 3), 'http://localhost');
  assert.deepEqual(parseStaffFilters(Object.fromEntries(linked.searchParams)), {
    ...filters,
    page: 3,
  });
  console.log('PASS bounded filters, literal URLs, stable integer identities and defaults');

  let queries = 0;
  const neverQuery = {
    $transaction: () => {
      queries++;
      throw new Error('protected query reached');
    },
  } as unknown as PrismaClient;
  for (const session of [
    null,
    viewer('Unknown'),
    { ...viewer('Lawyer'), user: { ...viewer('Lawyer').user, mustChangePassword: true } },
  ]) {
    await assert.rejects(readStaffRoster(session, {}, neverQuery), AuthorizationError);
    await assert.rejects(readStaffDetail(session, '1', neverQuery), AuthorizationError);
  }
  assert.equal(queries, 0);

  const baseline = await withApprovedMigrationClient(
    async (db) => {
      const people = (
        await db.query<{
          id: number;
          nameAr: string;
          isActive: boolean;
          isTrainee: boolean;
          teamId: number | null;
        }>(
          `SELECT id,name_ar AS "nameAr",is_active AS "isActive",is_trainee AS "isTrainee",team_id AS "teamId" FROM public.people WHERE is_staff ORDER BY name_ar COLLATE "arabic",id`,
        )
      ).rows;
      if (!synthetic) {
        assert.equal(people.length, 66);
        assert.equal(people.filter((p) => p.isActive).length, 23);
        assert.equal(people.filter((p) => !p.isActive).length, 43);
        assert.equal(
          (await db.query('SELECT count(*)::integer n FROM people WHERE NOT is_staff')).rows[0]?.n,
          71,
        );
      }
      const external = (
        await db.query<{ id: number }>('SELECT id FROM people WHERE NOT is_staff ORDER BY id')
      ).rows;
      const provenance = (
        await db.query(
          `SELECT a.id FROM person_name_alias a JOIN people p ON p.id=a.person_id JOIN audit_actors actor ON actor.id=a.created_by LEFT JOIN _migration.staff_roster_alias s ON s.id=a.id WHERE (NOT p.is_application_native AND actor.actor_key='system_migration') IS DISTINCT FROM coalesce(s.is_imported,false)`,
        )
      ).rows;
      assert.equal(
        provenance.length,
        0,
        'runtime alias provenance must exactly equal immutable migration-61 evidence',
      );
      const importedAliasIds = new Set(
        (
          await db.query<{ id: number }>(
            'SELECT id FROM _migration.staff_roster_alias WHERE is_imported',
          )
        ).rows.map((a) => a.id),
      );
      return { people, external, importedAliasIds };
    },
    { databaseUrl: migrationUrl, clientConfig: { options: '-c default_transaction_read_only=on' } },
  );

  const admin = viewer('Administrator');
  for (const role of AUTH_ROLES) {
    const session = viewer(role);
    const active = await readStaffRoster(session, {}, database);
    assert.equal(active.total, baseline.people.filter((p) => p.isActive).length);
    for (const person of baseline.people) {
      const detail = await readStaffDetail(session, String(person.id), database);
      assert.ok(detail);
      assert.equal(detail.id, person.id);
      assert.equal(detail.nameAr, person.nameAr);
      assert.equal(Object.hasOwn(detail, 'account'), role === 'Administrator');
      assert.equal(Object.hasOwn(detail, 'canLogin'), false);
      assert.equal(detail.aliases.filter((a) => a.isPrimary && !a.isRetired).length, 1);
      for (const alias of detail.aliases)
        assert.equal(alias.isImported, baseline.importedAliasIds.has(alias.id));
    }
    for (const person of baseline.external)
      assert.equal(await readStaffDetail(session, String(person.id), database), null);
    assert.equal(await readStaffDetail(session, '2147483647', database), null);
  }
  console.log(
    'PASS all four roles: internal identities/details only; every external ID denied; account data Administrator-only',
  );
  await assert.rejects(readStaffRoster(admin, { team: '32767' }, database), StaffFilterError);

  for (const status of ['active', 'former', 'all'])
    for (const team of ['all', 'unassigned', '1', '2'])
      for (const trainee of ['all', 'yes', 'no']) {
        const expected = baseline.people.filter(
          (p) =>
            (status === 'all' || p.isActive === (status === 'active')) &&
            (team === 'all' || p.teamId === (team === 'unassigned' ? null : Number(team))) &&
            (trainee === 'all' || p.isTrainee === (trainee === 'yes')),
        );
        const first = await readStaffRoster(admin, { status, team, trainee }, database);
        assert.equal(first.total, expected.length);
        const ids = first.rows.map((p) => p.id);
        for (let page = 2; page <= first.pages; page++)
          ids.push(
            ...(
              await readStaffRoster(admin, { status, team, trainee, page: String(page) }, database)
            ).rows.map((p) => p.id),
          );
        assert.deepEqual(
          ids,
          expected.map((p) => p.id),
        );
        const beyond = await readStaffRoster(
          admin,
          { status, team, trainee, page: '2147483647' },
          database,
        );
        assert.equal(beyond.filters.page, first.pages);
      }
  console.log(
    'PASS 36 filter combinations and every page: exact cardinality, stable Arabic order, no omissions/duplicates, beyond-last clamping',
  );

  await withApprovedMigrationClient(
    async (db) => {
      const aliases = (
        await db.query<{ alias: string; personId: number; retired: boolean }>(
          `SELECT a.alias_ar alias,a.person_id AS "personId",a.is_retired retired FROM person_name_alias a JOIN people p ON p.id=a.person_id WHERE p.is_staff ORDER BY a.id`,
        )
      ).rows;
      for (const alias of aliases) {
        const normal = (
          await db.query<{ q: string }>('SELECT public.ar_normalise($1) q', [alias.alias])
        ).rows[0]!.q;
        const result = await readStaffRoster(admin, { q: normal, status: 'all' }, database);
        if (!alias.retired)
          assert.ok(
            result.rows.some((p) => p.id === alias.personId),
            'active alias does not resolve to its stable person',
          );
        assert.equal(new Set(result.rows.map((p) => p.id)).size, result.rows.length);
      }
    },
    { databaseUrl: migrationUrl, clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  for (const q of ['%', '_', "' OR true --", '\\', 'لا توجد نتيجة للاختبار'])
    assert.equal((await readStaffRoster(admin, { q, status: 'all' }, database)).total, 0);
  assert.ok(
    (await readStaffRoster(admin, { q: 'احمد', status: 'all' }, database)).rows.some(
      (p) => p.matchedAlias,
    ),
  );
  console.log(
    'PASS every searchable internal alias after normalization, visible alternate matches, literal wildcard/SQL input and empty results',
  );

  const plans = [];
  for (const params of [
    {},
    { q: 'احمد', status: 'all' },
    { status: 'former', team: 'unassigned' },
    { q: 'محمد', status: 'all' },
  ]) {
    const f = parseStaffFilters(params);
    for (const sql of [staffCountQuery(f), staffRowsQuery(f, 1)]) {
      const plan = await database.$queryRaw<
        { 'QUERY PLAN': { 'Execution Time': number; Plan: unknown }[] }[]
      >(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
      const data = plan[0]!['QUERY PLAN'][0]!;
      plans.push(data);
      assert.ok(data['Execution Time'] < 1000, 'roster query exceeds one second at actual volumes');
    }
  }
  if (process.env['STAFF_EVIDENCE_DIR'])
    writeFileSync(
      process.env['STAFF_EVIDENCE_DIR'] + '/query-plans.json',
      JSON.stringify(plans, null, 2),
    );
  console.log(
    `PASS real-volume EXPLAIN ANALYZE: ${plans.length} plans, maximum ${Math.max(...plans.map((p) => p['Execution Time']))} ms`,
  );
}

async function main() {
  const projectOnly = process.argv.includes('--project-read-only');
  const checkpoint = process.argv.includes('--restored-client-fixture') ? 62 : 61;
  assert.ok(
    process.argv
      .slice(2)
      .every((arg) => ['--project-read-only', '--restored-client-fixture'].includes(arg)),
  );
  const before = await withApprovedMigrationClient(
    async (db) => {
      assert.equal(await assertStaffCheckpoint(db, 'historical-full-state-upgrade'), checkpoint);
      assert.deepEqual(
        (
          await db.query(
            `SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::integer applied,count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::integer unfinished FROM _prisma_migrations`,
          )
        ).rows,
        [{ applied: checkpoint, unfinished: 0 }],
      );
      return staffReadOnlyState(db);
    },
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  const run = async (runtimeUrl: string, migrationUrl?: string) => {
    const database = createDatabaseClient(runtimeUrl);
    try {
      await proveStaffReads(database, migrationUrl);
    } finally {
      await database.$disconnect();
    }
    await withApprovedMigrationClient(
      async (db) => {
        assert.deepEqual(await auditStructureFailures(db), []);
        assert.deepEqual(await auditDataFailures(db), []);
        assert.deepEqual(await auditEventStructureFailures(db), []);
        assert.deepEqual(await auditEventDataFailures(db, { historicalLive: true }), []);
        assert.deepEqual(
          await staffReadOnlyState(db),
          before,
          'read-only roster changed rows, sequences or catalog',
        );
      },
      {
        databaseUrl: migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    console.log(
      'PASS audit attribution/event invariants and zero read-side writes to all 103 tables/sequences/catalog',
    );
  };
  if (projectOnly) {
    // URL option reaches the actual pg adapter, not merely the shell.
    const runtimeUrl = new URL(process.env['DATABASE_URL']!);
    runtimeUrl.searchParams.set('options', '-c default_transaction_read_only=on');
    await run(runtimeUrl.toString());
  } else {
    await withCurrentClientFixture(async (fixture) => {
      await fixture.restoreProject();
      // Restored roles have new generated credentials; role catalog hashes
      // exclude passwords and the template has the original database ACL.
      const database = createDatabaseClient(fixture.runtimeUrl);
      try {
        await proveStaffReads(database, fixture.migrationUrl);
        const administrator = await withApprovedMigrationClient(
          async (db) => {
            const rows = (
              await db.query<{ id: number }>(
                `SELECT id FROM user_accounts WHERE role_code='Administrator' AND is_enabled ORDER BY id`,
              )
            ).rows;
            assert.equal(rows.length, 1);
            return rows[0]!.id;
          },
          { databaseUrl: fixture.migrationUrl },
        );
        // Own synthetic person/aliases only. No existing person is modified;
        // this is query-fixture setup, not the Phase 1 mutation suite.
        const created = await database.$transaction(
          async (tx) => {
            await setHumanAuditContext(tx, administrator, createMaintenanceAuditMetadata());
            const { id } = one(
              await tx.$queryRaw<
                { id: number }[]
              >`SELECT public.staff_create_person('اختبار واجهة الموظفين',NULL,'ui-fixture@example.test',false,NULL) id`,
            );
            const add = async (name: string) => {
              const { version } = one(
                await tx.$queryRaw<
                  { version: bigint }[]
                >`SELECT row_version AS version FROM people WHERE id=${id!}`,
              );
              const { aliasId } = one(
                await tx.$queryRaw<
                  { aliasId: number }[]
                >`SELECT public.staff_add_alias(${id!},${version!},${name}) AS "aliasId"`,
              );
              return aliasId!;
            };
            for (let i = 0; i < 30; i++) await add(`اختبار تكرار مستعار ${i}`);
            await add('اختبار JTI');
            await add('أَختبَار التَّجْرِبَة ١٢');
            const retired = await add('اختبار هجاء متقاعد');
            const { version } = one(
              await tx.$queryRaw<
                { version: bigint }[]
              >`SELECT row_version AS version FROM people WHERE id=${id!}`,
            );
            await tx.$queryRaw`SELECT public.staff_set_alias_retired(${id!},${version!},${retired},true,'سبب اختبار فقط')`;
            return id!;
          },
          { timeout: 30_000 },
        );
        const testViewer = viewer('Administrator');
        for (const q of ['اختبار تكرار مستعار', 'اختبار jti', 'اختبار التجربه 12']) {
          const result = await readStaffRoster(testViewer, { q, status: 'all' }, database);
          assert.equal(result.total, 1);
          assert.deepEqual(
            result.rows.map((p) => p.id),
            [created],
          );
          assert.ok(result.rows[0]!.matchedAlias);
        }
        for (const q of ['اختبار قTI', 'اختبار هجاء متقاعد'])
          assert.equal(
            (await readStaffRoster(testViewer, { q, status: 'all' }, database)).total,
            0,
          );
        const detail = await readStaffDetail(testViewer, String(created), database);
        assert.ok(detail);
        assert.equal(detail.aliases.length, 34);
        assert.equal(detail.aliases.filter((a) => a.isImported).length, 0);
        assert.equal(detail.aliases.filter((a) => a.isRetired).length, 1);
        assert.equal(detail.account, null);
        console.log(
          'PASS synthetic query fixtures: 30 matching aliases yield one person; retired alias retained but unsearchable; Arabic folds and J/ق separation',
        );
      } finally {
        await database.$disconnect();
      }
      const result = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'scripts/test-permissions.ts', '--restored-fixture'],
        { env: fixture.environment, stdio: 'inherit', windowsHide: true },
      );
      assert.equal(result.status, 0, 'authorization regression');
    }, process.env['MIGRATION_DATABASE_URL']);
  }
  const after = await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
  assert.deepEqual(after, before);
  if (process.env['STAFF_EVIDENCE_DIR'])
    writeFileSync(
      process.env['STAFF_EVIDENCE_DIR'] + '/database-preservation.json',
      JSON.stringify({ before, after }, null, 2),
    );
  console.log(
    `PASS project preservation: ${before.tables.length} tables, ${before.tableDigest}; sequences ${before.sequenceDigest}; catalog ${before.catalogDigest}`,
  );
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/test-staff-read-only.ts'))
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Staff read-only verification failed');
    process.exitCode = 1;
  });
