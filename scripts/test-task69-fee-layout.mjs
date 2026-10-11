import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { reportHtml, renderReportPdf } from '../src/lib/reports/pdf.ts';
const result = JSON.parse(readFileSync(process.argv[2]));
assert.equal(result.descriptor.id, 'fee-letter-engagements');
assert.equal(result.rowCount, 1);
const claims = JSON.parse(
  readFileSync(join(process.env.TASK69_PRIVATE_ROOT, 'fixture-logins.json')),
).find((a) => a.role === 'Administrator').claims;
const session = {
  user: { ...claims, id: String(claims.userId) },
  expires: new Date(claims.absoluteExpiresAt).toISOString(),
};
const rendered = await reportHtml(result, session),
  browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1123, height: 900 } });
  await page.route('**/*', (r) => r.abort());
  await page.setContent(rendered.html);
  await page.evaluate(() => document.fonts.ready);
  const header = await page.locator('body > header').boundingBox();
  assert(header.height <= 115);
  assert.equal(await page.locator('body > header h2').count(), 0);
  assert.equal(await page.locator('body > p').first().innerText(), result.data.subtitle);
  const pdf = await renderReportPdf(result, session);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const output = process.env.TASK69_EVIDENCE_OUTPUT;
  writeFileSync(output.replace(/\.json$/, '.pdf'), pdf, { flag: 'wx' });
  writeFileSync(
    output,
    JSON.stringify(
      {
        status: 'PASS',
        report: result.descriptor.id,
        headerHeight: header.height,
        subtitlePreserved: true,
        sourcePreview: process.argv[2],
        pdfBytes: pdf.length,
        scope:
          'Actual Chromium rendering from retained one-row fixture preview; same115px guard, complete source subtitle in body',
        ownerActions: 'NOT_APPLIED',
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({ status: 'PASS', headerHeight: header.height, pdfBytes: pdf.length }),
  );
} finally {
  await browser.close();
}
