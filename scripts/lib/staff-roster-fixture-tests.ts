import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import { withApprovedMigrationClient, withRestrictedRuntimeClient } from './migration-principal';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import {
  assertStaffBoundary,
  assertStaffGuards,
  assertStaffFunctions,
} from './staff-roster-structure';
import { type StaffProfile, STAFF_TABLES } from './staff-roster-checkpoint';
import { hashPassword } from '../../src/lib/auth/password';

type Person = {
  id: number;
  name_ar: string;
  name_en: string | null;
  email: string | null;
  is_active: boolean;
  is_trainee: boolean;
  team_id: number | null;
  row_version: string;
  alias_epoch: string;
  is_application_native: boolean;
  application_modified_by: number | null;
};
type Statement = { sql: string; values?: unknown[] };
async function statement(db: ClientBase, query: Statement) {
  return db.query(query.sql, query.values);
}
async function person(db: ClientBase, id: number): Promise<Person> {
  const rows = (await db.query<Person>('SELECT * FROM people WHERE id=$1', [id])).rows;
  assert.equal(rows.length, 1);
  return rows[0]!;
}
async function human(db: ClientBase, account: number): Promise<void> {
  await db.query('SELECT audit_set_human_context($1)', [account]);
  await db.query(
    "SELECT audit_set_event_context($1::uuid,$2::uuid,$3::uuid,'127.0.0.1','Task40a isolated synthetic fixture','unknown')",
    [randomUUID(), randomUUID(), randomUUID()],
  );
}
async function transaction<T>(
  db: ClientBase,
  operation: () => Promise<T>,
  account: number,
): Promise<T> {
  await db.query('BEGIN');
  try {
    await human(db, account);
    const value = await operation();
    await db.query('COMMIT');
    return value;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
function update(row: Person, patch: Partial<Person> = {}): Statement {
  const target = { ...row, ...patch };
  return {
    sql: 'SELECT staff_update_person($1,$2,$3,$4,$5,$6,$7::smallint) version',
    values: [
      row.id,
      row.row_version,
      target.name_en,
      target.email,
      target.is_active,
      target.is_trainee,
      target.team_id,
    ],
  };
}
function rename(row: Person, name: string): Statement {
  return {
    sql: 'SELECT staff_rename_person($1,$2,$3) version',
    values: [row.id, row.row_version, name],
  };
}
function alias(row: Person, name: string): Statement {
  return { sql: 'SELECT staff_add_alias($1,$2,$3) id', values: [row.id, row.row_version, name] };
}
function retire(row: Person, id: number, state: boolean, reason: string): Statement {
  return {
    sql: 'SELECT staff_set_alias_retired($1,$2,$3,$4,$5) version',
    values: [row.id, row.row_version, id, state, reason],
  };
}
async function create(db: ClientBase, name: string, email: string | null = null): Promise<number> {
  return (
    await db.query<{ id: number }>(
      'SELECT staff_create_person($1,NULL,$2,false,NULL::smallint) id',
      [name, email],
    )
  ).rows[0]!.id;
}
async function rejected(
  operation: () => Promise<unknown>,
  codes: string[],
  label: string,
): Promise<void> {
  let caught = false;
  try {
    await operation();
  } catch (error) {
    caught = true;
    assert.ok(
      codes.includes((error as { code: string }).code),
      label + ': unexpected PostgreSQL failure code ' + (error as { code: string }).code,
    );
  }
  assert.ok(caught, label + ': unsafe operation succeeded');
}
async function state(db: ClientBase): Promise<unknown> {
  return (
    await db.query(`SELECT
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM people p) people,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'')) FROM person_name_alias a) aliases,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM lookup_team t) teams,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(u) ORDER BY id)::text,'')) FROM user_accounts u) accounts,
    (SELECT count(*)::integer FROM audit_events) events,
    (SELECT count(*)::integer FROM _migration.staff_roster_change) changes`)
  ).rows[0];
}

/** Every mutation below is behind a generated ownership-label + distinct-cluster
 * proof. No connection string, password, hash or row payload is reported. */
export async function proveStaffMutations(
  migrationUrl: string,
  runtimeUrl: string,
  environment: NodeJS.ProcessEnv,
  profile: StaffProfile,
): Promise<number> {
  let assertions = 0;
  const pass = (label: string) => {
    assertions++;
    console.log('PASS staff mutation: ' + label);
  };
  return withApprovedMigrationClient(
    async (owner) => {
      await assertIsolatedTestCluster(owner, new URL(migrationUrl), environment);
      return withRestrictedRuntimeClient(runtimeUrl, (first) =>
        withRestrictedRuntimeClient(runtimeUrl, async (second) => {
          const administrators = (
            await owner.query<{ id: number; actor_id: number }>(
              "SELECT u.id,a.id actor_id FROM user_accounts u JOIN audit_actors a ON a.user_account_id=u.id WHERE u.username='KHelmy' AND user_account_is_usable_administrator(u.id)",
            )
          ).rows;
          assert.equal(administrators.length, 1);
          const administrator = administrators[0]!;
          const nonAdministrator = (
            await owner.query<{ id: number }>(
              "SELECT id FROM user_accounts WHERE username='MHussien' AND role_code='Litigation Assistant'",
            )
          ).rows[0]!;
          assert.ok(nonAdministrator);
          const run = <T>(operation: () => Promise<T>, account = administrator.id) =>
            transaction(first, operation, account);
          assert.deepEqual((await first.query('SELECT session_user,current_user')).rows, [
            { session_user: 'litigation_runtime', current_user: 'litigation_runtime' },
          ]);
          await assertStaffBoundary(owner, profile);
          const a = await run(() => create(first, '__TASK40A_PERSON_A'));
          const b = await run(() => create(first, '__TASK40A_PERSON_B'));
          let row = await person(owner, a);
          assert.equal(row.is_application_native, true);
          assert.equal(
            (
              await owner.query(
                'SELECT count(*)::integer n FROM person_name_alias WHERE person_id=$1 AND is_primary AND NOT is_retired',
                [a],
              )
            ).rows[0]?.n,
            1,
          );
          pass(
            'atomic native creation with exactly one active primary and immutable actor attribution',
          );

          const unchanged = await state(owner);
          await run(async () => statement(first, update(row)));
          await run(async () => statement(first, rename(row, row.name_ar)));
          assert.deepEqual(await state(owner), unchanged);
          pass('no-op save and no-op rename produce no row, timestamp, event or version change');
          await run(async () =>
            statement(
              first,
              update(row, { name_en: '__TASK40A_CHANGED', email: '  TASK40A@EXAMPLE.INVALID  ' }),
            ),
          );
          const changed = await person(owner, a);
          assert.equal(changed.email, 'task40a@example.invalid');
          assert.equal(BigInt(changed.row_version), BigInt(row.row_version) + 1n);
          assert.equal(changed.application_modified_by, administrator.actor_id);
          await rejected(
            () => run(async () => statement(first, update(row, { name_en: '__TASK40A_STALE' }))),
            ['40001'],
            'stale write',
          );
          pass(
            'database-owned version and application modification; trim/lower email; stale save rejected',
          );
          await run(async () => statement(first, update(changed, { email: '  ' })));
          assert.equal((await person(owner, a)).email, null);
          await run(async () => statement(first, update(await person(owner, b), { email: null })));
          pass('empty email becomes null and multiple null emails remain valid');

          row = await person(owner, a);
          const nativeAlias = (
            await run(async () => statement(first, alias(row, '__TASK40A_ALIAS_A')))
          ).rows[0]!.id as number;
          await run(async () =>
            statement(first, rename(await person(owner, a), '__TASK40A_RENAMED_A')),
          );
          assert.equal(
            (
              await owner.query(
                'SELECT count(*)::integer n FROM person_name_alias WHERE person_id=$1 AND alias_ar=$2 AND NOT is_retired',
                [a, row.name_ar],
              )
            ).rows[0]?.n,
            1,
          );
          await run(async () =>
            statement(
              first,
              retire(await person(owner, a), nativeAlias, true, 'Synthetic obsolete alias'),
            ),
          );
          await rejected(
            () =>
              run(async () =>
                statement(first, retire(await person(owner, a), nativeAlias, false, '')),
              ),
            ['22023'],
            'restoration reason required',
          );
          await run(async () =>
            statement(
              first,
              retire(await person(owner, a), nativeAlias, false, 'Synthetic verified restoration'),
            ),
          );
          const lifecycle = (
            await owner.query(
              "SELECT action FROM audit_events WHERE entity_table='person_name_alias' AND entity_key=jsonb_build_object('id',$1::integer) AND action IN ('archive','restore') ORDER BY id",
              [nativeAlias],
            )
          ).rows;
          assert.deepEqual(lifecycle, [{ action: 'archive' }, { action: 'restore' }]);
          pass(
            'atomic rename retains old spelling; native alias retirement/restoration has reason and semantic audit',
          );

          const imported = (
            await owner.query<{ id: number }>(
              `SELECT p.id FROM people p WHERE NOT p.is_application_native AND p.is_staff AND p.is_active AND NOT EXISTS(SELECT 1 FROM lookup_team t WHERE t.reviewer_id=p.id) AND NOT EXISTS(SELECT 1 FROM user_accounts u WHERE u.person_id=p.id) ORDER BY p.id LIMIT 1`,
            )
          ).rows[0]!.id;
          const importedBefore = await person(owner, imported);
          const importedPrimary = (
            await owner.query<{ id: number }>(
              'SELECT id FROM person_name_alias WHERE person_id=$1 AND is_primary',
              [imported],
            )
          ).rows[0]!.id;
          await run(async () =>
            statement(first, rename(importedBefore, '__TASK40A_IMPORTED_CANONICAL_CHANGE')),
          );
          assert.equal((await person(owner, imported)).is_application_native, false);
          assert.deepEqual(
            (
              await owner.query(
                'SELECT person_id,alias_ar,is_primary,is_retired FROM person_name_alias WHERE id=$1',
                [importedPrimary],
              )
            ).rows,
            [
              {
                person_id: imported,
                alias_ar: importedBefore.name_ar,
                is_primary: false,
                is_retired: false,
              },
            ],
          );
          await rejected(
            () =>
              run(async () =>
                statement(
                  first,
                  retire(
                    await person(owner, imported),
                    importedPrimary,
                    true,
                    'Synthetic attempted imported retirement',
                  ),
                ),
              ),
            ['22023'],
            'imported alias retirement',
          );
          // Leave the legitimate imported rename in place. The full historical suite
          // must reconcile the frozen source spelling, not demand a live-name rollback.
          pass(
            'imported rename preserves stable identity and imported aliases; imported retirement rejected',
          );

          for (const table of ['people', 'person_name_alias', 'lookup_team']) {
            const attempts = [
              `UPDATE ${table} SET id=id`,
              `DELETE FROM ${table} WHERE false`,
              `TRUNCATE ${table}`,
            ];
            for (const sql of attempts)
              await rejected(
                () => run(() => first.query(sql)),
                ['42501'],
                'runtime direct roster DML',
              );
          }
          for (const table of STAFF_TABLES)
            await rejected(
              () => first.query(`SELECT * FROM _migration.${table}`),
              ['42501'],
              'private evidence access',
            );
          await rejected(
            () => first.query('SELECT _migration.lock_staff_roster()'),
            ['42501'],
            'private helper execution',
          );
          await rejected(
            () => first.query("SELECT nextval('people_id_seq')"),
            ['42501'],
            'runtime roster sequence',
          );
          await rejected(
            () => run(() => create(first, '__TASK40A_NOT_ADMIN'), nonAdministrator.id),
            ['42501'],
            'non-Administrator roster write',
          );
          await rejected(
            () =>
              first.query(
                "SELECT staff_create_person('__TASK40A_NO_ACTOR',NULL,NULL,false,NULL::smallint)",
              ),
            ['42501', 'P0001'],
            'missing actor',
          );
          pass(
            'runtime direct DML, physical deletion, private evidence, helper and sequence access denied; current human Administrator required',
          );

          const original = (
            await owner.query('SELECT person_id FROM user_accounts WHERE id=$1', [administrator.id])
          ).rows[0]!.person_id as number;
          await rejected(
            () =>
              run(async () =>
                statement(first, update(await person(owner, original), { is_active: false })),
              ),
            ['42501', 'P0001', '23514'],
            'self deactivation',
          );
          const reviewer = await person(owner, b);
          for (const team of (
            await owner.query<{ id: number; row_version: string }>(
              'SELECT id,row_version FROM lookup_team ORDER BY id',
            )
          ).rows) {
            await run(() =>
              first.query('SELECT staff_set_team_reviewer($1::smallint,$2,$3)', [
                team.id,
                team.row_version,
                reviewer.id,
              ]),
            );
          }
          await rejected(
            () =>
              run(async () =>
                statement(first, update(await person(owner, b), { is_active: false })),
              ),
            ['23514'],
            'active reviewer deactivation',
          );
          await rejected(
            () =>
              run(async () =>
                statement(first, update(await person(owner, b), { is_trainee: true })),
              ),
            ['23514'],
            'active reviewer trainee',
          );
          assert.equal((await person(owner, b)).team_id, null);
          pass(
            'one eligible reviewer may cover both fixed teams without membership; self-deactivation and invalid reviewer transitions rejected',
          );

          // A deterministic two-session race: observe PostgreSQL's actual lock wait,
          // then release the first writer. No timing-dependent two-success test.
          const race = async (
            left: Statement,
            right: Statement,
            codes: string[],
            isolation = 'READ COMMITTED',
            rightAccount = administrator.id,
          ) => {
            await first.query('BEGIN ISOLATION LEVEL ' + isolation);
            await second.query('BEGIN ISOLATION LEVEL ' + isolation);
            let pending: Promise<{ ok: true } | { ok: false; code: string }> | undefined;
            try {
              await human(first, administrator.id);
              await human(second, rightAccount);
              const pid = (await second.query<{ pid: number }>('SELECT pg_backend_pid() pid'))
                .rows[0]!.pid;
              await statement(first, left);
              pending = statement(second, right).then(
                async () => {
                  await second.query('COMMIT');
                  return { ok: true as const };
                },
                async (error: unknown) => {
                  await second.query('ROLLBACK');
                  return { ok: false as const, code: (error as { code: string }).code };
                },
              );
              let blocked = false;
              for (let i = 0; i < 200; i++) {
                const wait = (
                  await owner.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [
                    pid,
                  ])
                ).rows[0]?.wait_event_type;
                if (wait === 'Lock') {
                  blocked = true;
                  break;
                }
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              assert.ok(blocked, 'second mutation did not serialize behind the first');
              await first.query('COMMIT');
              const result = await pending;
              assert.equal(result.ok, false, 'both competing writers committed');
              if (!result.ok)
                assert.ok(codes.includes(result.code), 'unexpected race rejection ' + result.code);
            } finally {
              await first.query('ROLLBACK');
              if (pending) await pending;
              await second.query('ROLLBACK');
            }
          };
          for (const isolation of ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']) {
            for (const [leftKind, rightKind] of [
              ['canonical', 'canonical'],
              ['canonical', 'alias'],
              ['alias', 'canonical'],
              ['alias', 'alias'],
            ]) {
              const suffix = `__TASK40A_${isolation.replaceAll(' ', '_')}_${leftKind}_${rightKind}`;
              const left = await person(owner, a),
                right = await person(owner, b);
              await race(
                leftKind === 'canonical' ? rename(left, 'أ' + suffix) : alias(left, 'أ' + suffix),
                rightKind === 'canonical'
                  ? rename(right, 'ا' + suffix)
                  : alias(right, 'ا' + suffix),
                ['23505', '40001'],
                isolation,
              );
            }
            pass(
              isolation +
                ': all four canonical/alias normalized collision races serialize and reject second owner',
            );
          }
          await race(
            update(await person(owner, a), { email: '  Race@Example.Invalid ' }),
            update(await person(owner, b), { email: 'race@example.invalid' }),
            ['23505'],
          );
          pass('two-session normalized email uniqueness');
          const stale = await person(owner, a);
          await race(
            update(stale, { name_en: '__TASK40A_WINNER' }),
            update(stale, { name_en: '__TASK40A_LOSER' }),
            ['40001'],
          );
          pass('two-session optimistic row-version protection');

          const restorationAlias = (
            await run(async () =>
              statement(first, alias(await person(owner, a), 'أ__TASK40A_RESTORATION_RACE')),
            )
          ).rows[0]!.id as number;
          await run(async () =>
            statement(
              first,
              retire(await person(owner, a), restorationAlias, true, 'Synthetic retired spelling'),
            ),
          );
          await race(
            alias(await person(owner, b), 'ا__TASK40A_RESTORATION_RACE'),
            retire(
              await person(owner, a),
              restorationAlias,
              false,
              'Synthetic collision restoration',
            ),
            ['23505'],
          );
          assert.equal(
            (
              await owner.query('SELECT is_retired FROM person_name_alias WHERE id=$1', [
                restorationAlias,
              ])
            ).rows[0]?.is_retired,
            true,
          );
          pass('retired alias restoration rechecks collisions after a competing claim commits');

          const candidate = await run(() => create(first, '__TASK40A_REVIEWER_RACE'));
          let team = (
            await owner.query<{ id: number; row_version: string }>(
              'SELECT id,row_version FROM lookup_team ORDER BY id LIMIT 1',
            )
          ).rows[0]!;
          await race(
            {
              sql: 'SELECT staff_set_team_reviewer($1::smallint,$2,$3)',
              values: [team.id, team.row_version, candidate],
            },
            update(await person(owner, candidate), { is_active: false }),
            ['23514'],
          );
          team = (
            await owner.query<{ id: number; row_version: string }>(
              'SELECT id,row_version FROM lookup_team WHERE id=$1',
              [team.id],
            )
          ).rows[0]!;
          await run(() =>
            first.query('SELECT staff_set_team_reviewer($1::smallint,$2,$3)', [
              team.id,
              team.row_version,
              b,
            ]),
          );
          team = (
            await owner.query<{ id: number; row_version: string }>(
              'SELECT id,row_version FROM lookup_team WHERE id=$1',
              [team.id],
            )
          ).rows[0]!;
          await race(
            update(await person(owner, candidate), { is_trainee: true }),
            {
              sql: 'SELECT staff_set_team_reviewer($1::smallint,$2,$3)',
              values: [team.id, team.row_version, candidate],
            },
            ['23514'],
          );
          pass(
            'reviewer assignment versus deactivation or trainee change cannot commit an ineligible reviewer',
          );

          const accountPerson = await run(() => create(first, '__TASK40A_ACCOUNT_PERSON'));
          const password = await hashPassword(randomBytes(36).toString('base64url'));
          const account = (
            await run(() =>
              first.query<{ id: number }>(
                "SELECT create_user_account_with_actor($1,'Task40aAccount',$2,'Lawyer') id",
                [accountPerson, password],
              ),
            )
          ).rows[0]!.id;
          await run(async () => {
            await first.query('SELECT audit_set_authentication_context()');
            await first.query(
              "UPDATE user_accounts SET failed_login_attempts=5,locked_until=statement_timestamp()+interval '15 minutes' WHERE id=$1",
              [account],
            );
          });
          const oldVersion = (
            await owner.query('SELECT session_version FROM user_accounts WHERE id=$1', [account])
          ).rows[0]!.session_version as number;
          const beforeDisable = (
            await owner.query('SELECT coalesce(max(id),0)::text id FROM audit_events')
          ).rows[0]!.id as string;
          await run(async () =>
            statement(first, update(await person(owner, accountPerson), { is_active: false })),
          );
          assert.deepEqual(
            (
              await owner.query(
                'SELECT is_enabled,failed_login_attempts,locked_until,session_version FROM user_accounts WHERE id=$1',
                [account],
              )
            ).rows,
            [
              {
                is_enabled: false,
                failed_login_attempts: 0,
                locked_until: null,
                session_version: oldVersion + 1,
              },
            ],
          );
          await run(async () =>
            statement(first, update(await person(owner, accountPerson), { is_active: true })),
          );
          assert.deepEqual(
            (
              await owner.query(
                'SELECT is_enabled,session_version FROM user_accounts WHERE id=$1',
                [account],
              )
            ).rows,
            [{ is_enabled: false, session_version: oldVersion + 1 }],
          );
          assert.equal(
            (await owner.query('SELECT can_login FROM people WHERE id=$1', [accountPerson])).rows[0]
              ?.can_login,
            false,
          );
          const actions = (
            await owner.query<{ action: string }>(
              "SELECT action FROM audit_events WHERE id>$1 AND action IN ('archive','restore','account_disabled') ORDER BY id",
              [beforeDisable],
            )
          ).rows.map((r) => r.action);
          assert.deepEqual(actions, ['account_disabled', 'archive', 'restore']);
          pass(
            'D46 deactivation atomically disables account, clears lockout, increments session version; person restoration never enables it',
          );

          const anotherPassword = await hashPassword(randomBytes(36).toString('base64url'));
          await race(
            update(await person(owner, accountPerson), { is_active: false }),
            {
              sql: 'UPDATE user_accounts SET is_enabled=true,password_hash=$1,password_changed_at=statement_timestamp(),must_change_password=true,session_version=session_version+1,failed_login_attempts=0,locked_until=NULL WHERE id=$2',
              values: [anotherPassword, account],
            },
            ['23514'],
          );
          assert.equal(
            (await owner.query('SELECT is_enabled FROM user_accounts WHERE id=$1', [account]))
              .rows[0]?.is_enabled,
            false,
          );
          const createRacePerson = await run(() =>
            create(first, '__TASK40A_ACCOUNT_CREATION_RACE'),
          );
          await race(
            update(await person(owner, createRacePerson), { is_active: false }),
            {
              sql: "SELECT create_user_account_with_actor($1,'Task40aCreationRace',$2,'Lawyer')",
              values: [createRacePerson, anotherPassword],
            },
            ['22023'],
          );
          assert.equal(
            (
              await owner.query(
                'SELECT count(*)::integer n FROM user_accounts WHERE person_id=$1',
                [createRacePerson],
              )
            ).rows[0]?.n,
            0,
          );
          pass(
            'person deactivation versus account enablement or creation preserves account eligibility',
          );

          const actingPerson = await run(() => create(first, '__TASK40A_SECOND_ADMINISTRATOR'));
          const actingAccount = (
            await run(() =>
              first.query<{ id: number }>(
                "SELECT create_user_account_with_actor($1,'Task40aSecondAdmin',$2,'Administrator') id",
                [actingPerson, anotherPassword],
              ),
            )
          ).rows[0]!.id;
          await rejected(
            () =>
              run(async () =>
                statement(first, update(await person(owner, original), { is_active: false })),
              ),
            ['42501'],
            'self-deactivation with another usable Administrator',
          );
          const actorTarget = await person(owner, a);
          await race(
            {
              sql: "UPDATE user_accounts SET role_code='Lawyer',session_version=session_version+1 WHERE id=$1",
              values: [actingAccount],
            },
            update(actorTarget, { name_en: '__TASK40A_STALE_ADMIN_WRITE' }),
            ['42501'],
            'READ COMMITTED',
            actingAccount,
          );
          assert.equal((await person(owner, a)).name_en, actorTarget.name_en);
          await rejected(
            () =>
              run(() =>
                first.query(
                  "UPDATE user_accounts SET role_code='Lawyer',session_version=session_version+1 WHERE id=$1",
                  [administrator.id],
                ),
              ),
            ['42501'],
            'Administrator self-demotion',
          );
          assert.equal(
            (
              await owner.query(
                'SELECT count(*)::integer n FROM user_accounts WHERE user_account_is_usable_administrator(id)',
              )
            ).rows[0]?.n,
            1,
          );
          await owner.query('BEGIN');
          try {
            await owner.query('SELECT audit_set_migration_context()');
            await owner.query(
              "SELECT audit_set_event_context($1::uuid,$2::uuid,$3::uuid,NULL,'Task40a last Administrator fixture','system')",
              [randomUUID(), randomUUID(), randomUUID()],
            );
            await rejected(
              () =>
                owner.query(
                  "UPDATE user_accounts SET role_code='Lawyer',session_version=session_version+1 WHERE id=$1",
                  [administrator.id],
                ),
              ['23514'],
              'last usable Administrator maintenance demotion',
            );
          } finally {
            await owner.query('ROLLBACK');
          }
          pass(
            'in-flight Administrator demotion invalidates its roster write; self and last-Administrator rules survive concurrency',
          );

          // Deliberately refuse one structural event inside a rollback-only fixture.
          const beforeFailure = await state(owner);
          await owner.query(`CREATE FUNCTION public.task40a_refuse_roster_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_table='person_name_alias' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER task40a_refuse_roster_event BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.task40a_refuse_roster_event()`);
          try {
            await rejected(
              () =>
                run(async () =>
                  statement(
                    first,
                    rename(await person(owner, a), '__TASK40A_FAILED_ATOMIC_RENAME'),
                  ),
                ),
              ['P0001'],
              'late structural event failure',
            );
            assert.deepEqual(await state(owner), beforeFailure);
          } finally {
            await owner.query(
              'DROP TRIGGER task40a_refuse_roster_event ON audit_events; DROP FUNCTION public.task40a_refuse_roster_event()',
            );
          }
          pass(
            'late audit failure rolls back canonical spelling, aliases, metadata and all events atomically',
          );

          for (const mutation of [
            'ALTER TABLE people DISABLE TRIGGER aa_staff_roster_lock',
            'ALTER TABLE person_name_alias DISABLE TRIGGER staff_alias_primary_complete',
            'ALTER TABLE _migration.staff_roster_person DISABLE TRIGGER staff_evidence_no_change',
            'GRANT SELECT ON _migration.staff_roster_boundary TO litigation_runtime',
            'DROP INDEX people_email_normalized_unique',
            'ALTER TABLE people DROP CONSTRAINT people_row_version_check; ALTER TABLE people ADD CONSTRAINT people_row_version_check CHECK(row_version>=0)',
          ]) {
            await owner.query('BEGIN');
            try {
              await owner.query(mutation);
              await assert.rejects(() => assertStaffGuards(owner));
            } finally {
              await owner.query('ROLLBACK');
            }
          }
          await owner.query('BEGIN');
          try {
            await owner.query(
              'ALTER FUNCTION public.staff_create_person(text,text,text,boolean,smallint) SECURITY INVOKER',
            );
            await assert.rejects(() => assertStaffFunctions(owner));
          } finally {
            await owner.query('ROLLBACK');
          }
          pass(
            'permanent catalog checks reject disabled collision/primary/immutable guards and broadened privileges',
          );
          await run(async () => {
            await first.query("SET LOCAL TIME ZONE 'Africa/Cairo'");
            await statement(
              first,
              update(await person(first, a), { name_en: '__TASK40A_CAIRO_SESSION' }),
            );
          });
          await assertStaffBoundary(owner, profile);
          pass(
            'Cairo-session mutation retains timezone-independent full-row and audit-event continuity',
          );
          await assertStaffBoundary(owner, profile);
          pass(
            'all permanent staff identity, source, audit and continuity invariants pass after legitimate edits and failed attacks',
          );
          return assertions;
        }),
      );
    },
    { databaseUrl: migrationUrl },
  );
}
