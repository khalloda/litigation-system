import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { Session } from 'next-auth';
import type { ClientBase } from 'pg';
import { createDatabaseClient } from '../src/lib/db';
import { AUTH_ROLES } from '../src/lib/auth/constants';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { mutateClient, readClientMutation } from '../src/lib/client-mutations';
import {
  readClient,
  readClients,
  readClientContacts,
  readContact,
  readLogoMetadata,
} from '../src/lib/client-query';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { assertCurrentClientSource } from './lib/client-regression-source';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { initialiseActors } from './test-client-contacts';
import { loadReports } from './lib/gate4-database';
import {
  archiveVisibilityTargets,
  archiveVisibilitySnapshot,
  assertArchiveVisibility,
  archiveVisibilityReceipt,
  visibilityDigest,
} from './lib/client-archive-visibility';

async function main() {
  const output = process.env.CLIENT_VISIBILITY_EVIDENCE_DIR;
  assert.ok(output && isAbsolute(output), 'Explicit external evidence directory required');
  const outside = relative(process.cwd(), resolve(output));
  assert.ok(outside.startsWith('..') || isAbsolute(outside), 'Evidence must be outside repository');
  mkdirSync(output, { recursive: true });
  const source = await withApprovedMigrationClient(
    async (db) => {
      assert.equal(await assertCurrentClientSource(db), 62);
      const state = await staffReadOnlyState(db);
      for (const [table, count] of Object.entries({
        clients: 318,
        contacts: 188,
        matters: 1744,
        hearings: 13382,
      }))
        assert.equal(
          state.tables.find((row) => row.schema === 'public' && row.table === table)?.count,
          count,
        );
      const volumes = (
        await db.query(`SELECT
      (SELECT count(*)::int FROM contacts WHERE contact_name IS NULL OR btrim(contact_name)='') unnamed,
      (SELECT count(*)::int FROM clients c WHERE NOT EXISTS(SELECT 1 FROM contacts k WHERE k.client_id=c.id)) no_contacts`)
      ).rows;
      assert.deepEqual(volumes, [{ unnamed: 6, no_contacts: 207 }]);
      return { state, targets: await archiveVisibilityTargets(db) };
    },
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  writeFileSync(
    join(output, 'source-volumes.json'),
    JSON.stringify(
      {
        checkpoint: '9f61ba481fbebdb2b0d54e470e43cd8d26014265',
        clients: 318,
        contacts: 188,
        matters: 1744,
        hearings: 13382,
        unnamed: 6,
        withoutContacts: 207,
        targets: source.targets,
      },
      null,
      2,
    ),
  );
  const results: unknown[] = [];
  await withIsolatedPostgres(async (fixture) => {
    const inspect = <T>(work: (db: ClientBase) => Promise<T>) =>
      withApprovedMigrationClient(work, {
        databaseUrl: fixture.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      });
    writeFileSync(
      join(output, 'isolation.json'),
      JSON.stringify(
        {
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          database: new URL(fixture.runtimeUrl).pathname,
          port: new URL(fixture.runtimeUrl).port,
          principal: new URL(fixture.runtimeUrl).username,
          sourceCheckpoint: '9f61ba481fbebdb2b0d54e470e43cd8d26014265',
        },
        null,
        2,
      ),
    );
    await fixture.restoreProject();
    await inspect(async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      assert.equal(await assertCurrentClientSource(db), 62);
      assert.deepEqual((await staffReadOnlyState(db)).tables, source.state.tables);
      assert.deepEqual(await archiveVisibilityTargets(db), source.targets);
    });
    console.log(
      'PASS complete restored source equality before fixture actors; 318/188/1744/13382 and 6/207/378',
    );
    await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
    const runtime = createDatabaseClient(fixture.runtimeUrl);
    try {
      const accounts = await runtime.userAccount.findMany({
        select: { id: true, personId: true, username: true, roleCode: true, sessionVersion: true },
      });
      const sessions = AUTH_ROLES.map((role) => {
        const rows = accounts.filter((account) => account.roleCode === role);
        assert.equal(rows.length, 1);
        const a = rows[0]!;
        return {
          expires: new Date(Date.now() + 3600000).toISOString(),
          user: {
            id: String(a.id),
            personId: a.personId,
            username: a.username,
            name: 'TEST ONLY',
            role,
            mustChangePassword: false,
            sessionVersion: a.sessionVersion,
            auditSessionId: randomUUID(),
          },
        } as Session;
      });
      const admin = sessions.find((session) => session.user.role === 'Administrator')!;
      const unaffectedTables = (state: Awaited<ReturnType<typeof staffReadOnlyState>>) =>
        state.tables.filter(
          (row) => row.schema !== 'public' || !['clients', 'audit_events'].includes(row.table),
        );
      for (const target of source.targets) {
        const baseline = await inspect((db) => archiveVisibilitySnapshot(db, target.id));
        assert.equal(baseline.client.is_archived, false);
        assert.equal(baseline.matters.length, target.matters);
        const preserved = await inspect(staffReadOnlyState);
        const auditRows = () =>
          inspect(async (db) =>
            (await db.query('SELECT to_jsonb(e) value FROM audit_events e ORDER BY id')).rows.map(
              (row) => row.value as Record<string, unknown>,
            ),
          );
        const priorEvents = await auditRows();
        const unrelated = () =>
          inspect(async (db) =>
            visibilityDigest(
              (
                await db.query(
                  'SELECT to_jsonb(c) value FROM clients c WHERE c.id<>$1 ORDER BY c.id',
                  [target.id],
                )
              ).rows,
            ),
          );
        const unrelatedBefore = await unrelated();
        const phases: unknown[] = [];
        for (const [index, phase] of ['before', 'archived', 'restored'].entries()) {
          if (index > 0) {
            const operation = index === 1 ? 'client-archive' : 'client-restore';
            const form = await readClientMutation(
              admin,
              operation,
              String(target.id),
              null,
              runtime,
            );
            assert.equal(form.counts!.matters, target.matters);
            await mutateClient(
              admin,
              operation,
              {
                id: String(target.id),
                version: form.record!.version,
                confirmation: String(target.id),
              },
              {
                database: runtime,
                auditMetadata: createMaintenanceAuditMetadata(),
              },
            );
          }
          const snapshot = await inspect((db) => archiveVisibilitySnapshot(db, target.id));
          assertArchiveVisibility(baseline, snapshot, index === 1, index);
          assert.deepEqual(
            unaffectedTables(await inspect(staffReadOnlyState)),
            unaffectedTables(preserved),
          );
          assert.equal(await unrelated(), unrelatedBefore);
          const events = await auditRows();
          assert.equal(
            visibilityDigest(events.slice(0, priorEvents.length)),
            visibilityDigest(priorEvents),
          );
          const appended = events.slice(priorEvents.length);
          assert.equal(
            appended.length,
            index * 2,
            'one row event and one semantic event per lifecycle operation',
          );
          assert.deepEqual(
            appended.map((event) => event.action),
            index === 0
              ? []
              : index === 1
                ? ['record_updated', 'archive']
                : ['record_updated', 'archive', 'record_updated', 'restore'],
          );
          for (const event of appended) {
            assert.equal(event.entity_schema, 'public');
            assert.equal(event.entity_table, 'clients');
            assert.deepEqual(event.entity_key, { id: target.id });
            assert.equal(event.actor_key_snapshot, 'user_account:' + admin.user.id);
            assert.equal(event.actor_role_snapshot, 'Administrator');
            assert.equal(event.outcome, 'succeeded');
          }
          for (const session of sessions) {
            const detail = await readClient(session, String(target.id), runtime);
            assert.ok(detail);
            assert.equal(detail.matterCount, target.matters);
            assert.equal(detail.isArchived, index === 1);
            const contacts = await readClientContacts(session, String(target.id), '1', runtime);
            assert.ok(contacts);
            for (let page = 1; page <= contacts.pages; page++) {
              const data = await readClientContacts(
                session,
                String(target.id),
                String(page),
                runtime,
              );
              for (const contact of data!.rows) {
                const row = await readContact(
                  session,
                  String(target.id),
                  String(contact.id),
                  runtime,
                );
                assert.ok(row);
                assert.equal(row.parentArchived, index === 1);
              }
            }
            await readLogoMetadata(session, String(target.id), runtime);
            const ids = [];
            const first = await readClients(
              session,
              { archive: index === 1 ? 'archived' : 'current' },
              runtime,
            );
            for (let page = 1; page <= first.pages; page++)
              ids.push(
                ...(
                  await readClients(
                    session,
                    { archive: index === 1 ? 'archived' : 'current', page: String(page) },
                    runtime,
                  )
                ).rows.map((row) => row.id),
              );
            assert.ok(ids.includes(target.id));
          }
          if (index === 1 && String(target.legacy_id) === '3') {
            await inspect(async (db) => {
              await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
              try {
                let intercepted = 0;
                const counterexample = new Proxy(db, {
                  get(object, key) {
                    if (key !== 'query') return Reflect.get(object, key);
                    return (sql: string, values?: unknown[]) => {
                      if (sql.includes('FROM matters m JOIN clients c ON c.id=m.client_id')) {
                        intercepted++;
                        sql = sql.replace(
                          'WHERE c.legacy_id=',
                          'WHERE NOT c.is_archived AND c.legacy_id=',
                        );
                      }
                      return db.query(sql, values);
                    };
                  },
                });
                const hidden = await loadReports(counterexample);
                assert.equal(intercepted, 1);
                assert.equal(hidden[0]!.rows.length, 0);
                assert.throws(
                  () => assert.equal(visibilityDigest(hidden), visibilityDigest(baseline.reports)),
                  assert.AssertionError,
                );
                assert.equal(
                  visibilityDigest(hidden.slice(1)),
                  visibilityDigest(baseline.reports.slice(1)),
                );
              } finally {
                await db.query('ROLLBACK');
              }
            });
            console.log(
              'PASS nonempty report counterexample: archived-client exclusion is detected; unchanged queries are the positive path',
            );
          }
          phases.push({
            phase,
            ...archiveVisibilityReceipt(snapshot),
            fourRoleReadAccess: true,
            unaffectedTables: 105,
            unrelatedClientsUnchanged: true,
            auditPrefixUnchanged: true,
            appendedEvents: appended.length,
          });
          console.log(
            `PASS client ${target.id} (${target.matters} matters), ${phase}: exact matter/report contents and four-role existing reads`,
          );
        }
        results.push({ target, phases });
      }
    } finally {
      await runtime.$disconnect();
    }
  });
  assert.deepEqual(
    await withApprovedMigrationClient(staffReadOnlyState, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    }),
    source.state,
  );
  writeFileSync(
    join(output, 'results.json'),
    JSON.stringify(
      {
        completedUtc: new Date().toISOString(),
        results,
        counterexampleDetected: true,
        fixtureCleanupCompleted: true,
        projectUnchanged: true,
        scope:
          'Existing database/report query contracts and client read paths; future matter/report UI and exports are not implemented or tested',
      },
      null,
      2,
    ),
  );
  console.log('PASS archive visibility and owned fixture cleanup; actual project unchanged');
}
void main();
