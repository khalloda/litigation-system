import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { documentReports } from '../src/lib/reports/document-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { validateReportData } from '../src/lib/reports/result';
import { renderReportExcel } from '../src/lib/reports/excel';
import { reportHtml, renderReportPdf } from '../src/lib/reports/pdf';
import { type ReportResult } from '../src/lib/reports/types';
import { t } from '../src/strings';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL,
    out = process.env.TASK6567_EVIDENCE;
  assert.ok(url && out);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const admin = (await lifecycleSessions(db)).find((s) => s.user.role === 'Administrator')!;
  const ids = await db.$queryRaw<{ kind: string; id: number }[]>(Prisma.sql`
    (SELECT 'poa' kind,id FROM public.powers_of_attorney ORDER BY coalesce(length(legacy_lawyers_raw),0)+coalesce(length(notes),0)+coalesce(length(principal_name),0) DESC,id LIMIT 1)
    UNION ALL (SELECT 'poa' kind,id FROM public.powers_of_attorney WHERE copies_count=0 ORDER BY id LIMIT 1)
    UNION ALL (SELECT 'poa' kind,id FROM public.powers_of_attorney WHERE show_on_poa_report IS FALSE ORDER BY id LIMIT 1)
    UNION ALL (SELECT 'document' kind,id FROM public.documents ORDER BY length(description) DESC NULLS LAST,id LIMIT 1)
    UNION ALL (SELECT 'document' kind,id FROM public.documents WHERE legacy_page_count_raw LIKE '%CD%' ORDER BY id LIMIT 1)`);
  const cases = ids.map((r) => ({
    id: r.kind === 'poa' ? 'poa-movement-card' : 'document-movement-card',
    fields: { [r.kind]: String(r.id) },
    suffix: String(r.id),
  }));
  const clients = await db.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT c.id FROM public.clients c
    WHERE EXISTS(SELECT 1 FROM public.powers_of_attorney p WHERE p.client_id=c.id AND p.show_on_poa_report IS TRUE)
    AND EXISTS(SELECT 1 FROM public.documents d WHERE d.client_id=c.id) ORDER BY c.id LIMIT 1`);
  assert.equal(clients.length, 1);
  cases.push(
    ...['client-poas', 'client-documents'].map((id) => ({
      id,
      fields: { client: String(clients[0]!.id) },
      suffix: 'client' + clients[0]!.id,
    })),
  );
  const evidence: unknown[] = [];
  const path = join(out, 'document-export-proof.json');
  for (const c of cases) {
    if (process.argv.includes('--lists-only') && c.id.endsWith('-card')) continue;
    const d = documentReports.find((d) => d.descriptor.id === c.id)!;
    const parameters = parseReportInput(
      d.descriptor,
      new URLSearchParams({ format: 'preview', ...c.fields }),
    ).parameters;
    const data = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return d.query(tx, parameters);
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const result: ReportResult = {
      descriptor: d.descriptor,
      parameters,
      data,
      filterLabels: [],
      generatedAt: '2026-10-01T13:15:16.000Z',
      operationId: 'fixture-direct-render',
      rowCount: validateReportData(d.descriptor, data),
    };
    const stem = c.id + '-' + c.suffix;
    writeFileSync(join(out, stem + '-expected.json'), JSON.stringify(result, null, 2) + '\n', {
      flag: 'wx',
    });
    const excel = await renderReportExcel(result);
    writeFileSync(join(out, stem + '.xlsx'), excel, { flag: 'wx' });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(excel) as never);
    const sheet = book.getWorksheet(t.reports.dataSheet)!;
    assert.equal(sheet.views[0]!.rightToLeft, true);
    if (d.descriptor.manual?.kind) {
      assert.equal(sheet.pageSetup.orientation, 'portrait');
      assert.equal(sheet.pageSetup.fitToHeight, 1);
      assert.ok(sheet.pageSetup.printArea);
      if (d.descriptor.manual.kind === 'poa-movement') {
        for (let row = sheet.rowCount - 24; row <= sheet.rowCount; row++)
          for (let column = 1; column <= 6; column++) {
            assert.equal(sheet.getCell(row, column).value, null);
            assert.equal(sheet.getCell(row, column).border.bottom?.style, 'thin');
          }
      } else {
        const values = sheet.getColumn(1).values.filter((x) => typeof x === 'string');
        for (let i = 1; i <= 3; i++) {
          assert.ok(values.includes(i + ' — ' + t.documentReports.outgoing));
          assert.ok(values.includes(i + ' — ' + t.documentReports.incoming));
        }
      }
    } else assert.equal(sheet.pageSetup.orientation, 'landscape');
    const html = (await reportHtml(result, admin)).html;
    writeFileSync(join(out, stem + '.html'), html, { flag: 'wx' });
    if (d.descriptor.manual?.kind === 'poa-movement') {
      const grid = html.match(/<table class="poa-movement-grid">([\s\S]*?)<\/table>/)![1]!;
      assert.equal((grid.match(/<td><\/td>/g) ?? []).length, 150);
      assert.equal((grid.match(/<tr>/g) ?? []).length, 26);
    } else if (d.descriptor.manual?.kind === 'document-movement') {
      assert.equal((html.match(/class="document-movement-pair"/g) ?? []).length, 3);
      assert.equal((html.match(/class="writing-line"/g) ?? []).length, 24);
    }
    const pdf = await renderReportPdf(result, admin);
    writeFileSync(join(out, stem + '.pdf'), pdf, { flag: 'wx' });
    evidence.push({
      stem,
      rowCount: result.rowCount,
      columns: d.descriptor.columns.map((column) => column.key),
      xlsx: { bytes: excel.length, sha256: createHash('sha256').update(excel).digest('hex') },
      pdf: { bytes: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex') },
    });
    writeFileSync(path, JSON.stringify({ status: 'RUNNING', evidence }, null, 2) + '\n');
  }
  writeFileSync(
    path,
    JSON.stringify(
      {
        status: 'PASS',
        evidence,
        scope:
          'Saved direct-pipeline exports; structural Excel/HTML proofs. PDF visual and genuine browser-role gates remain separate.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log('PASS saved document/POA pipeline export structure ' + evidence.length);
}
main()
  .finally(() => db.$disconnect())
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
