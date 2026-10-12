import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import { task69Sha } from './lib/task69-contract';
import { task69ReadOnlyState } from './lib/task69-owner-preflight';
import { withTask69OwnerAuthority, assertTask69OwnerCapability } from './lib/task69-owner-target';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  assertTask69RuntimeBound,
  bindTask69Operation,
  withTask69Fixture,
  task69SignedSession,
  type Task69PreparedOperation,
} from './lib/task69-runner';

async function main() {
  const privateRoot = process.env.TASK69_PRIVATE_ROOT!,
    output = process.env.TASK69_EVIDENCE_OUTPUT!;
  const read = (name: string) => JSON.parse(readFileSync(join(privateRoot, name), 'utf8'));
  const request = read('request-parents.json'),
    descriptor = read('fixture-descriptor.json'),
    operation = read('sealed-operation.json') as Task69PreparedOperation;
  assert.equal(request.mode, 'rehearsal');
  assert.equal(descriptor.database, 'litigation_task69_owner_preparation');
  assert.notEqual(descriptor.cluster, '7676117521894273062');
  const config = parse(readFileSync(request.connectionFile));
  assertTask69RuntimeBound(operation);
  const claims = await task69SignedSession(request.sessionFile, config.AUTH_SECRET);
  const fixtureEnvironment = {
    NODE_ENV: 'test' as const,
    TASK40A_ISOLATED_CONTAINER: descriptor.name,
    TASK40A_ISOLATED_TOKEN: descriptor.token,
    TASK40A_ISOLATED_CLUSTER: descriptor.cluster,
  };
  const input = {
    action: 'parents' as const,
    connectionUrl: config.MIGRATION_DATABASE_URL!,
    authorityPath: request.authorityFile,
    authoritySha256: request.authoritySha256,
    mandateTextPath: request.mandateTextFile,
    initialPreflightPath: request.initialPreflightFile,
    recoveryManifestPath: request.recoveryManifestFile,
    recoveryDumpPath: request.recoveryDumpFile,
    fixtureEnvironment,
  };
  const checks: { name: string; status: string; message?: string }[] = [];
  const negative = async (name: string, work: () => Promise<unknown>) => {
    let message = '';
    try {
      await work();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    assert(message, name + ' unexpectedly passed');
    checks.push({ name, status: 'REFUSED', message });
  };
  await withApprovedMigrationClient(
    async (db) => {
      const snapshot = async () => {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try {
          return await task69ReadOnlyState(db);
        } finally {
          await db.query('ROLLBACK');
        }
      };
      const before = await snapshot();
      await negative('direct registration without an authority capability', () =>
        bindTask69Operation(db, operation, claims),
      );
      await negative('ordinary fixture entry refuses an owner-bound rehearsal contract', () =>
        withTask69Fixture(operation, async () => undefined),
      );
      await negative('missing mandate file', () =>
        withTask69OwnerAuthority(
          db,
          operation,
          { ...input, authorityPath: join(privateRoot, 'NO_EXECUTION_MANDATE.json') },
          async () => {
            throw Error('MUTATION CALLBACK REACHED');
          },
        ),
      );
      await negative('wrong mandate file hash', () =>
        withTask69OwnerAuthority(
          db,
          operation,
          { ...input, authoritySha256: '0'.repeat(64) },
          async () => {
            throw Error('MUTATION CALLBACK REACHED');
          },
        ),
      );
      await negative('owner endpoint substituted for rehearsal', () =>
        withTask69OwnerAuthority(
          db,
          operation,
          { ...input, connectionUrl: 'postgresql://127.0.0.1:5433/litigation' },
          async () => {
            throw Error('MUTATION CALLBACK REACHED');
          },
        ),
      );
      await negative('wrong database endpoint', () =>
        withTask69OwnerAuthority(
          db,
          operation,
          {
            ...input,
            connectionUrl: config.MIGRATION_DATABASE_URL!.replace(
              '/' + descriptor.database,
              '/litigation_task69_other',
            ),
          },
          async () => {
            throw Error('MUTATION CALLBACK REACHED');
          },
        ),
      );
      await negative('wrong fixture cluster marker', () =>
        withTask69OwnerAuthority(
          db,
          operation,
          {
            ...input,
            fixtureEnvironment: { ...fixtureEnvironment, TASK40A_ISOLATED_CLUSTER: '1' },
          },
          async () => {
            throw Error('MUTATION CALLBACK REACHED');
          },
        ),
      );
      await negative('wrong fixture ownership marker', () =>
        withTask69OwnerAuthority(
          db,
          operation,
          {
            ...input,
            fixtureEnvironment: { ...fixtureEnvironment, TASK40A_ISOLATED_TOKEN: randomUUID() },
          },
          async () => {
            throw Error('MUTATION CALLBACK REACHED');
          },
        ),
      );
      const changed = read('execution-authority.json');
      changed.kind = 'TASK69_OWNER_EXECUTION';
      const path = join(privateRoot, 'negative-owner-kind-' + randomUUID() + '.json');
      const bytes = Buffer.from(JSON.stringify(changed));
      writeFileSync(path, bytes, { flag: 'wx' });
      await negative('an owner mandate cannot replace a rehearsal mandate', () =>
        withTask69OwnerAuthority(
          db,
          operation,
          { ...input, authorityPath: path, authoritySha256: task69Sha(bytes) },
          async () => {
            throw Error('MUTATION CALLBACK REACHED');
          },
        ),
      );
      await withTask69OwnerAuthority(db, operation, input, async () => {
        await assertTask69OwnerCapability(db, operation);
        await negative('capability refuses swapped operation identity', () =>
          assertTask69OwnerCapability(db, { ...operation, operationId: randomUUID() }),
        );
        await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        try {
          for (const [name, values] of [
            [
              'expired actor',
              [
                claims.userId,
                claims.sessionVersion,
                claims.role,
                new Date(Date.now() - 1).toISOString(),
                claims.auditSessionId,
              ],
            ],
            [
              'stale account version',
              [
                claims.userId,
                claims.sessionVersion + 1,
                claims.role,
                new Date(claims.absoluteExpiresAt).toISOString(),
                claims.auditSessionId,
              ],
            ],
            [
              'missing genuine sign-in',
              [
                claims.userId,
                claims.sessionVersion,
                claims.role,
                new Date(claims.absoluteExpiresAt).toISOString(),
                randomUUID(),
              ],
            ],
          ] as const) {
            await db.query('SAVEPOINT denied_actor');
            await negative(name, () =>
              db.query(
                'SELECT _migration.task69_require_actor($1,$2,$3,$4::timestamptz,$5::uuid)',
                [...values],
              ),
            );
            await db.query('ROLLBACK TO SAVEPOINT denied_actor');
          }
        } finally {
          await db.query('ROLLBACK');
        }
        checks.push({
          name: 'valid sealed authority opens only the exact fixture capability',
          status: 'PASS',
        });
      });
      await negative('capability removed after command callback', () =>
        assertTask69OwnerCapability(db, operation),
      );
      const after = await snapshot();
      assert.deepEqual(
        after,
        before,
        'Negative/preparation checks must leave all tables, sequences and operation journals exact',
      );
      assert(checks.every((c) => !c.message?.includes('MUTATION CALLBACK REACHED')));
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'PASS',
            checks,
            beforeStateSha256: before.stateSha256,
            afterStateSha256: after.stateSha256,
            tableScopes: Object.keys(before.digests).length,
            sequenceStates: before.sequences.length,
            ownerActions: 'NOT_APPLIED',
            noBusinessAuditReceiptSequenceEffects: true,
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log(
        JSON.stringify({
          status: 'PASS',
          checks: checks.length,
          unchanged: before.stateSha256,
          output,
        }),
      );
    },
    { databaseUrl: config.MIGRATION_DATABASE_URL },
  );
}
main().catch((e) => {
  console.error(String(e.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]'));
  process.exitCode = 1;
});
