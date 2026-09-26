import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { authenticateCredentials } from '../src/lib/auth/service';
import { createSessionClaims } from '../src/lib/auth/session';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { createDatabaseClient } from '../src/lib/db';
import { Prisma } from '../src/generated/prisma/client';
import { renderReportPdf } from '../src/lib/reports/pdf';
import { reportSnapshot } from '../src/lib/reports/authority';
import { parseReportInput } from '../src/lib/reports/input';
import { validateReportData } from '../src/lib/reports/result';
import { probeDefinitions, edgeData, edgeDescriptor } from './test-report-probes';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import type { LogoMetadata } from '../src/lib/client-query';
async function main() {
  const out = process.env.TASK51_OUTPUT!,
    priv = process.env.TASK51_PRIVATE!;
  const f = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(f.migrationUrl), f.environment),
    { databaseUrl: f.migrationUrl },
  );
  const runtime = createDatabaseClient(f.runtimeUrl);
  try {
    const login = JSON.parse(readFileSync(`${priv}/logins.json`, 'utf8')).find(
      (x: { role: string }) => x.role === 'Lawyer',
    );
    const user = await authenticateCredentials(login, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
    assert.ok(user);
    const session = {
      user,
      expires: new Date(createSessionClaims(user).absoluteExpiresAt).toISOString(),
    };
    const logoProbe = {
      descriptor: {
        ...edgeDescriptor,
        id: 'probe-logo',
        layout: 'flat' as const,
        clientFacing: true,
      },
      query: async (tx: Prisma.TransactionClient) => {
        const rows = await tx.$queryRaw<(LogoMetadata & { name: string })[]>(
          Prisma.sql`SELECT l.client_id AS "clientId",l.relative_path AS "relativePath",l.file_name AS "fileName",l.content_type AS "contentType",l.byte_size AS "byteSize",l.sha256,c.name_ar AS name FROM public.client_logos l JOIN public.clients c ON c.id=l.client_id ORDER BY l.client_id LIMIT 1`,
        );
        assert.equal(rows.length, 1);
        const logo = rows[0]!;
        return {
          ...edgeData,
          clientBrand: { name: logo.name, logo },
          sections: [
            {
              id: 'one',
              title: 'اختبار الشعار المسجل',
              groups: [
                { id: 'one', title: '', rows: edgeData.sections[0]!.groups[0]!.rows.slice(0, 3) },
              ],
            },
          ],
        };
      },
    };
    const proofs = [];
    for (const d of [
      ...probeDefinitions.filter((x) => x.descriptor.id !== 'probe-volume'),
      logoProbe,
    ]) {
      const parameters = parseReportInput(
        d.descriptor,
        new URLSearchParams('format=pdf'),
      ).parameters;
      const data = await reportSnapshot(
        session,
        runtime,
        'export',
        d.descriptor.permissions,
        (tx) => d.query(tx, parameters),
      );
      const result = {
        descriptor: d.descriptor,
        parameters,
        data,
        rowCount: validateReportData(d.descriptor, data),
        generatedAt: new Date().toISOString(),
        filterLabels: [],
        operationId: 'render-inspection',
      };
      const start = performance.now(),
        bytes = await renderReportPdf(result, session);
      writeFileSync(`${out}/${d.descriptor.id}.pdf`, bytes, { flag: 'wx' });
      proofs.push({
        file: d.descriptor.id + '.pdf',
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        milliseconds: performance.now() - start,
        rows: result.rowCount,
      });
      writeFileSync(`${out}/results.json`, JSON.stringify(proofs, null, 2));
      console.log('PASS ' + d.descriptor.id);
    }
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
