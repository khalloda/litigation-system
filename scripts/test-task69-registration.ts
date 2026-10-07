import { assertTask69Preflight } from './lib/task69-preflight';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionClaims } from '../src/lib/auth/session';
import {
  bindTask69Operation,
  prepareTask69Operation,
  task69RunnerSourceDigest,
  withTask69Fixture,
} from './lib/task69-runner';
import { loadTask69Contract, task69Sha } from './lib/task69-contract';
import { TASK69_FOUNDATION_MIGRATION } from './lib/task69-foundation-checkpoint';

async function main() {
  const started = new Date().toISOString();
  const privateRoot = process.env['TASK69_PRIVATE_ROOT'];
  const directory = process.env['TASK69_APPROVED_DIRECTORY'];
  const output = process.env['TASK69_EVIDENCE_OUTPUT'];
  assert.ok(privateRoot && directory && output);
  const descriptor = JSON.parse(readFileSync(join(privateRoot, 'fixture-descriptor.json'), 'utf8'));
  const sessions = JSON.parse(readFileSync(join(privateRoot, 'fixture-logins.json'), 'utf8')) as {
    role: string;
    claims: SessionClaims;
  }[];
  const admin = sessions.find((s) => s.role === 'Administrator')!.claims;
  const assistant = sessions.find((s) => s.role === 'Litigation Assistant')!.claims;
  const operation = prepareTask69Operation({
    directory,
    operationId: randomUUID(),
    cluster: descriptor.cluster,
    database: descriptor.database,
    runnerSha256: task69RunnerSourceDigest(process.cwd()),
    schemaSha256: task69Sha(
      readFileSync(`prisma/migrations/${TASK69_FOUNDATION_MIGRATION}/migration.sql`),
    ),
  });
  assert.equal(operation.allowlist.filter((e) => e.unit_kind === 'issue').length, 3465);
  const counts = Object.fromEntries(
    ['LOOKUP/', 'GENERATED-PARENT/', 'DEST-'].map((prefix) => [
      prefix,
      operation.allowlist.filter((e) => e.issue_id.startsWith(prefix)).length,
    ]),
  );
  assert.deepEqual(counts, { 'LOOKUP/': 89, 'GENERATED-PARENT/': 30, 'DEST-': 1 });
  const probes: { name: string; result: string }[] = [];
  await withTask69Fixture(operation, async (db) => {
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      const refuses = async (name: string, run: () => Promise<unknown>, pattern: RegExp) => {
        await db.query('SAVEPOINT fault');
        let failure: unknown;
        try {
          await run();
        } catch (error) {
          failure = error;
        }
        await db.query('ROLLBACK TO SAVEPOINT fault');
        assert.ok(failure instanceof Error, name + ': expected refusal');
        assert.match(failure.message, pattern);
        probes.push({ name, result: 'REFUSED_AS_REQUIRED' });
      };
      assert.equal(await bindTask69Operation(db, operation, admin), 'registered');
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      assert.equal(await bindTask69Operation(db, operation, assistant), 'already-registered');
      const full = loadTask69Contract(directory);
      for (let i = 0; i < full.entries.length; i++) {
        await assertTask69Preflight(db, full.entries[i]!, operation);
        if (i % 500 === 0)
          console.log(`Validated exact source/references/membership ${i + 1}/3465`);
      }
      probes.push({
        name: 'all 3465 exact sources, complete reference sets, lookups and memberships',
        result: 'PASS',
      });
      const exemplar = full.entries.find((e) => e.unit === 'party_field')!;
      await refuses(
        'missing guard cannot reach execution',
        () => {
          const e = structuredClone(exemplar);
          e.expectedStateGuards.targetGuards.pop();
          return assertTask69Preflight(db, e, operation);
        },
        /complete guard closure changed/,
      );
      await refuses(
        'changed source cannot reach execution',
        () => {
          const e = structuredClone(exemplar);
          e.originalIssue.original.raw_value = 'changed';
          return assertTask69Preflight(db, e, operation);
        },
        /complete guard closure changed/,
      );
      const entry = operation.allowlist.find((e) => e.stage === 'S8-history-dispositions')!;
      const authorize = (
        claims: SessionClaims,
        payload = entry.payload_sha256,
        issue = entry.issue_id,
      ) =>
        db.query(
          'SELECT _migration.task69_authorize_issue($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::uuid) value',
          [
            operation.operationId,
            issue,
            payload,
            claims.userId,
            claims.sessionVersion,
            claims.role,
            new Date(claims.absoluteExpiresAt).toISOString(),
            claims.auditSessionId,
          ],
        );
      const actor = (await authorize(admin)).rows[0].value.actorId;
      await db.query('SET CONSTRAINTS ALL DEFERRED');
      const receiptId = randomUUID();
      const returned = { originalIssue: entry.issue_id };
      await db.query(
        "INSERT INTO _migration.task69_receipt(receipt_id,operation_id,issue_id,payload_sha256,phase,actor_id,audit_session_id,request_id,returned_ids,source_occurrences,effect,expected_delta_count) VALUES($1,$2,$3,$4,'apply',$5,$6,$7,$8,$9,'no-business-write',0)",
        [
          receiptId,
          operation.operationId,
          entry.issue_id,
          entry.payload_sha256,
          actor,
          admin.auditSessionId,
          randomUUID(),
          JSON.stringify(returned),
          JSON.stringify([JSON.parse(entry.entry_text).source]),
        ],
      );
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      assert.equal((await authorize(admin)).rows[0].value.receipt.receipt_id, receiptId);
      assert.deepEqual((await authorize(assistant)).rows[0].value.receipt.returned_ids, returned);
      probes.push({
        name: 'identical receipt retry returns original IDs and adds nothing',
        result: 'PASS',
      });
      for (const session of sessions.filter(
        (s) => !['Administrator', 'Litigation Assistant'].includes(s.role),
      )) {
        await refuses(
          session.role + ' cannot reuse receipt',
          () => authorize(session.claims),
          /Current authorized matter session/,
        );
        await refuses(
          session.role + ' cannot reuse operation',
          () => bindTask69Operation(db, operation, session.claims),
          /Current authorized matter session/,
        );
      }
      await refuses(
        'expired actor cannot reuse receipt',
        () => authorize({ ...admin, absoluteExpiresAt: Date.now() - 1000 }),
        /Current authorized matter session/,
      );
      await refuses(
        'stale session version cannot reuse receipt',
        () => authorize({ ...admin, sessionVersion: admin.sessionVersion + 1 }),
        /Current authorized matter session/,
      );
      await refuses(
        'invented sign-in cannot reuse receipt',
        () => authorize({ ...admin, auditSessionId: randomUUID() }),
        /genuine current sign-in/,
      );
      await refuses(
        'another human sign-in cannot reuse receipt',
        () => authorize({ ...admin, auditSessionId: assistant.auditSessionId }),
        /genuine current sign-in/,
      );
      await refuses(
        'changed approved payload cannot reuse receipt',
        () => authorize(admin, '0'.repeat(64)),
        /issue or approved payload differs/,
      );
      await refuses(
        'unapproved issue cannot reuse receipt',
        () => authorize(admin, entry.payload_sha256, 'UNAPPROVED'),
        /issue or approved payload differs/,
      );
      await refuses(
        'changed operation cannot reuse registration',
        () =>
          bindTask69Operation(
            db,
            { ...operation, contractText: operation.contractText + ' ' },
            admin,
          ),
        /Conflicting prior operation/,
      );
      await refuses(
        'incomplete receipt cannot commit',
        async () => {
          await db.query('SET CONSTRAINTS ALL DEFERRED');
          const other = operation.allowlist.find((e) => e.issue_id !== entry.issue_id)!;
          await db.query(
            "INSERT INTO _migration.task69_receipt(receipt_id,operation_id,issue_id,payload_sha256,phase,actor_id,audit_session_id,request_id,returned_ids,source_occurrences,effect,expected_delta_count) VALUES($1,$2,$3,$4,'apply',$5,$6,$7,'{}','[]','business-change',1)",
            [
              randomUUID(),
              operation.operationId,
              other.issue_id,
              other.payload_sha256,
              actor,
              admin.auditSessionId,
              randomUUID(),
            ],
          );
          await db.query('SET CONSTRAINTS ALL IMMEDIATE');
        },
        /exact atomic audit and delta correspondence/,
      );
      await refuses(
        'receipt cannot be overwritten',
        () =>
          db.query(
            'UPDATE _migration.task69_receipt SET returned_ids=returned_ids WHERE receipt_id=$1',
            [receiptId],
          ),
        /immutable/,
      );
      await refuses(
        'runtime cannot access private restoration gateway',
        async () => {
          await db.query('SET LOCAL ROLE litigation_runtime');
          await authorize(admin);
        },
        /permission denied/,
      );
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM _migration.task69_receipt WHERE operation_id=$1',
            [operation.operationId],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await db.query('ROLLBACK');
    }
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int n FROM _migration.task69_operation WHERE operation_id=$1',
          [operation.operationId],
        )
      ).rows[0].n,
      0,
    );
  });
  const result = {
    status: 'PASS',
    scope:
      'Private full-contract registration, atomic receipt structure and fresh actor authorization. Test transaction rolled back; stage writes not exercised.',
    started,
    completed: new Date().toISOString(),
    issues: 3465,
    dependencyUnits: 120,
    dependencyCounts: counts,
    probes,
    fixture: { database: operation.targetDatabase, cluster: operation.targetCluster },
    runnerSha256: operation.runnerSha256,
    schemaSha256: operation.schemaSha256,
    ownerActions: 'NOT_APPLIED',
    rolledBack: true,
  };
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Task69 contract gateway tests failed');
  process.exitCode = 1;
});
