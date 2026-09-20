import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Session } from 'next-auth';
import { createDatabaseClient } from '../src/lib/db';
import { authenticateCredentials } from '../src/lib/auth/service';
import { createSessionClaims, validateSessionClaims } from '../src/lib/auth/session';
import { createRequestAuditMetadata } from '../src/lib/audit-metadata';
import { readAuditHistory } from '../src/lib/audit-history-query';
import {
  mutateFeeLetter,
  readFeeLetterMutation,
  mutateMatterFeeReference,
  readMatterFeeReferenceMutation,
} from '../src/lib/fee-letter-mutations';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { capture } from './lib/audit-history-test-state';

async function main() {
  const output = process.env['TASK49_TEST_OUTPUT']!,
    url = process.env['MIGRATION_DATABASE_URL']!;
  assert.ok(output && process.env['TASK49_LOGINS']);
  mkdirSync(output, { recursive: true });
  copyFileSync(process.argv[1]!, resolve(output, 'executed-test.ts'));
  const put = (name: string, value: unknown) =>
    writeFileSync(resolve(output, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
  const runtime = createDatabaseClient(process.env['DATABASE_URL']!);
  const metadata = () =>
    createRequestAuditMetadata(new Request('http://127.0.0.1/task49-relationship-fixture'));
  try {
    await withApprovedMigrationClient(
      async (admin) => {
        await assertIsolatedTestCluster(admin, new URL(url), process.env);
        const login = (
          JSON.parse(readFileSync(process.env['TASK49_LOGINS']!, 'utf8')) as {
            username: string;
            password: string;
          }[]
        ).find((x) => x.username === 'KHelmy')!;
        const user = await authenticateCredentials(login, {
          database: runtime,
          auditMetadata: metadata(),
        });
        assert.ok(user);
        const c = await validateSessionClaims(createSessionClaims(user), { database: runtime });
        assert.ok(c);
        const actor: Session = {
          user: {
            id: String(c.userId),
            personId: c.personId,
            username: c.username,
            name: c.displayName,
            role: c.role,
            mustChangePassword: c.mustChangePassword,
            sessionVersion: c.sessionVersion,
            auditSessionId: c.auditSessionId,
          },
          expires: new Date(c.absoluteExpiresAt).toISOString(),
        };
        const matterRows = (
          await admin.query(
            `SELECT m.id,m.client_id,m.fee_letter_ref FROM matters m JOIN clients c ON c.id=m.client_id WHERE NOT m.is_archived AND NOT c.is_archived AND NOT EXISTS (SELECT 1 FROM matter_fee_letter_references r WHERE r.matter_id=m.id AND NOT r.is_retired) ORDER BY m.id LIMIT 1`,
          )
        ).rows;
        assert.equal(matterRows.length, 1);
        const matter = matterRows[0];
        const payload = (
          operation: string,
          id: number | null,
          version: string | null,
          values: object = {},
          related: object | null = null,
        ) => ({ operation, id, version, submission: randomUUID(), values, related, facts: null });
        const deps = () => ({ database: runtime, auditMetadata: metadata() });
        const first = await mutateFeeLetter(
          actor,
          'create',
          payload('create', null, null, {
            client_id: matter.client_id,
            contract_type: 'TASK49 SYNTHETIC RELATIONSHIP A',
          }),
          deps(),
        );
        const second = await mutateFeeLetter(
          actor,
          'create',
          payload('create', null, null, {
            client_id: matter.client_id,
            contract_type: 'TASK49 SYNTHETIC RELATIONSHIP B',
          }),
          deps(),
        );
        const added = await mutateFeeLetter(
          actor,
          'covered-add',
          payload(
            'covered-add',
            first.id,
            first.version,
            {},
            { membershipId: null, matterId: matter.id },
          ),
          deps(),
        );
        const feeState = await readFeeLetterMutation(actor, 'update', first.id, runtime);
        const membership = feeState.record!.covered.filter((x) => x.matterId === matter.id);
        assert.equal(membership.length, 1);
        const retired = await mutateFeeLetter(
          actor,
          'covered-retire',
          payload(
            'covered-retire',
            first.id,
            added.version,
            {},
            { membershipId: membership[0]!.id, matterId: null },
          ),
          deps(),
        );
        const restored = await mutateFeeLetter(
          actor,
          'covered-restore',
          payload(
            'covered-restore',
            first.id,
            retired.version,
            {},
            { membershipId: membership[0]!.id, matterId: null },
          ),
          deps(),
        );
        await mutateFeeLetter(
          actor,
          'covered-retire',
          payload(
            'covered-retire',
            first.id,
            restored.version,
            {},
            { membershipId: membership[0]!.id, matterId: null },
          ),
          deps(),
        );
        const initial = await readMatterFeeReferenceMutation(actor, matter.id, runtime);
        const set = await mutateMatterFeeReference(
          actor,
          'set',
          payload(
            'set',
            matter.id,
            initial.version,
            {},
            { oldFeeLetterId: null, newFeeLetterId: first.id },
          ),
          deps(),
        );
        const replaced = await mutateMatterFeeReference(
          actor,
          'replace',
          payload(
            'replace',
            matter.id,
            set.version,
            {},
            { oldFeeLetterId: first.id, newFeeLetterId: second.id },
          ),
          deps(),
        );
        await mutateMatterFeeReference(
          actor,
          'clear',
          payload(
            'clear',
            matter.id,
            replaced.version,
            {},
            { oldFeeLetterId: second.id, newFeeLetterId: null },
          ),
          deps(),
        );
        assert.equal(
          (await admin.query('SELECT fee_letter_ref FROM matters WHERE id=$1', [matter.id])).rows[0]
            .fee_letter_ref,
          matter.fee_letter_ref,
        );
        const references = (
          await admin.query(
            'SELECT id,fee_letter_id,is_retired FROM matter_fee_letter_references WHERE matter_id=$1 AND fee_letter_id=ANY($2::int[]) ORDER BY id',
            [matter.id, [first.id, second.id]],
          )
        ).rows;
        assert.equal(references.length, 2);
        assert.ok(references.every((x) => x.is_retired));
        const before = await capture(url);
        put('read-before', before);
        // Independent keys come from real committed relationship rows, not the viewer.
        // Both relationships remain stored after retirement. Parent IDs are immutable.
        const oracle = [];
        for (const [table, id] of [
          ['fee_letters', first.id],
          ['fee_letters', second.id],
          ['fee_letter_matters', membership[0]!.id],
          ...references.map((x) => ['matter_fee_letter_references', x.id]),
          ['matters', matter.id],
        ] as [string, number][]) {
          const expected = (
            await admin.query(
              `SELECT e.id::text FROM audit_events e WHERE (e.entity_table=$1 AND e.entity_key->>'id'=$2) OR ($1='fee_letters' AND ((e.entity_table='fee_letter_matters' AND EXISTS(SELECT 1 FROM fee_letter_matters x WHERE x.id::text=e.entity_key->>'id' AND x.fee_letter_id::text=$2)) OR (e.entity_table='matter_fee_letter_references' AND EXISTS(SELECT 1 FROM matter_fee_letter_references x WHERE x.id::text=e.entity_key->>'id' AND x.fee_letter_id::text=$2)))) OR ($1='matters' AND ((e.entity_table='fee_letter_matters' AND EXISTS(SELECT 1 FROM fee_letter_matters x WHERE x.id::text=e.entity_key->>'id' AND x.matter_id::text=$2)) OR (e.entity_table='matter_fee_letter_references' AND EXISTS(SELECT 1 FROM matter_fee_letter_references x WHERE x.id::text=e.entity_key->>'id' AND x.matter_id::text=$2)))) ORDER BY e.id`,
              [table, String(id)],
            )
          ).rows
            .map((x) => x.id)
            .sort();
          const actual: string[] = [];
          let page = await readAuditHistory(actor, { table, id: String(id) }, runtime);
          for (;;) {
            actual.push(
              ...page.groups.flatMap((g) =>
                g.events
                  .filter(
                    (e) =>
                      table !== 'matters' ||
                      ['matters', 'fee_letter_matters', 'matter_fee_letter_references'].includes(
                        e.table ?? '',
                      ),
                  )
                  .map((e) => e.id),
              ),
            );
            if (!page.next) break;
            page = await readAuditHistory(
              actor,
              { table, id: String(id), cursor: page.next },
              runtime,
            );
          }
          assert.deepEqual(actual.sort(), expected, table + ':' + id);
          assert.ok(expected.length > 0);
          oracle.push({ table, id, expected, actual });
        }
        const after = await capture(url);
        put('read-after', after);
        const body = (x: typeof before) => {
          const { capturedAt, ...rest } = x;
          void capturedAt;
          return rest;
        };
        assert.deepEqual(body(after), body(before));
        put('result', {
          status: 'PASS',
          at: new Date().toISOString(),
          first,
          second,
          matterId: matter.id,
          membershipId: membership[0]!.id,
          references,
          originalMatterEvidencePreserved: true,
          bothDirectionsRemainDistinct: true,
          retiredHistoryRetained: true,
          completeReadStateEqual: true,
          oracle,
        });
      },
      { databaseUrl: url },
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
