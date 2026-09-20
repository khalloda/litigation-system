import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import {
  AuthorizationError,
  decideAuthorization,
  requireAuthorizedDecision,
} from './auth/authorization-core';
import { clientId, type ClientSearchParams } from './client-query';

export type BillingKind = 'invoices' | 'payments';
export const BILLING_PAGE_SIZE = 25;
export class BillingFilterError extends Error {}
export type BillingFilters = {
  q: string;
  page: number;
  client: string;
  fee: string;
  invoice: string;
  status: string;
  type: string;
  currency: string;
  date: string;
  from: string;
  to: string;
};
const base = {
  q: '',
  client: 'all',
  fee: 'all',
  invoice: 'all',
  status: 'all',
  type: 'all',
  currency: 'all',
  date: 'all',
  from: '',
  to: '',
};
export function billingDefaults(kind: BillingKind) {
  if (kind !== 'invoices' && kind !== 'payments') throw new BillingFilterError('kind');
  const { invoice, status, type, ...common } = base;
  return kind === 'invoices' ? { ...common, status, type } : { ...common, invoice };
}
function pageNumber(value: string) {
  if (!/^[1-9][0-9]{0,14}$/u.test(value)) throw new BillingFilterError('page');
  return Number(value);
}
export function parseBillingFilters(kind: BillingKind, params: ClientSearchParams): BillingFilters {
  const allowed = new Set([...Object.keys(billingDefaults(kind)), 'page']);
  for (const [key, value] of Object.entries(params)) {
    if (
      !allowed.has(key) ||
      Array.isArray(value) ||
      (value !== undefined && (value.length > 160 || /[\p{Cc}\p{Cf}]/u.test(value)))
    )
      throw new BillingFilterError('parameter');
  }
  const input = new Map(Object.entries(params));
  const value = (key: string, fallback: string) => {
    const found = input.get(key);
    return typeof found === 'string' ? found : fallback;
  };
  const f = {
    ...Object.fromEntries(
      Object.entries(base).map(([key, fallback]) => [key, value(key, fallback)]),
    ),
    page: pageNumber(value('page', '1')),
  } as BillingFilters;
  f.q = f.q.trim();
  for (const id of [f.client, f.fee, f.invoice, f.status, f.type]) {
    if (!['all', 'missing'].includes(id) && clientId(id) === null)
      throw new BillingFilterError('identity');
  }
  if (!['all', 'present', 'missing'].includes(f.date)) throw new BillingFilterError('date');
  for (const d of [f.from, f.to]) {
    if (
      d &&
      (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(d) ||
        d < '0001-01-01' ||
        !Number.isFinite(Date.parse(d)) ||
        new Date(d).toISOString().slice(0, 10) !== d)
    )
      throw new BillingFilterError('date');
  }
  if ((f.from && f.to && f.from > f.to) || (f.date === 'missing' && (f.from || f.to)))
    throw new BillingFilterError('range');
  if (
    !['all', 'missing'].includes(f.currency) &&
    (!f.currency.startsWith('v:') || f.currency.length > 42)
  )
    throw new BillingFilterError('currency');
  return f;
}
export function billingHref(
  kind: BillingKind,
  f?: BillingFilters,
  page = f?.page ?? 1,
  id?: number,
) {
  const search = new URLSearchParams();
  if (f)
    for (const [key, fallback] of Object.entries(billingDefaults(kind))) {
      const value = new Map(Object.entries(f)).get(key);
      if (value !== fallback) search.set(key, String(value));
    }
  if (page !== 1) search.set('page', String(page));
  return `/billing/${kind}${id === undefined ? '' : '/' + id}${search.size ? '?' + search : ''}`;
}
export type BillingRecord = {
  id: number;
  legacyId: number | null;
  invoiceId: number | null;
  invoiceNo: string | null;
  feeId: number | null;
  contractId: string | null;
  clientId: number | null;
  clientName: string | null;
  clientArchived: boolean | null;
  feeArchived: boolean | null;
  date: string | null;
  currency: string | null;
  amount: string | null;
  credit: string | null;
  debit: string | null;
  status: string | null;
  type: string | null;
  details: string | null;
};
export type BillingOption = { kind: string; id: string; name: string | null };
export type BillingAllocation = {
  id: number;
  personId: number | null;
  personName: string | null;
  active: boolean | null;
  role: string | null;
  share: string | null;
};
const invoiceJoin = Prisma.sql`FROM public.invoices i LEFT JOIN public.fee_letters f ON f.id=i.fee_letter_id LEFT JOIN public.clients c ON c.id=f.client_id LEFT JOIN public.lookup_invoice_status s ON s.id=i.status_id LEFT JOIN public.lookup_invoice_type t ON t.id=i.type_id`;
const paymentJoin = Prisma.sql`FROM public.payments p LEFT JOIN public.invoices i ON i.id=p.invoice_id LEFT JOIN public.fee_letters f ON f.id=i.fee_letter_id LEFT JOIN public.clients c ON c.id=f.client_id LEFT JOIN public.lookup_invoice_status s ON s.id=i.status_id LEFT JOIN public.lookup_invoice_type t ON t.id=i.type_id`;
const context = Prisma.sql`i.id AS "invoiceId",i.invoice_no AS "invoiceNo",f.id AS "feeId",f.contract_id::text AS "contractId",c.id AS "clientId",c.name_ar AS "clientName",c.is_archived AS "clientArchived",f.is_archived AS "feeArchived",s.label_ar status,t.label_ar type`;
const invoiceProjection = Prisma.sql`i.id,i.legacy_id AS "legacyId",i.invoice_date::text date,i.currency,i.amount::text amount,NULL::text credit,NULL::text debit,i.details,${context}`;
const paymentProjection = Prisma.sql`p.id,p.legacy_id AS "legacyId",p.payment_date::text date,p.currency,NULL::text amount,p.credit::text credit,p.debit::text debit,p.details,${context}`;
function parts(kind: BillingKind) {
  return kind === 'invoices'
    ? {
        joins: invoiceJoin,
        projection: invoiceProjection,
        id: Prisma.sql`i.id`,
        legacy: Prisma.sql`i.legacy_id`,
        date: Prisma.sql`i.invoice_date`,
        currency: Prisma.sql`i.currency`,
        details: Prisma.sql`i.details`,
      }
    : {
        joins: paymentJoin,
        projection: paymentProjection,
        id: Prisma.sql`p.id`,
        legacy: Prisma.sql`p.legacy_id`,
        date: Prisma.sql`p.payment_date`,
        currency: Prisma.sql`p.currency`,
        details: Prisma.sql`p.details`,
      };
}
function where(kind: BillingKind, f: BillingFilters) {
  const p = parts(kind),
    clauses: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.q) {
    const escaped = f.q.replace(/[\\%_]/gu, '\\$&');
    clauses.push(
      Prisma.sql`(${p.id}::text=public.ar_normalise(${f.q}) OR ${p.legacy}::text=public.ar_normalise(${f.q}) OR public.ar_normalise(concat_ws(' ',i.invoice_no,f.contract_id,c.name_ar,c.name_en,${p.details})) LIKE '%' || public.ar_normalise(${escaped}) || '%' ESCAPE chr(92))`,
    );
  }
  for (const [value, column] of [
    [f.client, Prisma.sql`c.id`],
    [f.fee, Prisma.sql`f.id`],
    [f.invoice, Prisma.sql`i.id`],
    [f.status, Prisma.sql`i.status_id`],
    [f.type, Prisma.sql`i.type_id`],
  ] as const) {
    if (value === 'missing') clauses.push(Prisma.sql`${column} IS NULL`);
    else if (value !== 'all') clauses.push(Prisma.sql`${column}=${Number(value)}`);
  }
  if (f.currency === 'missing') clauses.push(Prisma.sql`${p.currency} IS NULL`);
  else if (f.currency !== 'all') clauses.push(Prisma.sql`${p.currency}=${f.currency.slice(2)}`);
  if (f.date === 'missing') clauses.push(Prisma.sql`${p.date} IS NULL`);
  if (f.date === 'present') clauses.push(Prisma.sql`${p.date} IS NOT NULL`);
  if (f.from) clauses.push(Prisma.sql`${p.date}>=${f.from}::date`);
  if (f.to) clauses.push(Prisma.sql`${p.date}<=${f.to}::date`);
  return Prisma.join(clauses, ' AND ');
}
function authorize(session: Session | null): asserts session is Session {
  requireAuthorizedDecision(decideAuthorization(session, 'billing', 'view'));
  if (
    !session ||
    !/^[1-9][0-9]*$/u.test(session.user.id) ||
    !Number.isSafeInteger(Number(session.user.id)) ||
    !Number.isInteger(session.user.personId) ||
    !Number.isInteger(session.user.sessionVersion) ||
    !(Date.parse(session.expires) > Date.now())
  )
    throw new AuthorizationError('unauthenticated');
}
async function snapshot<T>(
  db: PrismaClient,
  session: Session,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      const valid = await tx.$queryRaw<{ id: number }[]>(
        Prisma.sql`SELECT u.id FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.id=${Number(session.user.id)} AND u.person_id=${session.user.personId} AND u.role_code=${session.user.role} AND u.session_version=${session.user.sessionVersion} AND u.is_enabled AND u.password_hash IS NOT NULL AND NOT u.must_change_password AND p.is_staff AND p.is_active AND p.can_login`,
      );
      if (valid.length !== 1 || !(Date.parse(session.expires) > Date.now()))
        throw new AuthorizationError('unauthenticated');
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
async function options(tx: Prisma.TransactionClient, kind: BillingKind) {
  const currency = parts(kind).currency;
  return tx.$queryRaw<BillingOption[]>(Prisma.sql`
    SELECT 'client' kind,id::text id,name_ar name FROM public.clients
    UNION ALL SELECT 'fee',id::text,contract_id::text FROM public.fee_letters
    UNION ALL SELECT 'invoice',id::text,invoice_no FROM public.invoices
    UNION ALL SELECT 'status',id::text,label_ar FROM public.lookup_invoice_status
    UNION ALL SELECT 'type',id::text,label_ar FROM public.lookup_invoice_type
    UNION ALL SELECT DISTINCT 'currency','v:' || ${currency},${currency} ${parts(kind).joins} WHERE ${currency} IS NOT NULL
    ORDER BY kind,name,id`);
}
export async function readBilling(
  session: Session | null,
  kind: BillingKind,
  params: ClientSearchParams,
  db: PrismaClient,
) {
  authorize(session);
  const f = parseBillingFilters(kind, params),
    p = parts(kind);
  return snapshot(db, session, async (tx) => {
    const choices = await options(tx, kind);
    for (const [key, value] of [
      ['client', f.client],
      ['fee', f.fee],
      ['invoice', f.invoice],
      ['status', f.status],
      ['type', f.type],
      ['currency', f.currency],
    ])
      if (
        !['all', 'missing'].includes(value!) &&
        !choices.some((o) => o.kind === key && o.id === value)
      )
        throw new BillingFilterError('unknown identity');
    const [count] = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT count(*)::int total ${p.joins} WHERE ${where(kind, f)}`,
    );
    const total = count!.total,
      pages = Math.max(1, Math.ceil(total / BILLING_PAGE_SIZE)),
      page = Math.min(f.page, pages);
    const rows = await tx.$queryRaw<BillingRecord[]>(
      Prisma.sql`SELECT ${p.projection} ${p.joins} WHERE ${where(kind, f)} ORDER BY ${p.id} DESC LIMIT ${BILLING_PAGE_SIZE} OFFSET ${(page - 1) * BILLING_PAGE_SIZE}`,
    );
    return {
      rows,
      total,
      pages,
      filters: { ...f, page },
      clamped: page !== f.page,
      options: choices,
    };
  });
}
export async function readBillingRecord(
  session: Session | null,
  kind: BillingKind,
  rawId: string,
  db: PrismaClient,
  allocationPage = '1',
) {
  authorize(session);
  billingDefaults(kind);
  const id = clientId(rawId),
    requested = pageNumber(allocationPage);
  if (id === null) return null;
  return snapshot(db, session, async (tx) => {
    const p = parts(kind),
      rows = await tx.$queryRaw<BillingRecord[]>(
        Prisma.sql`SELECT ${p.projection} ${p.joins} WHERE ${p.id}=${id}`,
      );
    if (!rows[0]) return null;
    if (kind === 'payments')
      return {
        record: rows[0],
        payments: [],
        paymentCount: 0,
        allocations: [],
        allocationCount: 0,
        allocationPage: 1,
        allocationPages: 1,
      };
    const [counts] = await tx.$queryRaw<{ payments: number; allocations: number }[]>(
      Prisma.sql`SELECT (SELECT count(*)::int FROM public.payments WHERE invoice_id=${id}) payments,(SELECT count(*)::int FROM public.invoice_allocations WHERE invoice_id=${id}) allocations`,
    );
    const pages = Math.max(1, Math.ceil(counts!.allocations / BILLING_PAGE_SIZE)),
      page = Math.min(requested, pages);
    const payments = await tx.$queryRaw<BillingRecord[]>(
      Prisma.sql`SELECT ${paymentProjection} ${paymentJoin} WHERE p.invoice_id=${id} ORDER BY p.id DESC LIMIT ${BILLING_PAGE_SIZE}`,
    );
    const allocations = await tx.$queryRaw<BillingAllocation[]>(
      Prisma.sql`SELECT a.id,a.person_id AS "personId",p.name_ar AS "personName",p.is_active active,r.label_ar role,a.share::text share FROM public.invoice_allocations a LEFT JOIN public.people p ON p.id=a.person_id LEFT JOIN public.lookup_lawyer_share_role r ON r.id=a.lawyer_role_id WHERE a.invoice_id=${id} ORDER BY a.id DESC LIMIT ${BILLING_PAGE_SIZE} OFFSET ${(page - 1) * BILLING_PAGE_SIZE}`,
    );
    return {
      record: rows[0],
      payments,
      paymentCount: counts!.payments,
      allocations,
      allocationCount: counts!.allocations,
      allocationPage: page,
      allocationPages: pages,
    };
  });
}
