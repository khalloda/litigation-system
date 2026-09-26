import type { Session } from 'next-auth';
import path from 'node:path';
import { chromium } from 'playwright';
import { t } from '@/strings';
import { readClientLogoFile } from '@/lib/client-logo-file';
import { reportAssets } from './assets';
import { cellText } from './result';
import { printableText } from './excel';
import { REPORT_LIMITS, ReportError, type ReportResult } from './types';

export const escapeReportHtml = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const text = (value: string) => escapeReportHtml(printableText(value));
export async function reportHtml(result: ReportResult, session: Session) {
  const assets = await reportAssets();
  const fonts = assets.fonts
    .map(
      (b, i) =>
        `@font-face{font-family:Report${i};src:url(data:font/woff2;base64,${b.toString('base64')}) format('woff2');font-weight:400 700}`,
    )
    .join('');
  const image = (bytes: Buffer, mime: string, alt: string) =>
    `<img alt="${text(alt)}" src="data:${mime};base64,${bytes.toString('base64')}">`;
  const client = result.data.clientBrand;
  const clientLogo = client
    ? await readClientLogoFile(session, process.env['CLIENT_LOGO_ROOT'], client.logo)
    : null;
  const heading = `<header><div>${image(assets.logo, 'image/png', t.app.name)}</div><div><h1>${text(result.descriptor.title)}</h1><h2>${text(result.data.subtitle)}</h2></div><div>${client ? (clientLogo ? image(clientLogo.data, clientLogo.contentType, client.name) : text(client.name)) : ''}</div></header>`;
  const cols = `<tr><th>${text(t.reports.rowNumber)}</th>${result.descriptor.columns.map((c) => `<th>${text(c.label)}</th>`).join('')}</tr>`;
  const width = `<colgroup><col style="width:4%">${result.descriptor.columns.map((c) => `<col style="width:${(96 * c.width) / result.descriptor.columns.reduce((sum, x) => sum + x.width, 0)}%">`).join('')}</colgroup>`;
  const row = (
    r: ReportResult['data']['sections'][number]['groups'][number]['rows'][number],
    n: number,
  ) =>
    `<tr${r.highlight === 'attention' ? ' class="attention"' : ''}><td>${n}</td>${r.cells.map((c) => `<td><bdi>${text(cellText(c))}</bdi></td>`).join('')}</tr>`;
  const manual = result.descriptor.manual;
  const blanks = manual
    ? `<aside><h2>${text(manual.heading)}</h2><table><thead><tr>${manual.labels.map((x) => `<th>${text(x)}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: manual.lines }, () => `<tr>${manual.labels.map(() => '<td class="blank">................................</td>').join('')}</tr>`).join('')}</tbody></table></aside>`
    : '';
  let cardNumber = 0;
  const body = result.data.sections
    .map(
      (section) =>
        `<section><h2>${text(section.title)}</h2>${section.groups
          .map((group) => {
            const day = group.date
              ? new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
                  new Date(`${group.date}T12:00:00Z`),
                )
              : '';
            const groupTitle =
              result.descriptor.layout === 'date-grouped' ? `${day} ${group.date}` : group.title;
            if (result.descriptor.layout === 'card')
              return group.rows
                .map(
                  (r, i) =>
                    `<article class="card${cardNumber++ ? ' next-card' : ''}"><strong class="record">${text(r.id)}</strong><table>${width}<thead>${cols}</thead><tbody>${row(r, i + 1)}</tbody></table>${blanks}</article>`,
                )
                .join('');
            return `<table>${width}<thead>${result.descriptor.layout !== 'flat' ? `<tr><th colspan="${result.descriptor.columns.length + 1}">${text(groupTitle)}</th></tr>` : ''}${cols}</thead><tbody>${group.rows.map((r, i) => row(r, i + 1)).join('') || `<tr><td colspan="${result.descriptor.columns.length + 1}">${text(t.reports.noRows)}</td></tr>`}</tbody></table>`;
          })
          .join('')}</section>`,
    )
    .join('');
  const generated = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(result.generatedAt));
  const footer = `<div style="font-family:Report0,Report1,Report2;font-size:9px;width:100%;direction:rtl;text-align:center"><style>${fonts}</style>${text(generated)} — ${text(result.descriptor.title)} — ${text(t.reports.page)} <span class="pageNumber"></span> ${text(t.reports.of)} <span class="totalPages"></span></div>`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>${fonts}
    @page{size:A4 ${result.descriptor.layout === 'card' ? 'portrait' : 'landscape'}}
    body{font-family:Report0,Report1,Report2;font-size:9pt;line-height:1.5;color:#000}h1,h2{color:#214B4B;break-after:avoid}h1{font-size:17pt;margin:2px;line-height:1.3}h2{font-size:11pt;margin:2px;line-height:1.3}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #214B4B;padding-bottom:6px}header:after{content:'';position:absolute;inset-inline:0;inset-block-end:2px;border-bottom:2px solid #B6AA92}header>div{width:30%;text-align:center}header img{max-width:100%;max-height:55px;object-fit:contain}.watermark{position:fixed;inset-block-start:0;inset-inline-end:0;width:85px;opacity:.05;z-index:-1}.watermark img{width:100%}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-block:8px}th,td{border:1px solid #ccc;padding:3px;text-align:start;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:auto}bdi{unicode-bidi:plaintext;white-space:pre-wrap}.attention td{background:#ffff00}.count{font-weight:bold}.next-card{break-before:page}.record{display:inline-block;border:3px solid #000;padding:5px}.blank{height:20px}aside{break-inside:auto;border-top:2px solid #B6AA92}aside h2{break-after:avoid}</style></head><body><div class="watermark">${image(assets.emblem, 'image/png', '')}</div>${heading}<p>${result.filterLabels.map((x) => `${text(x.label)}: <bdi>${text(x.value)}</bdi>`).join(' · ')}</p><p>${text(t.reports.generatedAt)}: <bdi>${text(generated)}</bdi></p>${body}${result.descriptor.layout !== 'card' ? `<table><tbody>${result.data.totals.map((x) => `<tr><th>${text(x.label)}</th><td>${text(cellText(x.value))}</td></tr>`).join('')}<tr class="count"><th>${text(t.reports.count)}</th><td>${result.rowCount}</td></tr></tbody></table>${blanks}` : ''}</body></html>`;
  if (Buffer.byteLength(html) > REPORT_LIMITS.resultBytes) throw new ReportError('too-large');
  return { html, footer };
}
let activePdf = 0;
export async function renderReportPdf(
  result: ReportResult,
  session: Session,
  signal?: AbortSignal,
) {
  if (activePdf >= REPORT_LIMITS.concurrent) throw new ReportError('busy');
  activePdf++;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    void browser?.close();
  };
  try {
    signal?.throwIfAborted();
    const { html, footer } = await reportHtml(result, session);
    signal?.throwIfAborted();
    const executablePath = process.env['AUDIT_PDF_CHROMIUM'];
    if (executablePath && !path.isAbsolute(executablePath)) throw new ReportError('generation');
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      timeout: 20000,
      args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=512'],
    });
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(abort, REPORT_LIMITS.milliseconds);
    signal?.throwIfAborted();
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      deviceScaleFactor: 2,
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setViewportSize({
      width: result.descriptor.layout === 'card' ? 794 : 1123,
      height: 900,
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    const ready = await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('12px Report0', 'العربية'),
        document.fonts.load('12px Report1', 'ABC012'),
        document.fonts.load('12px Report2', 'Ā'),
      ]);
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode()));
      return (
        [...document.fonts].length === 3 && [...document.fonts].every((f) => f.status === 'loaded')
      );
    });
    if (!ready) throw new ReportError('generation');
    const banner = page.locator('body > header');
    await banner.evaluate((element) => {
      (element as HTMLElement).style.position = 'relative';
    });
    const bannerBounds = await banner.boundingBox();
    if (!bannerBounds || bannerBounds.height > 115) throw new ReportError('too-large');
    // Chromium's repeated header font subsetting can clip later pages. Render
    // this shared branded header once with the already verified bundled fonts;
    // repeat those exact pixels. Body/footer text retains embedded glyph fonts.
    await page.locator('.watermark').evaluate((element) => {
      (element as HTMLElement).style.visibility = 'hidden';
    });
    const bannerBytes = await banner.screenshot({ type: 'png', scale: 'device' });
    await page.locator('.watermark').evaluate((element) => {
      (element as HTMLElement).style.visibility = 'visible';
    });
    const header = `<div style="width:100%;margin:4mm 10mm 0"><img style="width:100%;height:auto" alt="${text(result.descriptor.title)}" src="data:image/png;base64,${bannerBytes.toString('base64')}"></div>`;
    await banner.evaluate((element) => element.remove());
    await page.evaluate(
      ({ maximumHeight, continuation }) => {
        const started = performance.now();
        for (const original of [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]) {
          if (original.getBoundingClientRect().height <= maximumHeight) continue;
          const cells = [...original.cells];
          const remaining = cells.map((c) => [...(c.textContent ?? '')]);
          const recordNumber = remaining.at(0)!.join('');
          let part = 0;
          while (remaining.some((s, i) => i > 0 && s.length)) {
            if (performance.now() - started > 20000) throw Error('pagination bound');
            const chunk = original.cloneNode(true) as HTMLTableRowElement;
            original.before(chunk);
            const targets = [...chunk.cells];
            targets.forEach((c) => {
              c.textContent = '';
            });
            targets.at(0)!.textContent = part++ ? continuation : recordNumber;
            for (let i = 1; i < targets.length; i++) {
              const target = targets.at(i)!;
              const source = remaining.at(i)!;
              let low = 0,
                high = Math.min(source.length, 16000);
              while (low < high) {
                const mid = Math.ceil((low + high) / 2);
                target.textContent = source.slice(0, mid).join('');
                if (chunk.getBoundingClientRect().height <= maximumHeight) low = mid;
                else high = mid - 1;
              }
              if (source.length && !low) throw Error('unprintable column');
              const isolate = document.createElement('bdi');
              isolate.textContent = source.splice(0, low).join('');
              target.replaceChildren(isolate);
            }
          }
          original.remove();
        }
      },
      {
        maximumHeight: result.descriptor.layout === 'card' ? 640 : 400,
        continuation: t.reports.continuation,
      },
    );
    const bytes = await page.pdf({
      format: 'A4',
      landscape: result.descriptor.layout !== 'card',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: header,
      footerTemplate: footer,
      margin: { top: '43mm', bottom: '18mm', left: '10mm', right: '10mm' },
    });
    signal?.throwIfAborted();
    if (bytes.length > REPORT_LIMITS.artifactBytes) throw new ReportError('too-large');
    return bytes;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    await browser?.close();
    activePdf--;
  }
}
