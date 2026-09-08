import 'dotenv/config';
import assert from 'node:assert/strict';
import type { Session } from 'next-auth';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { withIsolatedPostgres } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { createDatabaseClient } from '../src/lib/db';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import {
  mutateStaff,
  readStaffManagement,
  StaffMutationError,
  type StaffOperation,
  type StaffInput,
} from '../src/lib/staff-mutations';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import { createManagedAccount } from '../src/lib/auth/user-management';
import { changeOwnPassword } from '../src/lib/auth/service';
import { validateSessionClaims } from '../src/lib/auth/session';
import { assertStaffBoundary } from './lib/staff-roster-structure';
import { proveStaffMutations } from './lib/staff-roster-fixture-tests';

async function main() {
  const before = await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    const serviceUrl = await fixture.createDatabase(
      'litigation_task40a_phase3_service',
      'litigation',
    );
    const runtimeUrl = new URL(fixture.runtimeUrl);
    runtimeUrl.pathname = new URL(serviceUrl).pathname;
    const runtime = createDatabaseClient(runtimeUrl.toString());
    const inspect = <T>(operation: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
      withApprovedMigrationClient(operation, { databaseUrl: serviceUrl });
    try {
      const account = await runtime.userAccount.findFirstOrThrow({
        where: { roleCode: 'Administrator' },
        select: { id: true, personId: true, username: true, sessionVersion: true },
      });
      const session = {
        expires: new Date(Date.now() + 3600000).toISOString(),
        user: {
          id: String(account.id),
          personId: account.personId,
          username: account.username,
          name: 'TEST ONLY',
          role: 'Administrator',
          mustChangePassword: false,
          sessionVersion: account.sessionVersion,
          auditSessionId: createMaintenanceAuditMetadata().auditSessionId,
        },
      } as Session;
      const dependencies = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
      const created = await mutateStaff(
        session,
        'create',
        {
          nameAr: 'اختبار معزول للموظف',
          nameEn: '',
          email: ' STAFF.TEST@example.invalid ',
          isTrainee: 'false',
          teamId: '',
        },
        dependencies,
      );
      assert.equal(created.changed, true);
      const snapshot = await readStaffManagement(session, String(created.personId), runtime);
      assert.equal(snapshot.person?.email, 'staff.test@example.invalid');
      assert.equal(snapshot.aliases.length, 1);
      assert.equal(snapshot.aliases[0]?.isPrimary, true);
      console.log('PASS create, normalized email, primary alias and Administrator management read');
      const run = (operation: StaffOperation, input: StaffInput, acting = session) =>
        mutateStaff(acting, operation, input, {
          database: runtime,
          auditMetadata: createMaintenanceAuditMetadata(),
        });
      const current = async (personId: number) =>
        (await readStaffManagement(session, String(personId), runtime)).person!;
      const target = async (personId: number) => ({
        personId: String(personId),
        version: (await current(personId)).version,
        confirmation: String(personId),
      });
      const unchanged = async (operation: () => Promise<unknown>) => {
        const before = await inspect(staffReadOnlyState);
        await operation();
        assert.deepEqual(
          await inspect(staffReadOnlyState),
          before,
          'no-op changed full row/version/time/audit/mutex/sequence state',
        );
      };
      const reject = (operation: () => Promise<unknown>, code: string) =>
        assert.rejects(
          operation,
          (error) => error instanceof StaffMutationError && error.code === code,
        );
      let sequence = 0;
      const create = async (nameAr = `اختبار معزول للهوية TEST ${++sequence}`, email = '') =>
        (await run('create', { nameAr, nameEn: '', email, isTrainee: 'false', teamId: '' }))
          .personId;
      const base = await current(created.personId);
      const edit = {
        ...(await target(base.id)),
        nameEn: '',
        email: ' STAFF.TEST@EXAMPLE.INVALID ',
        isTrainee: 'false',
        teamId: '',
      };
      await unchanged(() => run('update', edit));
      await unchanged(() => run('rename', { ...edit, nameAr: base.nameAr }));
      const meta = createMaintenanceAuditMetadata();
      await mutateStaff(
        session,
        'update',
        { ...edit, nameEn: 'TEST ONLY CHANGED', teamId: String(snapshot.teams[0]!.id) },
        { database: runtime, auditMetadata: meta },
      );
      const actorId = await inspect(
        async (db) =>
          (await db.query('SELECT id FROM audit_actors WHERE user_account_id=$1', [account.id]))
            .rows[0].id,
      );
      const events = await inspect(
        async (db) =>
          (
            await db.query('SELECT * FROM audit_events WHERE request_id=$1 ORDER BY id', [
              meta.requestId,
            ])
          ).rows,
      );
      assert.ok(events.length > 0);
      for (const event of events) {
        assert.equal(event.actor_id, actorId);
        assert.equal(event.correlation_id, meta.correlationId);
        assert.equal(event.audit_session_id, meta.auditSessionId);
      }
      const updateEvent = events.find((event) => event.entity_table === 'people');
      assert.equal(updateEvent.action, 'record_updated');
      assert.equal(updateEvent.before_values.name_en, null);
      assert.equal(updateEvent.after_values.name_en, 'TEST ONLY CHANGED');
      assert.equal(updateEvent.after_values.team_id, snapshot.teams[0]!.id);
      await reject(() => run('update', edit), 'stale');
      for (const [field, value, code] of [
        ['nameAr', '', 'invalid'],
        ['nameAr', 'TEST ONLY', 'name'],
        ['email', 'invalid', 'email'],
      ] as const)
        await reject(
          () =>
            run('create', {
              nameAr: 'اختبار معزول',
              nameEn: '',
              email: '',
              isTrainee: 'false',
              teamId: '',
              [field]: value,
            }),
          code,
        );
      console.log(
        'PASS allowlisted update, exact actor/request/session audit fields, stale rejection, validation and complete no-op preservation',
      );

      const imported = await runtime.person.findFirstOrThrow({
        where: {
          isStaff: true,
          isApplicationNative: false,
          account: null,
          reviews: { none: {} },
        },
        select: { id: true },
      });
      const importedBefore = await readStaffManagement(session, String(imported.id), runtime);
      const importedEvidence = await inspect(
        async (db) =>
          (await db.query('SELECT * FROM _migration.staff_roster_alias ORDER BY id')).rows,
      );
      const oldName = importedBefore.person!.nameAr;
      await run('rename', {
        ...(await target(imported.id)),
        nameAr: 'اختبار تصحيح اسم مستورد TEST ONLY',
      });
      const renamed = await readStaffManagement(session, String(imported.id), runtime);
      assert.equal(renamed.aliases.filter((alias) => alias.isPrimary).length, 1);
      assert.equal(renamed.aliases.find((alias) => alias.name === oldName)?.isRetired, false);
      assert.equal(renamed.aliases.find((alias) => alias.name === oldName)?.isPrimary, false);
      for (const alias of importedBefore.aliases) {
        const after = renamed.aliases.find((value) => value.id === alias.id)!;
        assert.equal(after.name, alias.name);
        assert.equal(after.isImported, alias.isImported);
        assert.equal(after.isRetired, false);
      }
      assert.deepEqual(
        await inspect(
          async (db) =>
            (await db.query('SELECT * FROM _migration.staff_roster_alias ORDER BY id')).rows,
        ),
        importedEvidence,
      );
      const oldPrimary = importedBefore.aliases.find((alias) => alias.isPrimary)!;
      await reject(
        async () =>
          run('retire-alias', {
            ...(await target(imported.id)),
            aliasId: String(oldPrimary.id),
            reason: 'اختبار منع تغيير المصدر',
          }),
        'immutable-alias',
      );
      await run('add-alias', {
        ...(await target(imported.id)),
        alias: 'اختبار اسم محفوظ TEST ALIAS',
      });
      const added = (await readStaffManagement(session, String(imported.id), runtime)).aliases.find(
        (alias) => alias.name === 'اختبار اسم محفوظ TEST ALIAS',
      )!;
      assert.equal(added.isImported, false);
      await unchanged(async () =>
        run('add-alias', { ...(await target(imported.id)), alias: added.name }),
      );
      await reject(
        async () =>
          run('retire-alias', {
            ...(await target(imported.id)),
            aliasId: String(added.id),
            reason: '',
          }),
        'reason',
      );
      await run('retire-alias', {
        ...(await target(imported.id)),
        aliasId: String(added.id),
        reason: 'اختبار سبب الاستبعاد',
      });
      await unchanged(async () =>
        run('retire-alias', {
          ...(await target(imported.id)),
          aliasId: String(added.id),
          reason: 'اختبار سبب آخر لا يغير الحالة',
        }),
      );
      await reject(
        async () => run('rename', { ...(await target(imported.id)), nameAr: added.name }),
        'retired-alias',
      );
      await run('restore-alias', {
        ...(await target(imported.id)),
        aliasId: String(added.id),
        reason: 'اختبار سبب الإعادة',
      });
      const aliasAudit = await inspect(
        async (db) =>
          (
            await db.query(
              "SELECT action,before_values,after_values FROM audit_events WHERE entity_table='person_name_alias' AND entity_key=jsonb_build_object('id',$1::integer) ORDER BY id",
              [added.id],
            )
          ).rows,
      );
      assert.deepEqual(
        aliasAudit.map((event) => event.action),
        ['record_created', 'record_updated', 'archive', 'record_updated', 'restore'],
      );
      assert.equal(aliasAudit[1].after_values.retirement_reason, 'اختبار سبب الاستبعاد');
      assert.equal(aliasAudit[3].after_values.retirement_reason, 'اختبار سبب الإعادة');
      console.log(
        'PASS imported rename, immutable complete evidence, native alias add/retire/restore, reasons and exact audit history',
      );

      const never = {
        $transaction: () => {
          throw new Error('unauthorized query reached');
        },
      } as unknown as typeof runtime;
      for (const role of ['Litigation Assistant', 'Lawyer', 'Paralegal', 'Unknown']) {
        const denied = { ...session, user: { ...session.user, role } } as Session;
        await assert.rejects(readStaffManagement(denied, null, never), AuthorizationError);
        for (const op of [
          'create',
          'update',
          'rename',
          'add-alias',
          'retire-alias',
          'restore-alias',
          'deactivate',
          'reactivate',
          'reviewer',
        ] as StaffOperation[])
          await assert.rejects(
            mutateStaff(denied, op, {}, { database: never, auditMetadata: meta }),
            AuthorizationError,
          );
      }
      await assert.rejects(
        mutateStaff(null, 'create', {}, { database: never, auditMetadata: meta }),
        AuthorizationError,
      );
      await reject(
        () => run('create', {}, { ...session, user: { ...session.user, sessionVersion: -1 } }),
        'administrator',
      );
      await reject(async () => run('deactivate', await target(account.personId)), 'self');
      const external = await runtime.person.findFirstOrThrow({
        where: { isStaff: false },
        select: { id: true },
      });
      await reject(
        () => run('update', { personId: String(external.id), version: '1' }),
        'not-found',
      );
      console.log(
        'PASS every direct service operation denies all non-Administrators, invalid/stale actors, self-deactivation and external identities',
      );

      const race = async (
        left: () => Promise<unknown>,
        right: () => Promise<unknown>,
        label: string,
      ) => {
        const result = await Promise.allSettled([left(), right()]);
        assert.equal(result.filter((value) => value.status === 'fulfilled').length, 1, label);
        assert.equal(result.filter((value) => value.status === 'rejected').length, 1, label);
        console.log('PASS concurrent ' + label);
      };
      for (const [leftKind, rightKind] of [
        ['create', 'create'],
        ['create', 'rename'],
        ['rename', 'create'],
        ['create', 'add-alias'],
        ['add-alias', 'create'],
        ['add-alias', 'add-alias'],
        ['rename', 'rename'],
        ['rename', 'add-alias'],
        ['add-alias', 'rename'],
      ] as const) {
        const left = await create(),
          right = await create();
        const l = await target(left),
          r = await target(right);
        const suffix = ++sequence;
        const attempt = (kind: typeof leftKind, row: StaffInput, nameAr: string) =>
          kind === 'create' ? create(nameAr) : run(kind, { ...row, nameAr, alias: nameAr });
        await race(
          () => attempt(leftKind, l, `أحمد اختبار سباق ${suffix}`),
          () => attempt(rightKind, r, `احمد اختبار سباق ${suffix}`),
          leftKind + '/' + rightKind + ' normalized name',
        );
      }
      for (const [leftKind, rightKind] of [
        ['create', 'create'],
        ['create', 'update'],
        ['update', 'create'],
        ['update', 'update'],
      ] as const) {
        const left = await create(),
          right = await create();
        const l = await target(left),
          r = await target(right),
          suffix = ++sequence;
        const attempt = (kind: typeof leftKind, row: StaffInput, email: string) =>
          kind === 'create'
            ? create(undefined, email)
            : run('update', { ...row, nameEn: '', email, isTrainee: 'false', teamId: '' });
        await race(
          () => attempt(leftKind, l, ` RACE${suffix}@EXAMPLE.INVALID `),
          () => attempt(rightKind, r, `race${suffix}@example.invalid`),
          leftKind + '/' + rightKind + ' normalized email',
        );
      }
      const staleId = await create(),
        staleToken = await target(staleId);
      await race(
        () => run('rename', { ...staleToken, nameAr: 'اختبار نسخة أولى' }),
        () => run('rename', { ...staleToken, nameAr: 'اختبار نسخة ثانية' }),
        'same-person stale version',
      );
      const restoreId = await create(),
        otherId = await create();
      await run('add-alias', { ...(await target(restoreId)), alias: 'أحمد اختبار استعادة سباق' });
      const restoreAlias = (
        await readStaffManagement(session, String(restoreId), runtime)
      ).aliases.find((alias) => !alias.isPrimary)!;
      await run('retire-alias', {
        ...(await target(restoreId)),
        aliasId: String(restoreAlias.id),
        reason: 'اختبار سباق',
      });
      const restoreToken = await target(restoreId),
        otherToken = await target(otherId);
      await race(
        () =>
          run('restore-alias', {
            ...restoreToken,
            aliasId: String(restoreAlias.id),
            reason: 'اختبار إعادة',
          }),
        () => run('rename', { ...otherToken, nameAr: 'احمد اختبار استعادة سباق' }),
        'alias restoration/canonical rename',
      );

      const team = snapshot.teams[0]!;
      const reviewerId = await create();
      const reviewerTarget = await target(reviewerId);
      await race(
        () =>
          run('reviewer', {
            ...reviewerTarget,
            teamId: String(team.id),
            teamVersion: team.version,
            reviewerId: String(reviewerId),
          }),
        () => run('deactivate', reviewerTarget),
        'reviewer assignment/deactivation',
      );
      const teamNow = (await readStaffManagement(session, String(reviewerId), runtime)).teams[0]!;
      if (teamNow.reviewerId === reviewerId) {
        await reject(
          async () =>
            run('update', {
              ...(await target(reviewerId)),
              nameEn: '',
              email: '',
              isTrainee: 'true',
              teamId: '',
            }),
          'reviewer',
        );
        await run('reviewer', {
          ...(await target(reviewerId)),
          teamId: String(team.id),
          teamVersion: teamNow.version,
          reviewerId: String(team.reviewerId),
        });
        await run('deactivate', await target(reviewerId));
      }
      const teamStable = (await readStaffManagement(session, String(base.id), runtime)).teams[0]!;
      await unchanged(async () =>
        run('reviewer', {
          ...(await target(base.id)),
          teamId: String(teamStable.id),
          teamVersion: teamStable.version,
          reviewerId: String(teamStable.reviewerId),
        }),
      );
      console.log('PASS reviewer eligibility, replacement-before-deactivation and reviewer no-op');

      const linked = await runtime.userAccount.findFirstOrThrow({
        where: { roleCode: 'Lawyer' },
        select: {
          id: true,
          personId: true,
          username: true,
          sessionVersion: true,
          mustChangePassword: true,
        },
      });
      const claims = {
        userId: linked.id,
        personId: linked.personId,
        username: linked.username,
        displayName: 'TEST ONLY',
        role: 'Lawyer',
        sessionVersion: linked.sessionVersion,
        mustChangePassword: linked.mustChangePassword,
        authenticatedAt: Date.now(),
        absoluteExpiresAt: Date.now() + 8 * 3600000,
        remembered: false,
        auditSessionId: createMaintenanceAuditMetadata().auditSessionId,
      };
      claims.absoluteExpiresAt = claims.authenticatedAt + 8 * 3600000;
      assert.ok(await validateSessionClaims(claims, { database: runtime }));
      await run('deactivate', await target(linked.personId));
      assert.equal(await validateSessionClaims(claims, { database: runtime }), null);
      let linkedAfter = await runtime.userAccount.findUniqueOrThrow({ where: { id: linked.id } });
      assert.equal(linkedAfter.isEnabled, false);
      assert.equal(linkedAfter.sessionVersion, linked.sessionVersion + 1);
      assert.equal(linkedAfter.failedLoginAttempts, 0);
      assert.equal(linkedAfter.lockedUntil, null);
      await run('reactivate', await target(linked.personId));
      linkedAfter = await runtime.userAccount.findUniqueOrThrow({ where: { id: linked.id } });
      assert.equal(linkedAfter.isEnabled, false);
      assert.equal(linkedAfter.sessionVersion, linked.sessionVersion + 1);
      assert.equal(await validateSessionClaims(claims, { database: runtime }), null);
      await unchanged(async () => run('reactivate', await target(linked.personId)));
      console.log(
        'PASS linked-account disable, version/lockout/session invalidation and non-revival after employment reactivation',
      );

      const secondPerson = await create();
      const temporary = 'T ' + randomBytes(24).toString('base64url');
      const secondAccount = await createManagedAccount(
        account.id,
        {
          personId: secondPerson,
          username: 'Phase3TestAdmin',
          role: 'Administrator',
          temporaryPassword: temporary,
        },
        dependencies,
      );
      const secondRecord = await runtime.userAccount.findUniqueOrThrow({
        where: { id: secondAccount },
      });
      assert.equal(
        await changeOwnPassword(
          {
            accountId: secondAccount,
            sessionVersion: secondRecord.sessionVersion,
            currentPassword: temporary,
            newPassword: 'P ' + randomBytes(24).toString('base64url'),
          },
          dependencies,
        ),
        'changed',
      );
      const secondCurrent = await runtime.userAccount.findUniqueOrThrow({
        where: { id: secondAccount },
      });
      const secondSession = {
        ...session,
        user: {
          ...session.user,
          id: String(secondAccount),
          personId: secondPerson,
          sessionVersion: secondCurrent.sessionVersion,
        },
      };
      const originalTarget = await target(account.personId),
        secondTarget = await target(secondPerson);
      await race(
        () => run('deactivate', secondTarget),
        () => run('deactivate', originalTarget, secondSession),
        'two Administrators deactivate each other',
      );
      const originalAfter = await runtime.userAccount.findUniqueOrThrow({
        where: { id: account.id },
      });
      const surviving = originalAfter.isEnabled ? session : secondSession;
      const staleActor = originalAfter.isEnabled ? secondSession : session;
      await reject(() => run('create', {}, staleActor), 'administrator');
      const usable = await inspect(
        async (db) =>
          (
            await db.query(
              'SELECT count(*)::integer n FROM user_accounts WHERE user_account_is_usable_administrator(id)',
            )
          ).rows[0].n,
      );
      assert.equal(usable, 1);
      // Restore employment only so boundary assertions cover legitimate changes.
      const inactivePerson = originalAfter.isEnabled ? secondPerson : account.personId;
      const inactive = await runtime.person.findUniqueOrThrow({
        where: { id: inactivePerson },
        select: { rowVersion: true },
      });
      await run(
        'reactivate',
        {
          personId: String(inactivePerson),
          version: String(inactive.rowVersion),
          confirmation: String(inactivePerson),
        },
        surviving,
      );
      console.log(
        'PASS concurrent Administrator survival, stale-Administrator rejection and disabled-account retention',
      );

      // Inject additional refusing triggers only on this labeled disposable DB.
      // Existing guards stay installed. Both failures must roll back everything.
      for (const table of ['audit_events', 'people']) {
        const targetId = originalAfter.isEnabled ? base.id : secondPerson;
        const row = await runtime.person.findUniqueOrThrow({
          where: { id: targetId },
          select: { rowVersion: true },
        });
        await inspect(async (db) => {
          await db.query(
            "CREATE FUNCTION public.phase3_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY injected failure'; END $$",
          );
          await db.query(
            `CREATE TRIGGER phase3_test_failure BEFORE INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.phase3_test_failure()`,
          );
        });
        const beforeFailure = await inspect(staffReadOnlyState);
        await assert.rejects(
          run(
            'rename',
            {
              personId: String(targetId),
              version: String(row.rowVersion),
              confirmation: String(targetId),
              nameAr: 'اختبار تراجع كامل',
            },
            surviving,
          ),
        );
        const afterFailure = await inspect(staffReadOnlyState);
        assert.deepEqual(
          afterFailure.tables,
          beforeFailure.tables,
          'failed gateway/audit changed rows',
        );
        await inspect(async (db) => {
          await db.query(`DROP TRIGGER phase3_test_failure ON public.${table}`);
          await db.query('DROP FUNCTION public.phase3_test_failure()');
        });
      }
      console.log(
        'PASS audit and gateway failure roll back rows, versions, aliases and audit history',
      );
      await inspect((db) => assertStaffBoundary(db, 'historical-full-state-upgrade'));
    } finally {
      await runtime.$disconnect();
    }
    if (!process.argv.includes('--service-only')) {
      assert.equal(
        await proveStaffMutations(
          fixture.migrationUrl,
          fixture.runtimeUrl,
          fixture.environment,
          'historical-full-state-upgrade',
        ),
        22,
      );
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'scripts/check-db.ts',
          '--profile=historical-full-state-upgrade',
        ],
        { env: fixture.environment, stdio: 'inherit', windowsHide: true },
      );
      assert.equal(result.status, 0, 'all historical invariants after gateway mutation proofs');
    }
  });
  const after = await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
  assert.deepEqual(after, before);
  console.log('PASS project preservation and disposable fixture cleanup');
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Staff mutation verification failed');
  process.exitCode = 1;
});
