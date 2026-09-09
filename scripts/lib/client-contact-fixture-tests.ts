import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import { withApprovedMigrationClient, withRestrictedRuntimeClient } from './migration-principal';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { assertClientContactBoundary } from './client-contact-checkpoint';
import { staffReadOnlyState } from './staff-read-only-state';

async function human(db: ClientBase, account: number) {
  await db.query('SELECT audit_set_human_context($1)', [account]);
  await db.query(
    "SELECT audit_set_event_context($1::uuid,$2::uuid,$3::uuid,NULL,'Task41 isolated fixture','system')",
    [randomUUID(), randomUUID(), randomUUID()],
  );
}
async function transaction<T>(
  db: ClientBase,
  account: number,
  work: () => Promise<T>,
  isolation = 'READ COMMITTED',
) {
  assert.ok(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'].includes(isolation));
  await db.query('BEGIN ISOLATION LEVEL ' + isolation);
  try {
    await human(db, account);
    const result = await work();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
async function rejected(work: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(
    work,
    (error: unknown) => error instanceof Error && pattern.test(error.message),
  );
}
/** Synthetic operations only, after an exact separate-cluster identity check.
 * Historical imports may be deliberately edited on this disposable copy. */
export async function proveClientContactMutations(
  migrationUrl: string,
  runtimeUrl: string,
  environment: NodeJS.ProcessEnv,
  profile: string,
) {
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(migrationUrl), environment),
    { databaseUrl: migrationUrl },
  );

  return withApprovedMigrationClient(
    (owner) =>
      withRestrictedRuntimeClient(runtimeUrl, (first) =>
        withRestrictedRuntimeClient(runtimeUrl, async (second) => {
          let groups = 0;
          const pass = (label: string) => {
            groups++;
            console.log('PASS client/contact: ' + label);
          };
          const accounts = (
            await owner.query('SELECT id,role_code FROM user_accounts WHERE id IN (1,2,3,4)')
          ).rows;
          const actor = (role: string) => {
            const rows = accounts.filter((a) => a.role_code === role);
            assert.equal(rows.length, 1);
            return rows[0].id as number;
          };
          const admin = actor('Administrator'),
            assistant = actor('Litigation Assistant');
          const run = <T>(work: () => Promise<T>, account = admin) =>
            transaction(first, account, work);
          const row = async (table: string, id: number) =>
            (await owner.query(`SELECT * FROM public.${table} WHERE id=$1`, [id])).rows[0];
          const create = async (
            db: ClientBase,
            table: string,
            parent: number | null,
            values: object,
            submission = randomUUID(),
          ) =>
            (
              await db.query('SELECT client_contact_create($1,$2,$3,$4::jsonb) id', [
                table,
                parent,
                submission,
                JSON.stringify(values),
              ])
            ).rows[0].id as number;
          const update = async (
            db: ClientBase,
            table: string,
            id: number,
            patch: object,
            version?: string,
          ) =>
            (
              await db.query('SELECT client_contact_update($1,$2,$3,$4::jsonb) version', [
                table,
                id,
                version ?? (await row(table, id)).row_version,
                JSON.stringify(patch),
              ])
            ).rows[0].version;
          const archive = async (
            db: ClientBase,
            table: string,
            id: number,
            value: boolean,
            version?: string,
          ) =>
            (
              await db.query('SELECT client_contact_set_archived($1,$2,$3,$4) version', [
                table,
                id,
                version ?? (await row(table, id)).row_version,
                value,
              ])
            ).rows[0].version;
          const state = () => staffReadOnlyState(owner);
          const secondPid = (await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
          const blocked = async () => {
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
              if (
                (
                  await owner.query('SELECT cardinality(pg_blocking_pids($1))>0 blocked', [
                    secondPid,
                  ])
                ).rows[0].blocked
              )
                return;
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            throw new Error('Competing transaction did not reach the expected database lock');
          };
          const unchanged = async (work: () => Promise<unknown>) => {
            const before = await state();
            await work();
            assert.deepEqual(
              await state(),
              before,
              'No-op/denial/retry must preserve rows, versions, events and sequence state',
            );
          };
          const submission = randomUUID();
          const a = await run(() =>
            create(first, 'clients', null, { name_ar: '__TASK41_DUPLICATE_JTI' }, submission),
          );
          const b = await run(
            () => create(first, 'clients', null, { name_ar: '__TASK41_DUPLICATE_JTI' }),
            assistant,
          );
          assert.notEqual(a, b);
          assert.equal((await row('clients', a)).legacy_id, null);
          assert.equal((await row('clients', a)).is_application_native, true);
          pass(
            'native Latin/duplicate client identities; Administrator and Assistant create; no invented Access ID',
          );
          await unchanged(async () =>
            assert.equal(
              await run(() =>
                create(first, 'clients', null, { name_ar: '__TASK41_DUPLICATE_JTI' }, submission),
              ),
              a,
            ),
          );
          await unchanged(() =>
            rejected(
              () =>
                run(() =>
                  create(first, 'clients', null, { name_ar: '__TASK41_CONFLICT' }, submission),
                ),
              /conflicting input/u,
            ),
          );
          const separateActor = await run(
            () => create(first, 'clients', null, { name_ar: '__TASK41_DUPLICATE_JTI' }, submission),
            assistant,
          );
          assert.notEqual(separateActor, a);
          pass(
            'same-submission replay preserves identity/events; conflicting payload refused; actor scope independent',
          );
          const c = await run(() =>
            create(first, 'contacts', a, {
              contact_name: '__TASK41_CONTACT',
              email: 'shared@example.invalid',
            }),
          );
          const d = await run(
            () =>
              create(first, 'contacts', a, {
                contact_name: '__TASK41_CONTACT',
                email: 'shared@example.invalid',
              }),
            assistant,
          );
          pass('duplicate contact names/emails allowed; same-client native ownership established');
          for (const role of ['Lawyer', 'Paralegal']) {
            await unchanged(() =>
              rejected(
                () =>
                  run(
                    () => create(first, 'clients', null, { name_ar: '__TASK41_DENIED' }),
                    actor(role),
                  ),
                /authorized human/u,
              ),
            );
            await unchanged(() =>
              rejected(
                () =>
                  run(
                    () => update(first, 'clients', a, { name_ar: '__TASK41_DENIED' }),
                    actor(role),
                  ),
                /authorized human/u,
              ),
            );
            await unchanged(() =>
              rejected(
                () => run(() => archive(first, 'clients', a, true), actor(role)),
                /authorized human/u,
              ),
            );
          }
          for (const table of ['clients', 'contacts'])
            await unchanged(() =>
              rejected(
                () =>
                  run(() => archive(first, table, table === 'clients' ? a : c, true), assistant),
                /authorized human/u,
              ),
            );
          pass('view-only roles denied all mutations; Assistant denied archive/restore');
          for (const sql of [
            `UPDATE clients SET name_ar='__TASK41_FORGED' WHERE id=${a}`,
            `INSERT INTO clients(name_ar,updated_at) VALUES('__TASK41_DIRECT',now())`,
            `DELETE FROM contacts WHERE id=${c}`,
            'TRUNCATE clients',
            "SELECT nextval('clients_id_seq')",
            'SELECT * FROM _migration.client_contact_client_import',
          ])
            await rejected(() => run(() => first.query(sql)), /permission denied/u);
          pass('direct runtime DML, sequence and private import evidence access denied');
          await unchanged(() =>
            run(() => update(first, 'clients', a, { name_ar: '__TASK41_DUPLICATE_JTI' })),
          );
          await unchanged(() => run(() => update(first, 'contacts', c, {})));
          const old = (await row('clients', a)).row_version;
          await run(
            () =>
              update(first, 'clients', a, { name_en: '__TASK41_CHANGED', cash_or_probono: 'Cash' }),
            assistant,
          );
          assert.equal(BigInt((await row('clients', a)).row_version), BigInt(old) + 1n);
          await unchanged(() =>
            rejected(() => run(() => update(first, 'clients', a, {}, old)), /stale/u),
          );
          await unchanged(() =>
            rejected(() => run(() => archive(first, 'clients', a, true, old)), /stale/u),
          );
          pass(
            'database version increments once; no-op untouched; stale edits and lifecycle refused',
          );
          for (const patch of [
            { legacy_id: 999 },
            { is_application_native: false },
            { row_version: 500 },
            { application_modified_by: 1001 },
            { legacy_contact_lawyer_raw: '__TASK41_FORGED' },
            { branch_id: 1 },
          ])
            await rejected(() => run(() => update(first, 'clients', a, patch)), /Unsupported/u);
          await rejected(
            () => run(() => update(first, 'contacts', c, { client_id: b })),
            /Unsupported/u,
          );
          await rejected(
            () => run(() => create(first, 'contacts', a, { full_name: '__TASK41_NOT_A_NAME' })),
            /name.*required/iu,
          );
          pass(
            'identity/provenance/raw/branch/ownership tampering refused; full_name cannot replace required contact_name',
          );
          await rejected(
            () => run(() => update(first, 'clients', b, { contact_person_id: c })),
            /Main contact/u,
          );
          await run(() => update(first, 'clients', a, { contact_person_id: c }));
          await rejected(() => run(() => archive(first, 'contacts', c, true)), /clear or replace/u);
          await run(() => update(first, 'clients', a, { contact_person_id: d }));
          await run(() => archive(first, 'contacts', c, true));
          await rejected(
            () => run(() => update(first, 'clients', a, { contact_person_id: c })),
            /Main contact/u,
          );
          pass(
            'same-client main contact; selected contact archive refused until explicit replacement',
          );
          await run(() => archive(first, 'clients', a, true));
          assert.equal((await row('clients', a)).contact_person_id, d);
          assert.equal((await row('contacts', c)).is_archived, true);
          assert.equal((await row('contacts', d)).is_archived, false);
          assert.equal((await row('clients', a)).status, null);
          for (const work of [
            () => create(first, 'contacts', a, { contact_name: '__TASK41_BLOCKED' }),
            () => update(first, 'contacts', d, { job_title: '__TASK41_BLOCKED' }),
            () => archive(first, 'contacts', d, true),
            () => archive(first, 'contacts', c, false),
            () => update(first, 'clients', a, { status: 'Active' }),
          ])
            await rejected(() => run(work), /parent|Restore|restor/iu);
          await run(() => archive(first, 'clients', a, false));
          assert.equal((await row('contacts', c)).is_archived, true);
          assert.equal((await row('clients', a)).contact_person_id, d);
          await run(() => archive(first, 'contacts', c, false));
          pass(
            'non-cascading parent archive/restore; selected contact and child states retained; archived-parent maintenance denied',
          );
          if (profile === 'historical-full-state-upgrade') {
            const imports = (
              await owner.query(
                "SELECT id,cash_or_probono FROM clients WHERE cash_or_probono IN ('probono','') ORDER BY id",
              )
            ).rows;
            assert.equal(imports.length, 7);
            for (const imported of imports) {
              await run(() =>
                update(first, 'clients', imported.id, { poa_location: '__TASK41_TEST_ONLY' }),
              );
              assert.equal(
                (await row('clients', imported.id)).cash_or_probono,
                imported.cash_or_probono,
              );
              await unchanged(() =>
                run(() =>
                  update(first, 'clients', imported.id, {
                    cash_or_probono: imported.cash_or_probono,
                  }),
                ),
              );
            }
            await run(() =>
              update(first, 'clients', imports[0].id, { cash_or_probono: 'Probono' }),
            );
            const unnamed = (
              await owner.query(
                "SELECT id FROM contacts WHERE coalesce(btrim(contact_name),'')='' ORDER BY id",
              )
            ).rows;
            assert.equal(unnamed.length, 6);
            for (const imported of unnamed)
              await run(() =>
                update(first, 'contacts', imported.id, { job_title: '__TASK41_TEST_ONLY' }),
              );
            const sigma = (await owner.query('SELECT id FROM clients WHERE legacy_id=188')).rows;
            assert.deepEqual(sigma, [{ id: 197 }]);
            await rejected(
              () =>
                run(() => update(first, 'clients', 197, { full_name: '__TASK41_FORBIDDEN_SIGMA' })),
              /D39/u,
            );
            pass(
              'all five lowercase/two blank fee classifications preserved; deliberate classification allowed; six unnamed imports editable; D39 protected',
            );
          }
          for (const table of ['clients', 'contacts']) {
            const id = table === 'clients' ? b : c;
            await owner.query(
              "CREATE FUNCTION public.task41_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Task41 injected audit failure'; END $$",
            );
            await owner.query(
              'CREATE TRIGGER task41_test_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION public.task41_test_failure()',
            );
            const before = await state();
            await rejected(
              () =>
                run(() =>
                  update(
                    first,
                    table,
                    id,
                    table === 'clients'
                      ? { name_en: '__TASK41_ROLLBACK' }
                      : { job_title: '__TASK41_ROLLBACK' },
                  ),
                ),
              /Task41 injected audit failure/u,
            );
            const retrySubmission = randomUUID();
            const values =
              table === 'clients'
                ? { name_ar: '__TASK41_CREATE_ROLLBACK' }
                : { contact_name: '__TASK41_CREATE_ROLLBACK' };
            await rejected(
              () =>
                run(() =>
                  create(first, table, table === 'clients' ? null : a, values, retrySubmission),
                ),
              /Task41 injected audit failure/u,
            );
            await rejected(
              () => run(() => archive(first, table, id, true)),
              /Task41 injected audit failure/u,
            );
            assert.deepEqual((await state()).tables, before.tables);
            await owner.query('DROP TRIGGER task41_test_failure ON audit_events');
            await owner.query('DROP FUNCTION public.task41_test_failure()');
            const retried = await run(() =>
              create(first, table, table === 'clients' ? null : a, values, retrySubmission),
            );
            assert.ok(retried > 0);
          }
          pass(
            'audit failure rolls back client/contact create, update, archive and receipts; retry succeeds once after recovery',
          );
          for (const sql of [
            `UPDATE clients SET row_version=row_version+1 WHERE id=${b}`,
            `UPDATE contacts SET client_id=${b} WHERE id=${c}`,
            `UPDATE clients SET legacy_contact_lawyer_raw='__TASK41_TAMPER' WHERE id=${b}`,
            `DELETE FROM contacts WHERE id=${c}`,
          ]) {
            await rejected(
              () => transaction(owner, admin, () => owner.query(sql)),
              /database-owned|physically deleted/u,
            );
          }
          pass(
            'database triggers refuse direct owner identity/version/ownership/raw tampering and deletion',
          );
          await owner.query(
            "CREATE FUNCTION public.task41_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Task41 injected receipt failure'; END $$",
          );
          await owner.query(
            'CREATE TRIGGER task41_receipt_failure BEFORE INSERT ON _migration.client_contact_submission FOR EACH ROW EXECUTE FUNCTION public.task41_receipt_failure()',
          );
          const receiptBefore = await state(),
            receiptId = randomUUID();
          await rejected(
            () =>
              run(() =>
                create(
                  first,
                  'contacts',
                  a,
                  { contact_name: '__TASK41_RECEIPT_ROLLBACK' },
                  receiptId,
                ),
              ),
            /Task41 injected receipt failure/u,
          );
          assert.deepEqual((await state()).tables, receiptBefore.tables);
          await owner.query(
            'DROP TRIGGER task41_receipt_failure ON _migration.client_contact_submission',
          );
          await owner.query('DROP FUNCTION public.task41_receipt_failure()');
          const receiptResult = await run(() =>
            create(first, 'contacts', a, { contact_name: '__TASK41_RECEIPT_ROLLBACK' }, receiptId),
          );
          await unchanged(async () =>
            assert.equal(
              await run(() =>
                create(
                  first,
                  'contacts',
                  a,
                  { contact_name: '__TASK41_RECEIPT_ROLLBACK' },
                  receiptId,
                ),
              ),
              receiptResult,
            ),
          );
          await rejected(
            () =>
              run(() =>
                create(
                  first,
                  'contacts',
                  b,
                  { contact_name: '__TASK41_RECEIPT_ROLLBACK' },
                  receiptId,
                ),
              ),
            /conflicting input/u,
          );
          pass(
            'late receipt failure rolls back record and audit event; retry returns one contact and changed parent is rejected',
          );
          for (const isolation of ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']) {
            const parent = await run(() =>
              create(first, 'clients', null, { name_ar: '__TASK41_RACE_' + isolation }),
            );
            const child = await run(() =>
              create(first, 'contacts', parent, { contact_name: '__TASK41_RACE_CONTACT' }),
            );
            await first.query('BEGIN ISOLATION LEVEL ' + isolation);
            await human(first, admin);
            await update(first, 'clients', parent, { contact_person_id: child });
            const competing = transaction(
              second,
              admin,
              () => archive(second, 'contacts', child, true),
              isolation,
            ).then(
              () => null,
              (error) => error as Error,
            );
            await blocked();
            await first.query('COMMIT');
            const failure = await competing;
            assert.ok(failure && /clear or replace|serialize|deadlock/iu.test(failure.message));
            assert.equal((await row('contacts', child)).is_archived, false);
            await first.query('BEGIN ISOLATION LEVEL ' + isolation);
            await human(first, admin);
            await archive(first, 'clients', parent, true);
            const edit = transaction(
              second,
              admin,
              () => update(second, 'contacts', child, { job_title: '__TASK41_RACE' }),
              isolation,
            ).then(
              () => null,
              (error) => error as Error,
            );
            await blocked();
            await first.query('COMMIT');
            const error = await edit;
            assert.ok(error && /parent|serialize|deadlock/iu.test(error.message));
            await run(() => archive(first, 'clients', parent, false));
            await run(() => update(first, 'clients', parent, { contact_person_id: null }));
            await first.query('BEGIN ISOLATION LEVEL ' + isolation);
            await human(first, admin);
            await archive(first, 'contacts', child, true);
            const select = transaction(
              second,
              admin,
              () => update(second, 'clients', parent, { contact_person_id: child }),
              isolation,
            ).then(
              () => null,
              (error) => error as Error,
            );
            await blocked();
            await first.query('COMMIT');
            const selection = await select;
            assert.ok(selection && /unarchived|serialize|deadlock/iu.test(selection.message));
            assert.equal((await row('clients', parent)).contact_person_id, null);
            await run(() => archive(first, 'contacts', child, false));
            await first.query('BEGIN ISOLATION LEVEL ' + isolation);
            await human(first, admin);
            await update(first, 'contacts', child, { job_title: '__TASK41_EDIT_FIRST' });
            const parentArchive = transaction(
              second,
              admin,
              () => archive(second, 'clients', parent, true),
              isolation,
            ).then(
              () => null,
              (error) => error as Error,
            );
            await blocked();
            await first.query('COMMIT');
            const parentResult = await parentArchive;
            assert.ok(parentResult === null || /serialize|deadlock/iu.test(parentResult.message));
            assert.equal((await row('contacts', child)).job_title, '__TASK41_EDIT_FIRST');
          }
          pass(
            'observed lock contention in both directions for main selection/contact archive and parent archive/contact edit at all three isolation levels',
          );
          const retryId = randomUUID();
          const results = await Promise.all([
            transaction(first, admin, () =>
              create(first, 'clients', null, { name_ar: '__TASK41_RETRY_RACE' }, retryId),
            ),
            transaction(second, admin, () =>
              create(second, 'clients', null, { name_ar: '__TASK41_RETRY_RACE' }, retryId),
            ),
          ]);
          assert.equal(results[0], results[1]);
          assert.equal(
            (await owner.query('SELECT count(*)::integer n FROM clients WHERE id=$1', [results[0]]))
              .rows[0].n,
            1,
          );
          pass('concurrent identical creation submissions produce one identity and receipt');
          await assertClientContactBoundary(owner, profile);
          pass(
            'complete client/contact historical and operational invariants after real mutations',
          );
          return groups;
        }),
      ),
    { databaseUrl: migrationUrl },
  );
}
