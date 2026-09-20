import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import type { Session } from 'next-auth';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from './db';
import {
  AuthorizationError,
  decideAuthorization,
  requireAuthorizedDecision,
} from './auth/authorization-core';
import {
  AuditHistoryError,
  type AuditResult,
  type AuditFilters,
  type AuditSubject,
} from './audit-history-types';
import { parseAuditInput } from './audit-history-input';
import { t } from '@/strings';

function authorize(session: Session | null): Session {
  const valid = requireAuthorizedDecision(decideAuthorization(session, 'auditHistory', 'view'));
  if (
    !Number.isSafeInteger(Number(valid.user.id)) ||
    Number(valid.user.id) < 1 ||
    !Number.isSafeInteger(valid.user.personId) ||
    !Number.isSafeInteger(valid.user.sessionVersion) ||
    !Number.isFinite(Date.parse(valid.expires)) ||
    Date.parse(valid.expires) <= Date.now()
  )
    throw new AuthorizationError('unauthenticated');
  return valid;
}
function translate(error: unknown): never {
  if (error instanceof AuthorizationError || error instanceof AuditHistoryError) throw error;
  const text = error instanceof Error ? error.message : '';
  if (/42501/u.test(text)) throw new AuthorizationError('forbidden');
  if (/54000|57014/u.test(text)) throw new AuditHistoryError('too-large');
  if (/22023|22007|22008|22P02|22003/u.test(text)) throw new AuditHistoryError('invalid');
  throw error;
}
export async function requireAuditAuthority(
  session: Session | null,
  exporting: boolean,
  database: PrismaClient = db,
): Promise<boolean> {
  const actor = authorize(session);
  try {
    const rows = await database.$queryRaw<{ allowed: boolean }[]>(Prisma.sql`
      SELECT public.audit_history_authority(${Number(actor.user.id)}::integer,${actor.user.personId}::integer,
        ${actor.user.sessionVersion}::integer,${actor.expires}::timestamptz,${exporting}::boolean) allowed`);
    if (rows.length !== 1) throw new AuthorizationError('forbidden');
    return rows[0]!.allowed;
  } catch (error) {
    return translate(error);
  }
}
type Cursor = {
  v: 1;
  binding: string;
  watermark: string;
  time: string;
  id: string;
  expires: number;
};
function secret() {
  const value = process.env['AUTH_SECRET'];
  if (!value || value.length < 32) throw new Error('Audit cursor signing unavailable');
  return value;
}
function sign(data: Cursor) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return body + '.' + createHmac('sha256', secret()).update(body).digest('base64url');
}
function binding(session: Session, filters: AuditFilters, subject: AuditSubject | null) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        account: session.user.id,
        version: session.user.sessionVersion,
        session: session.user.auditSessionId,
        filters: { ...filters, q: auditNormalize(filters.q) },
        subject,
        sort: 'occurredAt-desc/id-desc',
        pageSize: 25,
      }),
    )
    .digest('hex');
}
function decode(token: string, expected: string): Cursor {
  const [body, mac, ...extra] = token.split('.');
  if (!body || !mac || extra.length) throw new AuditHistoryError('invalid');
  const actual = Buffer.from(mac, 'base64url'),
    required = createHmac('sha256', secret()).update(body).digest();
  if (actual.length !== required.length || !timingSafeEqual(actual, required))
    throw new AuditHistoryError('invalid');
  let data: Cursor;
  try {
    data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Cursor;
  } catch {
    throw new AuditHistoryError('invalid');
  }
  if (
    data.v !== 1 ||
    data.binding !== expected ||
    !/^\d{1,19}$/u.test(data.watermark) ||
    !/^(?:|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)$/u.test(data.time) ||
    !/^(?:|[1-9]\d{0,18})$/u.test(data.id) ||
    Boolean(data.time) !== Boolean(data.id) ||
    !Number.isSafeInteger(data.expires)
  )
    throw new AuditHistoryError('invalid');
  if (data.expires <= Date.now()) throw new AuditHistoryError('expired');
  return data;
}
export function auditNormalize(value: string) {
  return value
    .replace(/[ًٌٍَُِّْـٰ]/gu, '')
    .replace(
      /[أإآٱةىؤئ]/gu,
      (c) => ({ أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ة: 'ه', ى: 'ي', ؤ: 'و', ئ: 'ي' })[c]!,
    )
    .replace(/[٠-٩]/gu, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/[۰-۹]/gu, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .toLowerCase()
    .replaceAll(' ', '');
}
export async function readAuditHistory(
  session: Session | null,
  input: Record<string, unknown>,
  database: PrismaClient = db,
  exporting = false,
): Promise<AuditResult> {
  const actor = authorize(session);
  const parsed = parseAuditInput(input);
  const { filters, subject } = parsed;
  const scope = binding(actor, filters, subject);
  const cursor = parsed.cursor ? decode(parsed.cursor, scope) : null;
  if (exporting && (!cursor || cursor.time || cursor.id)) throw new AuditHistoryError('invalid');
  const q = auditNormalize(filters.q);
  const terms = q
    ? Object.entries({
        ...t.auditHistory.actions,
        ...t.auditHistory.fields,
        ...t.auditHistory.entities,
      })
        .filter(([, label]) => auditNormalize(label).includes(q))
        .map(([key]) => key)
    : [];
  // A broad label search must be refused explicitly, never silently lose
  // matching fields by truncating the expansion sent to the SQL boundary.
  if (terms.length > 80) throw new AuditHistoryError('too-large');
  const request = {
    ...filters,
    ...subject,
    terms,
    ...(cursor
      ? { watermark: cursor.watermark, beforeTime: cursor.time, beforeId: cursor.id }
      : {}),
    take: exporting ? 10000 : 25,
    export: exporting,
  };
  try {
    const { result, canExport } = await database.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        await tx.$queryRaw(Prisma.sql`SET LOCAL statement_timeout = '8000ms'`);
        const rows = await tx.$queryRaw<
          { result: Omit<AuditResult, 'next' | 'snapshot' | 'canExport' | 'filters' | 'subject'> }[]
        >(Prisma.sql`
    SELECT public.audit_history_read(${Number(actor.user.id)}::integer,${actor.user.personId}::integer,
     ${actor.user.sessionVersion}::integer,${actor.expires}::timestamptz,${JSON.stringify(request)}::jsonb) result`);
        const cap = await tx.$queryRaw<{ allowed: boolean }[]>(Prisma.sql`
    SELECT public.audit_history_authority(${Number(actor.user.id)}::integer,${actor.user.personId}::integer,
     ${actor.user.sessionVersion}::integer,${actor.expires}::timestamptz,${exporting}::boolean) allowed`);
        if (rows.length !== 1 || cap.length !== 1) throw new AuthorizationError('forbidden');
        return { result: rows[0]!.result, canExport: cap[0]!.allowed };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 },
    );
    const expiry = cursor?.expires ?? Date.now() + 15 * 60 * 1000;
    const base: Cursor = {
      v: 1,
      binding: scope,
      watermark: result.watermark,
      time: '',
      id: '',
      expires: expiry,
    };
    if (
      exporting &&
      (result.totalGroups > 10000 ||
        result.totalEvents > 100000 ||
        result.groups.length !== result.totalGroups)
    )
      throw new AuditHistoryError('too-large');
    const more = !exporting && result.groups.length > 25;
    if (more) result.groups = result.groups.slice(0, 25);
    const last = result.groups.at(-1);
    return {
      ...result,
      canExport,
      filters,
      subject,
      snapshot: sign(base),
      next: more && last ? sign({ ...base, time: last.occurredAt, id: last.lastId }) : null,
    };
  } catch (error) {
    return translate(error);
  }
}
