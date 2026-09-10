import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, join } from 'node:path';
import type { Session } from 'next-auth';
import type { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { changeManagedRole, disableManagedAccount } from '../src/lib/auth/user-management';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { assertCurrentClientSource } from './lib/client-regression-source';
import { assertClientContactBoundary } from './lib/client-contact-checkpoint';
import { initialiseActors } from './test-client-contacts';
import { createDatabaseClient } from '../src/lib/db';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import { mutateClient, readClientMutation } from '../src/lib/client-mutations';
import {
  CLIENT_OPERATIONS,
  CONTACT_FIELDS,
  ClientMutationError,
  parseClientMutationForm,
  mutationVersion,
  type ClientOperation,
} from '../src/lib/client-mutation-input';

async function main() {
  const output = process.env.CLIENT_MUTATION_EVIDENCE_DIR;
  assert.ok(output && isAbsolute(output), 'Explicit external evidence directory required');
  assert.ok(
    relative(process.cwd(), resolve(output)).startsWith('..') ||
      isAbsolute(relative(process.cwd(), resolve(output))),
    'Evidence must be outside repository',
  );
  mkdirSync(output, { recursive: true });
  const before = await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
  let groups = 0;
  const pass = (name: string) => {
    groups++;
    console.log('PASS client service: ' + name);
  };
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
      withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
    await inspect(async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      assert.equal(await assertCurrentClientSource(db), 62);
      assert.deepEqual(
        (await staffReadOnlyState(db)).tables,
        before.tables,
        'full restored tables must equal the preserved source',
      );
      assert.ok(
        before.tables.find((table) => table.schema === 'public' && table.table === 'hearings')!
          .count >= 13279,
      );
    });
    const manifest = {
      container: fixture.container,
      cluster: fixture.clusterId,
      sourceCluster: fixture.sourceClusterId,
      port: new URL(fixture.runtimeUrl).port,
      principal: new URL(fixture.runtimeUrl).username,
      migrations: 62,
      cleaned: false,
    };
    writeFileSync(join(output, 'service-isolation.json'), JSON.stringify(manifest, null, 2));
    await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
    const runtime = createDatabaseClient(fixture.runtimeUrl);
    try {
      const accounts = await runtime.userAccount.findMany({
        select: { id: true, personId: true, username: true, roleCode: true, sessionVersion: true },
      });
      const session = (role: string): Session => {
        const matches = accounts.filter((a) => a.roleCode === role);
        assert.equal(matches.length, 1);
        const account = matches[0]!;
        return {
          expires: new Date(Date.now() + 3600000).toISOString(),
          user: {
            id: String(account.id),
            personId: account.personId,
            username: account.username,
            name: 'TEST ONLY',
            role: account.roleCode,
            mustChangePassword: false,
            sessionVersion: account.sessionVersion,
            auditSessionId: randomUUID(),
          },
        } as Session;
      };
      const admin = session('Administrator'),
        assistant = session('Litigation Assistant');
      const run = (
        operation: ClientOperation,
        input: unknown,
        actor: Session | null = admin,
        database = runtime,
      ) =>
        mutateClient(actor, operation, input, {
          database,
          auditMetadata: createMaintenanceAuditMetadata(),
        });
      const read = (
        op: ClientOperation,
        id: number | null,
        parent: number | null = null,
        actor: Session | null = admin,
      ) =>
        readClientMutation(
          actor,
          op,
          id === null ? null : String(id),
          parent === null ? null : String(parent),
          runtime,
        );
      const target = async (op: ClientOperation, id: number, parent: number | null = null) => ({
        id: String(id),
        version: (await read(op, id, parent)).record!.version,
        ...(parent === null ? {} : { clientId: String(parent) }),
      });
      const create = async (name = '__PHASE3_TEST_ONLY', actor = admin) =>
        (await run('client-create', { submission: randomUUID(), name_ar: name }, actor)).id;
      const contact = async (parent: number, name = '__PHASE3_CONTACT_ONLY') =>
        (
          await run('contact-create', {
            submission: randomUUID(),
            clientId: String(parent),
            contact_name: name,
          })
        ).id;
      const reject = (work: () => Promise<unknown>, code: string) =>
        assert.rejects(work, (e) => e instanceof ClientMutationError && e.code === code);
      const state = () =>
        inspect(async (db) => {
          const result = await staffReadOnlyState(db);
          const definitions = (
            await db.query(
              'SELECT schemaname,sequencename,sequenceowner,data_type,start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text FROM pg_sequences ORDER BY schemaname,sequencename',
            )
          ).rows;
          const sequences = [];
          for (const definition of definitions) {
            const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
            const value = (
              await db.query(
                `SELECT last_value::text,is_called,log_cnt::text FROM ${quote(definition.schemaname)}.${quote(definition.sequencename)}`,
              )
            ).rows[0];
            sequences.push({ ...definition, ...value });
          }
          return { ...result, sequences };
        });
      const unchanged = async (work: () => Promise<unknown>) => {
        const original = await state();
        await work();
        assert.deepEqual(
          await state(),
          original,
          'no-op/denied operation changed complete values, versions, audit, catalogs or sequence state',
        );
      };
      const row = async (table: 'clients' | 'contacts', id: number) =>
        inspect(
          async (db) => (await db.query(`SELECT * FROM public.${table} WHERE id=$1`, [id])).rows[0],
        );
      const parent = await create('__PHASE3_JTI_DUPLICATE');
      const duplicate = await create('__PHASE3_JTI_DUPLICATE', assistant);
      assert.notEqual(parent, duplicate);
      const child = await contact(parent);
      const sameName = await contact(parent);
      assert.notEqual(child, sameName);
      const clientSnapshot = await read('client-update', parent);
      assert.equal(clientSnapshot.record!.values.status, null);
      assert.equal(clientSnapshot.record!.values.cash_or_probono, null);
      assert.equal((await row('clients', parent)).legacy_id, null);
      assert.equal((await row('contacts', child)).legacy_id, null);
      pass(
        'full-volume current-62 isolated copy; both allowed roles; duplicate/non-Arabic names; native IDs and no forced defaults',
      );

      for (const role of ['Lawyer', 'Paralegal'])
        for (const op of CLIENT_OPERATIONS) {
          await assert.rejects(() => run(op, {}, session(role)), AuthorizationError);
          await assert.rejects(() => read(op, null, null, session(role)), AuthorizationError);
        }
      for (const op of CLIENT_OPERATIONS.filter((op) => /archive|restore/u.test(op))) {
        await assert.rejects(() => run(op, {}, assistant), AuthorizationError);
        await assert.rejects(() => read(op, null, null, assistant), AuthorizationError);
      }
      for (const actor of [
        null,
        { ...admin, user: { ...admin.user, role: 'Unknown' } },
        { ...admin, user: { ...admin.user, mustChangePassword: true } },
      ] as (Session | null)[]) {
        await assert.rejects(() => run('client-create', {}, actor), AuthorizationError);
        await assert.rejects(() => read('client-create', null, null, actor), AuthorizationError);
      }
      pass(
        'independent service/form-read denial for every role and lifecycle operation, unauthenticated/unknown/forced-password sessions',
      );

      const base = await target('client-update', parent);
      for (const forbidden of [
        'actorId',
        'role',
        'auditContext',
        'table',
        'legacy_id',
        'is_archived',
        'row_version',
        'application_modified_at',
        'branch_id',
        'legacy_contact_lawyer_raw',
        'returnTo',
        '__proto__',
      ]) {
        await reject(() => run('client-update', { ...base, [forbidden]: 'forged' }), 'invalid');
      }
      for (const forbidden of ['client_id', 'home_phone', 'legacy_id', 'created_by'])
        await reject(
          () =>
            run('contact-update', {
              ...{ id: String(child), version: '1', clientId: String(parent) },
              [forbidden]: 'forged',
            }),
          'invalid',
        );
      for (const invalid of [null, 42, true, [], {}, new Blob(['x'])])
        await reject(() => run('client-update', { ...base, name_ar: invalid }), 'invalid');
      for (const value of ['0', '-1', '1.5', '2147483648', '1e2', ' 1'])
        await reject(() => run('client-update', { ...base, id: value }), 'invalid');
      assert.equal(mutationVersion('9007199254740993'), '9007199254740993');
      for (const version of ['0', '9223372036854775808', '1e2', 1])
        assert.throws(() => mutationVersion(version), ClientMutationError);
      const form = new FormData();
      form.set('id', base.id);
      form.set('version', base.version);
      form.append('id', base.id);
      assert.throws(() => parseClientMutationForm('client-update', form), ClientMutationError);
      form.delete('id');
      form.set('id', new Blob(['x']));
      assert.throws(() => parseClientMutationForm('client-update', form), ClientMutationError);
      form.set('id', base.id);
      form.set('returnTo', 'https://example.invalid');
      assert.throws(() => parseClientMutationForm('client-update', form), ClientMutationError);
      await reject(() => run('client-update', { ...base, name_ar: 'x'.repeat(2049) }), 'invalid');
      await reject(() => run('client-update', { ...base, name_ar: '  \n ' }), 'required');
      for (const date of ['2026-02-29', '2026-13-01', '2026-01-01T00:00:00Z', '0000-01-01'])
        await reject(() => run('client-update', { ...base, client_start: date }), 'invalid');
      for (const [field, value] of [
        ['status', 'active'],
        ['cash_or_probono', 'probono'],
      ])
        await reject(() => run('client-update', { ...base, [field!]: value }), 'invalid');
      pass(
        'exact whitelists, repeated/File/unknown form rejection, typed IDs, lossless bigint versions, bounded text and date-only/choice validation',
      );

      await unchanged(() => run('client-update', base));
      const allContactFields = Object.fromEntries(
        CONTACT_FIELDS.map((field) => [field, `__PHASE3_${field}\nSECOND LINE`]),
      );
      await run('contact-update', {
        ...(await target('contact-update', child, parent)),
        ...allContactFields,
      });
      const contactChanged = await row('contacts', child);
      for (const [field, value] of Object.entries(allContactFields))
        assert.equal(contactChanged[field], value);
      await unchanged(async () =>
        run('contact-update', {
          ...(await target('contact-update', child, parent)),
          ...allContactFields,
        }),
      );
      const meta = createMaintenanceAuditMetadata();
      await mutateClient(
        assistant,
        'client-update',
        {
          ...base,
          full_name: '__PHASE3_FULL\nSECOND LINE',
          status: 'Potential',
          cash_or_probono: 'Probono',
          client_start: '2024-02-29',
          client_end: '2026-09-10',
        },
        { database: runtime, auditMetadata: meta },
      );
      const changed = await row('clients', parent);
      assert.equal(changed.row_version, '2');
      assert.equal(changed.full_name, '__PHASE3_FULL\nSECOND LINE');
      const updated = await read('client-update', parent);
      assert.equal(updated.record!.values.client_start, '2024-02-29');
      assert.equal(updated.record!.values.client_end, '2026-09-10');
      const events = await inspect(
        async (db) =>
          (
            await db.query(
              'SELECT e.*,a.user_account_id FROM audit_events e JOIN audit_actors a ON a.id=e.actor_id WHERE e.request_id=$1',
              [meta.requestId],
            )
          ).rows,
      );
      assert.equal(events.length, 1);
      assert.equal(events[0].entity_table, 'clients');
      assert.equal(events[0].user_account_id, Number(assistant.user.id));
      assert.equal(events[0].correlation_id, meta.correlationId);
      assert.equal(events[0].audit_session_id, meta.auditSessionId);
      assert.equal(events[0].after_values.full_name, changed.full_name);
      await unchanged(() =>
        run('client-update', {
          ...base,
          version: '2',
          full_name: changed.full_name,
          status: 'Potential',
          cash_or_probono: 'Probono',
          client_start: '2024-02-29',
          client_end: '2026-09-10',
        }),
      );
      await reject(() => run('client-update', { ...base, full_name: '__STALE' }), 'stale');
      pass(
        'real atomic actor/request/session audit; multiline and leap-day/date preservation; no-op full-state equality; stale original-version rejection',
      );

      const imported = await inspect(
        async (db) =>
          (
            await db.query(
              "SELECT id,cash_or_probono,status FROM clients WHERE legacy_id IS NOT NULL AND id<>197 AND cash_or_probono='probono' ORDER BY id LIMIT 1",
            )
          ).rows,
      );
      assert.equal(imported.length, 1);
      const originalImport = await row('clients', imported[0].id);
      await run('client-update', {
        ...(await target('client-update', imported[0].id)),
        poa_location: '__PHASE3_IMPORT_EDIT',
      });
      const importAfter = await row('clients', imported[0].id);
      for (const field of Object.keys(originalImport).filter(
        (key) =>
          key.startsWith('legacy_') || ['cash_or_probono', 'status', 'branch_id'].includes(key),
      ))
        assert.deepEqual(importAfter[field], originalImport[field]);
      const unnamed = await inspect(
        async (db) =>
          (
            await db.query(
              "SELECT id,client_id FROM contacts WHERE legacy_id IS NOT NULL AND coalesce(btrim(contact_name),'')='' ORDER BY id",
            )
          ).rows,
      );
      assert.equal(unnamed.length, 6);
      for (const entry of unnamed) {
        const original = await row('contacts', entry.id);
        await run('contact-update', {
          ...(await target('contact-update', entry.id, entry.client_id)),
          job_title: '__PHASE3_UNNAMED_EDIT',
        });
        const after = await row('contacts', entry.id);
        for (const field of ['contact_name', 'full_name', 'home_phone', 'client_id', 'legacy_id'])
          assert.deepEqual(after[field], original[field]);
      }
      const sigma = await target('client-update', 197);
      for (const field of ['name_ar', 'name_en', 'full_name'])
        await reject(
          () => run('client-update', { ...sigma, [field]: '__PHASE3_SIGMA_FORGERY' }),
          'sigma',
        );
      await run('client-update', { ...sigma, documents_location: '__PHASE3_SIGMA_OTHER' });
      pass(
        'legacy lower-case classification and raw/import ownership preserved; all six unnamed contacts edited without fabricated names; Sigma fixed names and permitted other fields',
      );

      const submission = randomUUID(),
        payload = { submission, name_ar: '__PHASE3_RETRY' };
      const first = await run('client-create', payload);
      assert.notEqual(
        (await run('client-create', payload, assistant)).id,
        first.id,
        'submission keys are scoped to the trusted actor',
      );
      await run('contact-create', {
        submission,
        clientId: String(parent),
        contact_name: '__PHASE3_ENTITY_KEY',
      });
      await unchanged(async () => assert.equal((await run('client-create', payload)).id, first.id));
      await reject(
        () => run('client-create', { ...payload, full_name: 'different' }),
        'submission',
      );
      assert.notEqual(
        (await run('client-create', { ...payload, submission: randomUUID() })).id,
        first.id,
      );
      const contactSubmission = {
        submission: randomUUID(),
        clientId: String(parent),
        contact_name: '__PHASE3_PARENT_KEY',
      };
      const firstContact = await run('contact-create', contactSubmission);
      await unchanged(async () =>
        assert.equal((await run('contact-create', contactSubmission)).id, firstContact.id),
      );
      await reject(
        () => run('contact-create', { ...contactSubmission, clientId: String(duplicate) }),
        'submission',
      );
      const concurrent = { submission: randomUUID(), name_ar: '__PHASE3_CONCURRENT_KEY' };
      const pair = await Promise.all([
        run('client-create', concurrent),
        run('client-create', concurrent),
      ]);
      assert.equal(pair[0].id, pair[1].id);
      const competing = await target('client-update', first.id);
      const writes = await Promise.allSettled([
        run('client-update', { ...competing, name_en: '__FIRST' }),
        run('client-update', { ...competing, name_en: '__SECOND' }),
      ]);
      assert.equal(writes.filter((r) => r.status === 'fulfilled').length, 1);
      assert.ok(
        writes.some(
          (r) =>
            r.status === 'rejected' &&
            r.reason instanceof ClientMutationError &&
            r.reason.code === 'stale',
        ),
      );
      pass(
        'same-key retry and simultaneous creation produce one identity/event; changed payload/parent reject; fresh duplicate allowed; simultaneous edits cannot overwrite',
      );

      await reject(
        async () =>
          run('contact-update', {
            ...(await target('contact-update', child, parent)),
            clientId: String(duplicate),
            job_title: 'forged',
          }),
        'not-found',
      );
      await run('client-update', {
        ...(await target('client-update', parent)),
        contact_person_id: String(child),
      });
      await reject(
        async () =>
          run('contact-archive', {
            ...(await target('contact-archive', child, parent)),
            confirmation: String(child),
          }),
        'main-contact',
      );
      await run('client-update', {
        ...(await target('client-update', parent)),
        contact_person_id: '',
      });
      await run('contact-archive', {
        ...(await target('contact-archive', child, parent)),
        confirmation: String(child),
      });
      await reject(
        async () =>
          run('client-update', {
            ...(await target('client-update', parent)),
            contact_person_id: String(child),
          }),
        'main-contact',
      );
      await reject(
        async () =>
          run('client-update', {
            ...(await target('client-update', duplicate)),
            contact_person_id: String(sameName),
          }),
        'main-contact',
      );
      await run('client-update', {
        ...(await target('client-update', parent)),
        contact_person_id: String(sameName),
      });
      const childrenBefore = await inspect(
        async (db) =>
          (
            await db.query('SELECT id,is_archived FROM contacts WHERE client_id=$1 ORDER BY id', [
              parent,
            ])
          ).rows,
      );
      await run('client-archive', {
        ...(await target('client-archive', parent)),
        confirmation: String(parent),
      });
      await unchanged(async () =>
        run('client-archive', {
          ...(await target('client-archive', parent)),
          confirmation: String(parent),
        }),
      );
      assert.equal((await row('clients', parent)).contact_person_id, sameName);
      for (const op of [
        'contact-create',
        'contact-update',
        'contact-archive',
        'contact-restore',
      ] as const) {
        const input =
          op === 'contact-create'
            ? contactSubmission
            : { ...(await target(op, child, parent)), confirmation: String(child) };
        if (op === 'contact-update') delete (input as Record<string, string>).confirmation;
        await reject(() => run(op, input), 'parent-archived');
      }
      await reject(
        async () =>
          run('client-update', {
            ...(await target('client-update', parent)),
            name_en: '__ARCHIVED_EDIT',
          }),
        'archived',
      );
      await run('client-restore', {
        ...(await target('client-restore', parent)),
        confirmation: String(parent),
      });
      assert.deepEqual(
        await inspect(
          async (db) =>
            (
              await db.query('SELECT id,is_archived FROM contacts WHERE client_id=$1 ORDER BY id', [
                parent,
              ])
            ).rows,
        ),
        childrenBefore,
      );
      await run('contact-restore', {
        ...(await target('contact-restore', child, parent)),
        confirmation: String(child),
      });
      pass(
        'immutable nesting; explicit main-contact clear/replace; no cross-parent or archived selection; non-cascading archive/restore and every archived-parent operation blocked',
      );

      // Hold the first real gateway transaction open, observe actual competing
      // PostgreSQL lock wait, then release it. No timing-only race assumption.
      const heldRace = async (
        firstOp: ClientOperation,
        firstInput: unknown,
        secondOp: ClientOperation,
        secondInput: unknown,
      ) => {
        let reached!: () => void, release!: () => void;
        const paused = new Promise<void>((done) => {
            reached = done;
          }),
          resume = new Promise<void>((done) => {
            release = done;
          });
        let held = false;
        const delayed = {
          $transaction: (
            work: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options: unknown,
          ) =>
            runtime.$transaction(
              async (tx) =>
                work(
                  new Proxy(tx, {
                    get(target, key, receiver) {
                      if (key !== '$queryRaw') return Reflect.get(target, key, receiver);
                      return async (sql: Prisma.Sql) => {
                        const result = await target.$queryRaw(sql);
                        if (!held && sql.sql.includes('SELECT public.client_contact_')) {
                          held = true;
                          reached();
                          await resume;
                        }
                        return result;
                      };
                    },
                  }),
                ),
              options as never,
            ),
        } as unknown as PrismaClient;
        const first = run(firstOp, firstInput, admin, delayed).then(
          (result) => ({ result }),
          (error: unknown) => ({ error }),
        );
        await Promise.race([
          paused,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('gateway not reached')), 5000),
          ),
        ]);
        const second = run(secondOp, secondInput).then(
          (result) => ({ result }),
          (error: unknown) => ({ error }),
        );
        try {
          let waiting = false;
          for (let attempt = 0; attempt < 50; attempt++) {
            waiting = await inspect(
              async (db) =>
                (
                  await db.query(
                    "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename='litigation_runtime' AND wait_event_type='Lock') waiting",
                  )
                ).rows[0].waiting,
            );
            if (waiting) break;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          assert.ok(waiting, 'competing service must reach a real PostgreSQL lock wait');
        } finally {
          release();
        }
        const results = await Promise.all([first, second]);
        assert.ok('result' in results[0]!);
        return results[1]!;
      };
      for (const reverse of [false, true]) {
        const raceParent = await create('__PHASE3_RELATION_RACE'),
          raceChild = await contact(raceParent);
        const select = {
          ...(await target('client-update', raceParent)),
          contact_person_id: String(raceChild),
        };
        const archive = {
          ...(await target('contact-archive', raceChild, raceParent)),
          confirmation: String(raceChild),
        };
        const result = reverse
          ? await heldRace('contact-archive', archive, 'client-update', select)
          : await heldRace('client-update', select, 'contact-archive', archive);
        assert.ok('error' in result);
        const persistedParent = await row('clients', raceParent),
          persistedChild = await row('contacts', raceChild);
        assert.ok(!(persistedParent.contact_person_id === raceChild && persistedChild.is_archived));
        const archiveParent = {
          ...(await target('client-archive', raceParent)),
          confirmation: String(raceParent),
        };
        const editChild = {
          ...(await target('contact-update', raceChild, raceParent)),
          job_title: '__PHASE3_EDIT_BEFORE_ARCHIVE',
        };
        if (reverse) {
          await run('contact-restore', {
            ...(await target('contact-restore', raceChild, raceParent)),
            confirmation: String(raceChild),
          });
          editChild.version = (await target('contact-update', raceChild, raceParent)).version;
        }
        const parentResult = reverse
          ? await heldRace('contact-update', editChild, 'client-archive', archiveParent)
          : await heldRace('client-archive', archiveParent, 'contact-update', editChild);
        if (!reverse) assert.ok('error' in parentResult);
        else assert.equal((await row('contacts', raceChild)).job_title, editChild.job_title);
      }
      for (const operation of ['contact-create', 'contact-archive', 'contact-restore'] as const) {
        for (const reverse of [false, true]) {
          const raceParent = await create('__PHASE3_PARENT_LIFECYCLE_RACE');
          const raceChild = await contact(raceParent);
          if (operation === 'contact-restore')
            await run('contact-archive', {
              ...(await target('contact-archive', raceChild, raceParent)),
              confirmation: String(raceChild),
            });
          const input =
            operation === 'contact-create'
              ? {
                  clientId: String(raceParent),
                  submission: randomUUID(),
                  contact_name: '__PHASE3_RACING_CREATION',
                }
              : {
                  ...(await target(operation, raceChild, raceParent)),
                  confirmation: String(raceChild),
                };
          const archiveParent = {
            ...(await target('client-archive', raceParent)),
            confirmation: String(raceParent),
          };
          const result = reverse
            ? await heldRace(operation, input, 'client-archive', archiveParent)
            : await heldRace('client-archive', archiveParent, operation, input);
          if (!reverse) {
            assert.ok('error' in result);
            assert.ok(result.error instanceof ClientMutationError);
            assert.equal(result.error.code, 'parent-archived');
          } else if ('error' in result) {
            assert.ok(result.error instanceof ClientMutationError);
            assert.equal(result.error.code, 'stale');
          }
          const contacts = await inspect(
            async (db) =>
              (
                await db.query(
                  'SELECT id,is_archived FROM contacts WHERE client_id=$1 ORDER BY id',
                  [raceParent],
                )
              ).rows,
          );
          assert.equal(contacts.length, operation === 'contact-create' && reverse ? 2 : 1);
          assert.equal(
            contacts.find((record) => record.id === raceChild)!.is_archived,
            operation === 'contact-restore' ? !reverse : operation === 'contact-archive' && reverse,
          );
          if (!reverse || 'result' in result)
            assert.equal((await row('clients', raceParent)).is_archived, true);
        }
      }
      pass(
        'ten observed service lock races: main-contact selection/contact archive and parent archive versus contact create/edit/archive/restore, both directions',
      );

      const revoked = {
        ...assistant,
        user: { ...assistant.user, sessionVersion: assistant.user.sessionVersion - 1 },
      } as Session;
      await unchanged(() =>
        reject(
          () =>
            run(
              'client-update',
              { id: String(duplicate), version: '1', name_en: '__REVOKED' },
              revoked,
            ),
          'session',
        ),
      );
      await reject(() => read('client-update', duplicate, null, revoked), 'session');
      let reached!: () => void, release!: () => void;
      const paused = new Promise<void>((done) => {
          reached = done;
        }),
        resume = new Promise<void>((done) => {
          release = done;
        });
      let held = false;
      const delayed = {
        $transaction: (
          work: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: unknown,
        ) =>
          runtime.$transaction(
            async (tx) =>
              work(
                new Proxy(tx, {
                  get(target, key, receiver) {
                    if (key !== '$queryRaw') return Reflect.get(target, key, receiver);
                    return async (sql: Prisma.Sql) => {
                      const result = await target.$queryRaw(sql);
                      if (!held && sql.sql.includes('FROM public.user_accounts')) {
                        held = true;
                        reached();
                        await resume;
                      }
                      return result;
                    };
                  },
                }),
              ),
            options as never,
          ),
      } as unknown as PrismaClient;
      const raceInput = {
        ...(await target('client-update', duplicate)),
        name_en: '__REVOKED_DURING_TRANSACTION',
      };
      const pending = run('client-update', raceInput, assistant, delayed).then(
        () => null,
        (error: unknown) => error,
      );
      await Promise.race([
        paused,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('actor checkpoint not reached')), 5000),
        ),
      ]);
      try {
        await changeManagedRole(
          Number(admin.user.id),
          {
            accountId: Number(assistant.user.id),
            expectedSessionVersion: assistant.user.sessionVersion,
            role: 'Lawyer',
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        );
      } finally {
        release();
      }
      const denied = await pending;
      assert.ok(denied instanceof ClientMutationError && denied.code === 'session');
      assert.notEqual((await row('clients', duplicate)).name_en, raceInput.name_en);
      const accountNow = await runtime.userAccount.findUniqueOrThrow({
        where: { id: Number(assistant.user.id) },
        select: { sessionVersion: true },
      });
      await changeManagedRole(
        Number(admin.user.id),
        {
          accountId: Number(assistant.user.id),
          expectedSessionVersion: accountNow.sessionVersion,
          role: 'Litigation Assistant',
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      );
      const restored = await runtime.userAccount.findUniqueOrThrow({
        where: { id: Number(assistant.user.id) },
        select: { sessionVersion: true },
      });
      const currentAssistant = {
        ...assistant,
        user: { ...assistant.user, sessionVersion: restored.sessionVersion },
      } as Session;
      await disableManagedAccount(
        Number(admin.user.id),
        { accountId: Number(assistant.user.id), expectedSessionVersion: restored.sessionVersion },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      );
      await unchanged(() =>
        reject(() => run('client-update', raceInput, currentAssistant), 'session'),
      );
      await reject(() => read('client-update', duplicate, null, currentAssistant), 'session');
      pass(
        'session-version denial, committed role revocation after transactional actor read, bounded serializable retry, and disabled-account form/service denial',
      );

      await inspect(async (db) => {
        await db.query(
          "CREATE FUNCTION public.task41_phase3_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Task41 phase3 injected audit failure'; END $$",
        );
        await db.query(
          'CREATE TRIGGER task41_phase3_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.task41_phase3_audit_failure()',
        );
      });
      const failureState = await state(),
        retry = { submission: randomUUID(), name_ar: '__PHASE3_AUDIT_ROLLBACK' };
      try {
        await assert.rejects(() => run('client-create', retry));
        await assert.rejects(async () =>
          run('client-update', {
            ...(await target('client-update', duplicate)),
            name_en: '__AUDIT_ROLLBACK',
          }),
        );
        assert.deepEqual(
          (await state()).tables,
          failureState.tables,
          'failed audit must roll back business records, receipts and event chain',
        );
      } finally {
        await inspect(async (db) => {
          await db.query('DROP TRIGGER task41_phase3_audit_failure ON public.audit_events');
          await db.query('DROP FUNCTION public.task41_phase3_audit_failure()');
        });
      }
      const recovered = await run('client-create', retry);
      await unchanged(async () =>
        assert.equal((await run('client-create', retry)).id, recovered.id),
      );
      pass(
        'injected audit failure rolls back business edits/creation receipts; same submission succeeds after recovery; sequence gaps deliberately excluded from rollback claim',
      );
      await inspect((db) => assertClientContactBoundary(db, 'historical-full-state-upgrade'));
      pass(
        'permanent client/contact import, operational, constraint and receipt invariants after application service mutations',
      );
    } finally {
      await runtime.$disconnect();
    }
  });
  const manifest = JSON.parse(
    (await import('node:fs')).readFileSync(join(output, 'service-isolation.json'), 'utf8'),
  );
  manifest.cleaned = true;
  writeFileSync(join(output, 'service-isolation.json'), JSON.stringify(manifest, null, 2));
  assert.deepEqual(
    await withApprovedMigrationClient(staffReadOnlyState, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    }),
    before,
  );
  pass('task cluster/volume/network cleanup and complete project preservation');
  writeFileSync(
    join(output, 'service-result.json'),
    JSON.stringify({ groups, passed: true }, null, 2),
  );
  console.log(`PASS ${groups} client mutation service proof groups`);
}
main().catch((error) => {
  console.error(String(error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]'));
  process.exitCode = 1;
});
