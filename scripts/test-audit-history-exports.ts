import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createDatabaseClient } from '../src/lib/db';
import { authenticateCredentials } from '../src/lib/auth/service';
import { createSessionClaims, validateSessionClaims } from '../src/lib/auth/session';
import {
  createRequestAuditMetadata,
  createMaintenanceAuditMetadata,
} from '../src/lib/audit-metadata';
import {
  correctManagedUsername,
  changeManagedRole,
  UserManagementError,
} from '../src/lib/auth/user-management';
import { validManagementForm } from '../src/lib/auth/account-form-input';
import { readAuditHistory, requireAuditAuthority } from '../src/lib/audit-history-query';
import {
  handleAuditExport,
  generateAuditExcel,
  generateAuditPdf,
} from '../src/lib/audit-history-export';
import { AuditHistoryError, type AuditResult } from '../src/lib/audit-history-types';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { auditHistoryFailures } from './lib/audit-history-checkpoint';
import { capture } from './lib/audit-history-test-state';
import { t } from '../src/strings';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function main() {
  const output = process.env['TASK49_TEST_OUTPUT']!,
    privateRoot = process.env['TASK49_PRIVATE_ROOT']!;
  assert.ok(output && privateRoot && process.env['TASK49_LOGINS']);
  mkdirSync(output, { recursive: true });
  copyFileSync(process.argv[1]!, resolve(output, 'executed-test.ts'));
  const put = (name: string, value: unknown) =>
    writeFileSync(resolve(output, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
  const logins = JSON.parse(readFileSync(process.env['TASK49_LOGINS']!, 'utf8')) as {
    username: string;
    password: string;
  }[];
  const runtime = createDatabaseClient(process.env['DATABASE_URL']!);
  const url = process.env['MIGRATION_DATABASE_URL']!;
  const results: unknown[] = [];
  try {
    await withApprovedMigrationClient(
      async (admin) => {
        await assertIsolatedTestCluster(admin, new URL(url), process.env);
        async function login(username: string, password: string): Promise<Session> {
          const user = await authenticateCredentials(
            { username, password },
            {
              database: runtime,
              auditMetadata: createRequestAuditMetadata(
                new Request('http://127.0.0.1/task49-export-fixture-login'),
              ),
            },
          );
          assert.ok(user);
          const c = await validateSessionClaims(createSessionClaims(user), { database: runtime });
          assert.ok(c);
          return {
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
        }
        const khaled = logins.find((x) => x.username === 'KHelmy')!,
          other = logins.find((x) => x.username === 'IHamdy')!;
        let actor = await login(khaled.username, khaled.password);
        const metadata = () => createMaintenanceAuditMetadata();
        async function cap(enabled: boolean) {
          await admin.query('BEGIN');
          try {
            await admin.query('SELECT audit_set_migration_context()');
            await admin.query(
              "SELECT audit_set_event_context($1,$2,$3,NULL,'controlled-maintenance:task49-fixture','system')",
              [randomUUID(), randomUUID(), randomUUID()],
            );
            await admin.query(
              "SELECT _migration.audit_export_set_capability($1,$2,'TASK49 isolated capability test')",
              [Number(actor.user.id), enabled],
            );
            await admin.query('COMMIT');
          } catch (e) {
            await admin.query('ROLLBACK');
            throw e;
          }
        }
        async function snapshot(name: string) {
          const value = await capture(url);
          put(name, value);
          return value;
        }
        const body = (x: Awaited<ReturnType<typeof capture>>) => {
          const { capturedAt, ...rest } = x;
          void capturedAt;
          return rest;
        };
        async function queryFor(input: Record<string, string> = {}) {
          const r = await readAuditHistory(actor, input, runtime);
          return { r, query: new URLSearchParams({ ...input, cursor: r.snapshot }).toString() };
        }
        function request(
          query: string,
          format = 'xlsx',
          operationId = randomUUID(),
          signal?: AbortSignal,
        ) {
          return new Request('http://localhost/audit-history/export', {
            method: 'POST',
            headers: {
              origin: 'http://127.0.0.1',
              host: '127.0.0.1',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ format, operationId, query }),
            signal,
          });
        }
        const doc = (
          await admin.query(
            "SELECT id FROM documents WHERE description LIKE 'TASK49 SYNTHETIC ONLY%' ORDER BY id DESC LIMIT 1",
          )
        ).rows[0].id;
        const contextual = await queryFor({ table: 'documents', id: String(doc) });
        // A second, usable Administrator can view, but the role itself confers no export capability.
        const beforeRole = await runtime.userAccount.findUniqueOrThrow({
          where: { usernameNormalized: other.username.toLowerCase() },
        });
        await changeManagedRole(
          Number(actor.user.id),
          {
            accountId: beforeRole.id,
            expectedSessionVersion: beforeRole.sessionVersion,
            role: 'Administrator',
          },
          { database: runtime, auditMetadata: metadata() },
        );
        const second = await login(other.username, other.password);
        assert.equal((await readAuditHistory(second, {}, runtime)).canExport, false);
        const refusalBefore = await snapshot('refusal-before');
        const denied = await handleAuditExport(second, request(contextual.query), runtime);
        assert.equal(denied.status, 403);
        const extra = {
          accountId: Number(actor.user.id),
          expectedSessionVersion: actor.user.sessionVersion,
          username: 'KHelmy',
          auditExport: true,
        };
        await assert.rejects(
          () =>
            correctManagedUsername(Number(actor.user.id), extra, {
              database: runtime,
              auditMetadata: metadata(),
            }),
          (e) => e instanceof UserManagementError && e.code === 'invalid-input',
        );
        for (const forged of [
          'auditExport',
          'audit_export_capability',
          'canExport',
          'capabilities',
          '__proto__',
        ]) {
          const form = new FormData();
          form.set('username', 'KHelmy');
          form.set(forged, 'true');
          assert.equal(validManagementForm(form, ['username']), false);
        }
        for (const format of ['csv', 'html', 'PDF'])
          assert.equal(
            (await handleAuditExport(actor, request(contextual.query, format), runtime)).status,
            400,
          );
        const cross = request(contextual.query);
        cross.headers.set('origin', 'https://unrelated.invalid');
        assert.equal((await handleAuditExport(actor, cross, runtime)).status, 400);
        const abort = new AbortController();
        abort.abort();
        assert.notEqual(
          (
            await handleAuditExport(
              actor,
              request(contextual.query, 'pdf', randomUUID(), abort.signal),
              runtime,
            )
          ).status,
          200,
        );
        const originalBrowser = process.env['AUDIT_PDF_CHROMIUM'];
        process.env['AUDIT_PDF_CHROMIUM'] = 'C:/TASK49-NONEXISTENT/browser.exe';
        try {
          assert.equal(
            (await handleAuditExport(actor, request(contextual.query, 'pdf'), runtime)).status,
            500,
          );
        } finally {
          process.env['AUDIT_PDF_CHROMIUM'] = originalBrowser;
        }
        // Inject failure at the actual DB write boundary, not into the generator.
        const failedAudit = new Proxy(runtime, {
          get(target, key) {
            if (key === '$transaction')
              return (callback: unknown, options: unknown) => {
                if (!options) throw new Error('TASK49 injected audit commit failure');
                return target.$transaction(callback as never, options as never);
              };
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }) as PrismaClient;
        assert.equal(
          (await handleAuditExport(actor, request(contextual.query), failedAudit)).status,
          500,
        );
        assert.deepEqual(body(await snapshot('refusal-after')), body(refusalBefore));
        results.push({
          case: 'second-admin/forged-payload/malformed/origin/abort/generation/audit failures',
          status: 'PASS',
          fullStateEqual: true,
        });
        // A rename invalidates the old session, not the capability keyed by immutable account ID.
        await correctManagedUsername(
          Number(actor.user.id),
          {
            accountId: Number(actor.user.id),
            expectedSessionVersion: actor.user.sessionVersion,
            username: 'Task49OwnerAlias',
          },
          { database: runtime, auditMetadata: metadata() },
        );
        await assert.rejects(() => requireAuditAuthority(actor, true, runtime), AuthorizationError);
        actor = await login('Task49OwnerAlias', khaled.password);
        assert.equal(await requireAuditAuthority(actor, true, runtime), true);
        await correctManagedUsername(
          Number(actor.user.id),
          {
            accountId: Number(actor.user.id),
            expectedSessionVersion: actor.user.sessionVersion,
            username: 'KHelmy',
          },
          { database: runtime, auditMetadata: metadata() },
        );
        actor = await login('KHelmy', khaled.password);
        await cap(false);
        const revokedBefore = await snapshot('revoked-before');
        assert.equal((await readAuditHistory(actor, {}, runtime)).canExport, false);
        assert.equal(
          (await handleAuditExport(actor, request((await queryFor()).query), runtime)).status,
          403,
        );
        assert.deepEqual(body(await snapshot('revoked-after')), body(revokedBefore));
        await cap(true);
        // Deterministic concurrency barrier: revoke after bytes are generated, before write transaction starts.
        let revoked = false;
        const race = new Proxy(runtime, {
          get(target, key) {
            if (key === '$transaction')
              return async (callback: unknown, options: unknown) => {
                if (!options && !revoked) {
                  revoked = true;
                  await cap(false);
                }
                return target.$transaction(callback as never, options as never);
              };
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }) as PrismaClient;
        const raceStart = (
          await admin.query('SELECT count(*)::int n FROM _migration.audit_export_receipt')
        ).rows[0].n;
        assert.equal(
          (
            await handleAuditExport(
              actor,
              request((await queryFor({ table: 'documents', id: String(doc) })).query),
              race,
            )
          ).status,
          403,
        );
        assert.ok(revoked);
        assert.equal(
          (await admin.query('SELECT count(*)::int n FROM _migration.audit_export_receipt')).rows[0]
            .n,
          raceStart,
        );
        await cap(true);
        results.push({
          case: 'stable-ID rename and revoked-during-generation',
          status: 'PASS',
          newExportReceipts: 0,
        });
        const full = await queryFor();
        assert.ok(full.r.totalGroups > 25);
        const all = await readAuditHistory(actor, { cursor: full.r.snapshot }, runtime, true);
        for (const [name, scope, format] of [
          ['global', full, 'xlsx'],
          ['global-filtered-pdf', await queryFor({ actor: '1002' }), 'pdf'],
          ['context', await queryFor({ table: 'documents', id: String(doc) }), 'pdf'],
          ['empty', await queryFor({ q: 'TASK49-no-history-98b29d' }), 'xlsx'],
          ['empty-pdf', await queryFor({ q: 'TASK49-no-history-98b29d' }), 'pdf'],
        ] as const) {
          const before = await snapshot(name + '-before'),
            response = await handleAuditExport(actor, request(scope.query, format), runtime);
          assert.equal(response.status, 200, await response.clone().text());
          const bytes = Buffer.from(await response.arrayBuffer());
          assert.equal(sha(bytes), response.headers.get('x-artifact-sha256'));
          // Global security metadata stays private; synthetic contextual and empty samples are shareable.
          writeFileSync(
            resolve(name.startsWith('global') ? privateRoot : output, name + '.' + format),
            bytes,
          );
          const after = await snapshot(name + '-after');
          assert.deepEqual(after.sequences, before.sequences);
          assert.deepEqual(after.catalogs, before.catalogs);
          assert.deepEqual(after.ledger, before.ledger);
          const allowed = new Set([
            'public.audit_events',
            '_migration.audit_export_receipt',
            '_migration.matter_lifecycle_audit_counter',
          ]);
          for (const row of before.tables)
            if (!allowed.has(row.schema + '.' + row.name))
              assert.deepEqual(
                after.tables.find((t) => t.schema === row.schema && t.name === row.name),
                row,
              );
          for (const event of before.frozen.audit_events!)
            assert.deepEqual(
              after.frozen.audit_events!.find((e) => e.id === event.id),
              event,
            );
          assert.equal(after.frozen.audit_events!.length, before.frozen.audit_events!.length + 1);
          const event = (
            await admin.query(
              'SELECT id::text,action,actor_id,parameters,event_metadata FROM audit_events WHERE id=$1',
              [response.headers.get('x-audit-event-id')],
            )
          ).rows[0];
          assert.equal(event.action, 'export_completed');
          assert.equal(event.parameters.artifact_sha256, sha(bytes));
          assert.equal(event.parameters.events, scope.r.totalEvents);
          if (format === 'xlsx') {
            const book = new ExcelJS.Workbook();
            await book.xlsx.load(bytes as never);
            assert.ok(book.worksheets.every((w) => w.views[0]?.rightToLeft));
            const rows = book.worksheets[1]!;
            const ids = new Set<string>();
            let formulas = 0;
            rows.eachRow((row, index) => {
              if (index === 1) return;
              ids.add(String(row.getCell(2).value));
              row.eachCell((c) => {
                if (c.type === ExcelJS.ValueType.Formula) formulas++;
                assert.equal(typeof c.value, 'string');
              });
            });
            assert.equal(formulas, 0);
            if (name === 'global')
              assert.deepEqual(
                [...ids].sort(),
                all.groups.flatMap((g) => g.events.map((e) => e.id)).sort(),
              );
            else assert.equal(ids.size, 0);
          }
          results.push({
            case: name + '-' + format,
            status: 'PASS',
            bytes: bytes.length,
            sha256: sha(bytes),
            event,
            allTables: after.tables.length,
            sequences: after.sequences.length,
          });
        }
        const double = await queryFor({ table: 'documents', id: String(doc) }),
          nonce = randomUUID();
        const count = (
          await admin.query(
            "SELECT count(*)::int n FROM audit_events WHERE action='export_completed'",
          )
        ).rows[0].n;
        const two = await Promise.all([
          handleAuditExport(actor, request(double.query, 'xlsx', nonce), runtime),
          handleAuditExport(actor, request(double.query, 'xlsx', nonce), runtime),
        ]);
        assert.deepEqual(two.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          (
            await admin.query(
              "SELECT count(*)::int n FROM audit_events WHERE action='export_completed'",
            )
          ).rows[0].n,
          count + 1,
        );
        assert.equal(
          (await handleAuditExport(actor, request(double.query, 'pdf', nonce), runtime)).status,
          400,
        );
        results.push({
          case: 'concurrent double-submit and changed-format retry',
          status: 'PASS',
          statuses: two.map((r) => r.status),
          events: 1,
        });
        // Typed renderer edge cases are explicitly synthetic, not invented historical DB evidence.
        const synthetic: AuditResult = structuredClone(double.r),
          event = synthetic.groups[0]!.events[0]!;
        synthetic.groups = [{ ...synthetic.groups[0]!, events: [event], count: 1 }];
        synthetic.totalEvents = 1;
        synthetic.totalGroups = 1;
        event.id = '9007199254740993';
        event.occurredAt = '2026-09-20T00:00:00.123456Z';
        event.fields = [
          'notes',
          'page_count',
          'description',
          'storage_location',
          'movement_card',
          'deposit_date',
          'is_archived',
        ];
        const long =
          '=HYPERLINK("https://invalid.example","TASK49")\n+1\n-1\n@SUM(1,2)\n<script>fetch("https://invalid.example")</script>\nأحمد mixed ABC 123\u0001\n'.repeat(
            300,
          );
        event.before = {
          notes: { kind: 'string', text: long },
          page_count: { kind: 'number', text: '9007199254740993.00000001' },
          description: { kind: 'string', text: '' },
          storage_location: { kind: 'null', text: 'null' },
          is_archived: { kind: 'boolean', text: 'false' },
        };
        event.after = {
          notes: {
            kind: 'object',
            text: '{"$truncated":true,"prefix":"أحمد","original_length":99000}',
          },
          description: { kind: 'object', text: '{"$redacted":true}' },
          page_count: { kind: 'number', text: '0' },
        };
        const xlsx = await generateAuditExcel(synthetic, new Date().toISOString());
        writeFileSync(resolve(output, 'synthetic-edge.xlsx'), xlsx);
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(xlsx as never);
        const recovered = new Map<string, string>();
        book.worksheets[1]!.eachRow((row, index) => {
          if (index === 1) return;
          row.eachCell((c) => assert.notEqual(c.type, ExcelJS.ValueType.Formula));
          const key = String(row.getCell(4).value) + '|' + row.getCell(5).value;
          recovered.set(
            key,
            (recovered.get(key) ?? '') +
              Buffer.from(String(row.getCell(9).value), 'base64').toString('utf8'),
          );
        });
        assert.equal(
          JSON.parse(
            recovered.get(t.auditHistory.fields.notes + ' (notes)|' + t.auditHistory.before)!,
          ).text,
          long,
        );
        assert.equal(
          JSON.parse(
            recovered.get(
              t.auditHistory.fields.page_count + ' (page_count)|' + t.auditHistory.before,
            )!,
          ).text,
          '9007199254740993.00000001',
        );
        // A bounded multi-page visual sample; the long lossless Excel sample is separately decoded above.
        event.before.notes = { kind: 'string', text: long.slice(0, 2400) };
        synthetic.groups = Array.from({ length: 6 }, (_, i) => ({
          ...synthetic.groups[0]!,
          key: 'TASK49-SYNTHETIC-' + i,
          events: [{ ...event, id: String(9007199254740993n + BigInt(i)) }],
        }));
        synthetic.totalEvents = 6;
        synthetic.totalGroups = 6;
        const pdf = await generateAuditPdf(synthetic, new Date().toISOString());
        writeFileSync(resolve(output, 'synthetic-edge.pdf'), pdf);
        put('synthetic-edge-expected', synthetic);
        await assert.rejects(
          () => generateAuditPdf({ ...synthetic, totalEvents: 2001 }, new Date().toISOString()),
          (e) => e instanceof AuditHistoryError && e.code === 'too-large',
        );
        // Restore the other account's original role through the existing audited management service.
        const current = await runtime.userAccount.findUniqueOrThrow({
          where: { id: beforeRole.id },
        });
        await changeManagedRole(
          Number(actor.user.id),
          {
            accountId: current.id,
            expectedSessionVersion: current.sessionVersion,
            role: beforeRole.roleCode,
          },
          { database: runtime, auditMetadata: metadata() },
        );
        assert.deepEqual(await auditHistoryFailures(admin), []);
        put('result', {
          at: new Date().toISOString(),
          status: 'PASS',
          results,
          syntheticRendererOnly: true,
          noClientReceiptClaim: true,
        });
      },
      { databaseUrl: url },
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(
    e instanceof Error
      ? e.message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[private URL]')
      : 'failed',
  );
  process.exitCode = 1;
});
