import type { Session } from 'next-auth';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from './db';
import { AuthorizationError } from './auth/authorization-core';
import { setHumanAuditContext } from './audit';
import { createServerActionAuditMetadata } from './audit-metadata';
import { requireAuditAuthority, readAuditHistory } from './audit-history-query';
import { auditParamsObject } from './audit-history-input';
import {
  auditDetails,
  auditGroupTitle,
  auditLabel,
  auditValue,
  auditRecordedValue,
  auditOriginalValue,
} from './audit-history-projection';
import { AuditHistoryError, type AuditResult } from './audit-history-types';
import { auditErrorResponse, auditResponseHeaders } from './audit-history-response';
import { t } from '@/strings';
const s = t.auditHistory;
const MAX_BYTES = 20 * 1024 * 1024;
let activeExports = 0;
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const escape = (value: string) =>
  value.replace(/[&<>"']/gu, (c) =>
    new Map([
      ['&', '&amp;'],
      ['<', '&lt;'],
      ['>', '&gt;'],
      ['"', '&quot;'],
      ["'", '&#39;'],
    ]).get(c)!,
  );
function chunks(value: string, limit = 12000) {
  const out: string[] = [];
  let part = '';
  for (const char of value) {
    if (part.length + char.length > limit) {
      out.push(part);
      part = '';
    }
    part += char;
  }
  out.push(part);
  return out;
}
function visibleXml(value: string) {
  return value.replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
export function auditExportSummary(result: AuditResult, generatedAt: string): [string, string][] {
  return [
    [s.title, s.projection],
    [
      s.scope,
      result.subject
        ? `${auditLabel('entities', result.subject.table)}:${result.subject.id}`
        : s.global,
    ],
    [s.filters, JSON.stringify(result.filters)],
    [s.timezone, 'UTC'],
    [s.generatedAt, generatedAt],
    [s.watermark, result.watermark],
    [s.results, String(result.totalGroups)],
    [s.events, String(result.totalEvents)],
    [s.groupId, s.groupHelp],
    [s.literal, s.literal],
  ];
}
export async function generateAuditExcel(result: AuditResult, generatedAt: string) {
  const book = new ExcelJS.Workbook();
  book.creator = t.app.name;
  book.created = new Date(generatedAt);
  const info = book.addWorksheet(s.scope, { views: [{ rightToLeft: true }] });
  info.columns = [{ width: 30 }, { width: 100 }];
  for (const row of auditExportSummary(result, generatedAt)) info.addRow(row);
  info.addRow([s.chunksHelp, s.chunksHelp]);
  info.addRow([s.exactBytesHelp, s.exactBytesHelp]);
  const sheet = book.addWorksheet(s.title, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  const headers = [
    s.groupId,
    s.eventId,
    s.occurredAt,
    s.field,
    s.before + ' / ' + s.after,
    s.valueType,
    s.chunk,
    s.details,
    s.exactBytes,
  ];
  sheet.addRow(headers);
  sheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 30 },
    { width: 30 },
    { width: 18 },
    { width: 18 },
    { width: 12 },
    { width: 70 },
    { width: 30 },
  ];
  function add(
    group: string,
    event: string,
    time: string,
    field: string,
    side: string,
    kind: string,
    value: string,
    original = auditOriginalValue({ kind: 'string', text: value }),
  ) {
    // 6,000 UTF-16 units keep even three-byte UTF-8 characters below Excel's
    // 32,767-character cell limit after Base64 expansion; never split a scalar.
    const readable = chunks(value),
      raw = chunks(original, 6000);
    for (let index = 0; index < Math.max(readable.length, raw.length); index++) {
      if (sheet.rowCount >= 300000) throw new AuditHistoryError('too-large');
      const row = sheet.addRow([
        group,
        event,
        time,
        field,
        side,
        kind,
        String(index + 1),
        visibleXml(readable.at(index) ?? ''),
        Buffer.from(raw.at(index) ?? '', 'utf8').toString('base64'),
      ]);
      row.eachCell((cell) => {
        cell.numFmt = '@';
        cell.alignment = { vertical: 'top', wrapText: true, readingOrder: 'rtl' };
      });
    }
  }
  for (const group of result.groups)
    for (const event of group.events) {
      add(group.key, event.id, event.occurredAt, s.groupId, '', 'string', auditGroupTitle(group));
      for (const [label, value] of auditDetails(event))
        add(group.key, event.id, event.occurredAt, label, '', 'string', value);
      for (const field of event.fields)
        for (const side of ['before', 'after'] as const) {
          const value = auditRecordedValue(side === 'before' ? event.before : event.after, field);
          add(
            group.key,
            event.id,
            event.occurredAt,
            `${auditLabel('fields', field)} (${field})`,
            side === 'before' ? s.before : s.after,
            value?.kind ?? 'absent',
            auditValue(value),
            auditOriginalValue(value),
          );
        }
    }
  for (const page of [info, sheet]) {
    page.getRow(1).font = { bold: true };
    page.eachRow((row) =>
      row.eachCell((cell) => {
        cell.alignment = { wrapText: true, vertical: 'top', readingOrder: 'rtl' };
      }),
    );
  }
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  if (bytes.length > MAX_BYTES) throw new AuditHistoryError('too-large');
  return bytes;
}
export async function generateAuditPdf(
  result: AuditResult,
  generatedAt: string,
  signal?: AbortSignal,
) {
  if (result.totalEvents > 2000) throw new AuditHistoryError('too-large');
  const [arabic, latin, latinExt, logo] = await Promise.all([
    readFile(path.resolve('public/fonts/noto-naskh-arabic-arabic-wght-normal.woff2')),
    readFile(path.resolve('public/fonts/noto-naskh-arabic-latin-wght-normal.woff2')),
    readFile(path.resolve('public/fonts/noto-naskh-arabic-latin-ext-wght-normal.woff2')),
    readFile(path.resolve('assets/logo.png')),
  ]);
  const fonts = [arabic, latin, latinExt]
    .map(
      (font, index) =>
        `@font-face{font-family:Noto${index};src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');font-weight:400 700;}`,
    )
    .join('');
  const details = (items: [string, string][]) =>
    items
      .map(([key, value]) => `<tr><th>${escape(key)}</th><td><bdi>${escape(value)}</bdi></td></tr>`)
      .join('');
  const body = result.groups
    .map(
      (group) =>
        `<section><h2>${escape(group.occurredAt.slice(0, 10))} — ${escape(auditGroupTitle(group))}</h2><p>${escape(s.groupId)}: ${escape(group.key)}</p>${group.events.map((event) => `<article><h3>${escape(auditLabel('actions', event.action))} — ${escape(event.id)}</h3><table><thead><tr><th>${escape(s.field)}</th><th>${escape(s.details)}</th></tr></thead><tbody>${details(auditDetails(event))}</tbody></table>${event.fields.map((field) => `<h4>${escape(auditLabel('fields', field))} (${escape(field)})</h4><table><thead><tr><th>${escape(s.before)}</th><th>${escape(s.after)}</th></tr></thead><tbody><tr><td><bdi>${escape(auditValue(auditRecordedValue(event.before, field)))}</bdi></td><td><bdi>${escape(auditValue(auditRecordedValue(event.after, field)))}</bdi></td></tr></tbody></table>`).join('')}</article>`).join('')}</section>`,
    )
    .join('');
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${fonts}body{font-family:Noto0,Noto1,Noto2;font-size:12px;line-height:1.7;color:rgb(30,30,30)}h1,h2,h3{color:rgb(33,75,75);break-after:avoid}table{inline-size:100%;border-collapse:collapse;table-layout:fixed;margin-block:8px}td,th{border:1px solid rgb(199,199,199);padding:6px;text-align:start;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}thead{display:table-header-group}bdi{unicode-bidi:plaintext;white-space:pre-wrap}tr{break-inside:auto}img{inline-size:180px}article{margin-block:16px}</style></head><body><img alt="${escape(t.app.name)}" src="data:image/png;base64,${logo.toString('base64')}"><h1>${escape(s.title)}</h1><table><tbody>${details(auditExportSummary(result, generatedAt))}</tbody></table>${body || `<p>${escape(s.empty)}</p>`}</body></html>`;
  if (Buffer.byteLength(html) > MAX_BYTES) throw new AuditHistoryError('too-large');
  signal?.throwIfAborted();
  const executablePath = process.env['AUDIT_PDF_CHROMIUM'];
  if (executablePath && !path.isAbsolute(executablePath)) throw new AuditHistoryError('generation');
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    timeout: 20000,
  });
  const abort = () => {
    void browser.close();
  };
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 60000);
  try {
    signal?.throwIfAborted();
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:9px;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '15mm', bottom: '18mm', left: '12mm', right: '12mm' },
    });
    signal?.throwIfAborted();
    if (bytes.length > MAX_BYTES) throw new AuditHistoryError('too-large');
    return bytes;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    await browser.close();
  }
}
async function boundedInput(request: Request) {
  // Next's local route URL may use localhost even when the browser requested
  // 127.0.0.1. Compare the actual HTTP Host, not that internal routing alias.
  // No forwarded host/protocol header is trusted here. Browsers cannot choose a
  // cross-origin Host header; credentials and the account capability still gate
  // this handler independently.
  const target = new URL(request.url);
  const host = request.headers.get('host') ?? target.host;
  let origin: string;
  try {
    const actual = new URL(`${target.protocol}//${host}`);
    if (!['http:', 'https:'].includes(target.protocol) || actual.host !== host.toLowerCase())
      throw new Error();
    origin = actual.origin;
  } catch {
    throw new AuditHistoryError('invalid');
  }
  if (
    request.method !== 'POST' ||
    request.headers.get('origin') !== origin ||
    request.headers.get('content-type')?.split(';')[0] !== 'application/json'
  )
    throw new AuditHistoryError('invalid');
  if (Number(request.headers.get('content-length')) > 16384) throw new AuditHistoryError('invalid');
  const reader = request.body?.getReader();
  if (!reader) throw new AuditHistoryError('invalid');
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new AuditHistoryError('invalid');
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string, unknown>;
    if (
      !value ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'format,operationId,query' ||
      typeof value['format'] !== 'string' ||
      !['xlsx', 'pdf'].includes(String(value['format'])) ||
      typeof value['query'] !== 'string' ||
      typeof value['operationId'] !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(
        value['operationId'],
      )
    )
      throw new Error();
    return {
      format: value['format'] as 'xlsx' | 'pdf',
      query: value['query'],
      operationId: value['operationId'],
    };
  } catch {
    throw new AuditHistoryError('invalid');
  }
}
export async function handleAuditExport(
  session: Session,
  request: Request,
  database: PrismaClient = db,
) {
  let acquired = false;
  try {
    await requireAuditAuthority(session, true, database);
    const input = await boundedInput(request);
    if (activeExports >= 2) throw new AuditHistoryError('too-large');
    activeExports++;
    acquired = true;
    const result = await readAuditHistory(
      session,
      auditParamsObject(new URLSearchParams(input.query)),
      database,
      true,
    );
    request.signal.throwIfAborted();
    const generatedAt = new Date().toISOString();
    const bytes =
      input.format === 'xlsx'
        ? await generateAuditExcel(result, generatedAt)
        : await generateAuditPdf(result, generatedAt, request.signal);
    request.signal.throwIfAborted();
    const requestDigest = digest(
      JSON.stringify({
        format: input.format,
        filters: result.filters,
        subject: result.subject,
        watermark: result.watermark,
      }),
    );
    const artifactDigest = digest(bytes);
    const scope = `audit_history:${result.subject ? `${result.subject.table}:${result.subject.id}` : 'global'}`;
    const completed = await database.$transaction(async (transaction) => {
      await setHumanAuditContext(
        transaction,
        Number(session.user.id),
        createServerActionAuditMetadata(request.headers, session.user.auditSessionId),
      );
      const rows = await transaction.$queryRaw<
        { result: { duplicate: boolean; eventId: string } }[]
      >(Prisma.sql`
    SELECT public.audit_history_export_complete(${Number(session.user.id)}::integer,${session.user.personId}::integer,
     ${session.user.sessionVersion}::integer,${session.expires}::timestamptz,${input.operationId}::uuid,
     ${requestDigest}::text,${artifactDigest}::text,${input.format}::text,${scope}::text,
     ${result.watermark}::text,${result.totalGroups}::integer,${result.totalEvents}::integer) result`);
      if (rows.length !== 1) throw new AuditHistoryError('generation');
      return rows[0]!.result;
    });
    if (completed.duplicate) throw new AuditHistoryError('duplicate');
    // A failure after the committed generation fact cannot erase that truthful
    // fact. No download-completed/client-receipt claim is made.
    request.signal.throwIfAborted();
    await requireAuditAuthority(session, true, database);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...auditResponseHeaders,
        'Content-Type':
          input.format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
        'Content-Disposition': `attachment; filename="audit-history.${input.format}"`,
        'Content-Length': String(bytes.length),
        'X-Audit-Event-Id': completed.eventId,
        'X-Artifact-SHA256': artifactDigest,
      },
    });
  } catch (error) {
    if (error instanceof Error && /42501/u.test(error.message))
      return auditErrorResponse(new AuthorizationError('forbidden'));
    if (error instanceof Error && /22023/u.test(error.message))
      return auditErrorResponse(new AuditHistoryError('invalid'));
    return auditErrorResponse(error);
  } finally {
    if (acquired) activeExports--;
  }
}
