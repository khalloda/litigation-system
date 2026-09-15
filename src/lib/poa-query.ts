import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from './auth/authorization-core';
import { clientId, type ClientSearchParams } from './client-query';
export class PoaFilterError extends Error {}
export const POA_PAGE_SIZE = 25;
export type PoaFilters = {
  q: string;
  page: number;
  archive: 'current' | 'archived' | 'all';
  client: string;
  lawyer: string;
  copies: 'all' | 'zero' | 'positive' | 'unknown';
  report: 'all' | 'shown' | 'hidden' | 'unknown';
};
export function parsePoaFilters(params: ClientSearchParams): PoaFilters {
  const keys = ['q', 'page', 'archive', 'client', 'lawyer', 'copies', 'report'];
  if (Object.keys(params).some((k) => !keys.includes(k)))
    throw new PoaFilterError('unknown filter');
  const one = (k: string, fallback: string) => {
    const v = new Map(Object.entries(params)).get(k);
    if (Array.isArray(v)) throw new PoaFilterError('repeated filter');
    return v ?? fallback;
  };
  const q = one('q', '').trim(),
    page = clientId(one('page', '1'));
  if (page === null || q.length > 160 || /[\u0000-\u001f\u007f]/u.test(q))
    throw new PoaFilterError('invalid search');
  const archive = one('archive', 'current'),
    client = one('client', 'all'),
    lawyer = one('lawyer', 'all'),
    copies = one('copies', 'all'),
    report = one('report', 'all');
  if (
    !['current', 'archived', 'all'].includes(archive) ||
    !['all', 'zero', 'positive', 'unknown'].includes(copies) ||
    !['all', 'shown', 'hidden', 'unknown'].includes(report) ||
    [client, lawyer].some((v) => !['all', 'missing'].includes(v) && clientId(v) === null)
  )
    throw new PoaFilterError('invalid filter');
  return { q, page, archive, client, lawyer, copies, report } as PoaFilters;
}
export function poaListHref(f: PoaFilters, page = f.page) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, page }))
    if (k === 'q' ? !!v : k === 'page' ? v !== 1 : k === 'archive' ? v !== 'current' : v !== 'all')
      p.set(k, String(v));
  return '/powers-of-attorney' + (p.size ? '?' + p.toString() : '');
}
export function poaDetailHref(id: number, f: PoaFilters, suffix = '') {
  return `/powers-of-attorney/${id}${suffix}${poaListHref(f).slice('/powers-of-attorney'.length)}`;
}
export type PoaLawyer = {
  id: number;
  personId: number;
  name: string;
  active: boolean;
  staff: boolean;
  retired: boolean;
  original: boolean;
  order: number;
};
export type PoaRecord = {
  id: number;
  version: string;
  archived: boolean;
  clientId: number | null;
  clientName: string | null;
  clientArchived: boolean;
  sourceClient: string | null;
  sourceLawyers: string | null;
  serial: string | null;
  principal: string | null;
  capacity: string | null;
  number: string | null;
  letter: string | null;
  year: string | null;
  issuer: string | null;
  issueDate: string | null;
  copies: number | null;
  report: boolean | null;
  notes: string | null;
  lawyers: PoaLawyer[];
  aliasMatches: string[];
};
export type PoaOption = {
  kind: 'client' | 'lawyer';
  id: number;
  name: string;
  archived: boolean;
  inactive: boolean;
  staff: boolean;
};
const joins = Prisma.sql`FROM public.powers_of_attorney p LEFT JOIN public.clients c ON c.id=p.client_id`;
const pattern = (q: string) =>
  Prisma.sql`('%'||public.ar_normalise(${q.replace(/[\\%_]/gu, '\\$&')})||'%')`;
function where(f: PoaFilters) {
  const conditions = [Prisma.sql`true`];
  if (f.archive !== 'all') conditions.push(Prisma.sql`p.is_archived=${f.archive === 'archived'}`);
  if (f.client === 'missing') conditions.push(Prisma.sql`p.client_id IS NULL`);
  else if (f.client !== 'all') conditions.push(Prisma.sql`p.client_id=${Number(f.client)}`);
  if (f.lawyer === 'missing')
    conditions.push(
      Prisma.sql`NOT EXISTS(SELECT 1 FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p.id AND NOT l.is_retired)`,
    );
  else if (f.lawyer !== 'all')
    conditions.push(
      Prisma.sql`EXISTS(SELECT 1 FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p.id AND NOT l.is_retired AND l.person_id=${Number(f.lawyer)})`,
    );
  if (f.copies === 'unknown') conditions.push(Prisma.sql`p.copies_count IS NULL`);
  else if (f.copies === 'zero') conditions.push(Prisma.sql`p.copies_count=0`);
  else if (f.copies === 'positive') conditions.push(Prisma.sql`p.copies_count>0`);
  if (f.report === 'unknown') conditions.push(Prisma.sql`p.show_on_poa_report IS NULL`);
  else if (f.report !== 'all')
    conditions.push(Prisma.sql`p.show_on_poa_report=${f.report === 'shown'}`);
  if (f.q)
    conditions.push(Prisma.sql`(p.id::text=public.ar_normalise(${f.q})
 OR EXISTS(SELECT 1 FROM unnest(ARRAY[p.principal_name,p.poa_capacity,p.poa_number,p.poa_letter,p.poa_year,concat_ws(' / ',p.poa_number,p.poa_letter,p.poa_year),p.serial_no,p.issuing_authority,p.notes,p.client_name,p.legacy_lawyers_raw,c.name_ar,c.full_name,c.name_en]) field WHERE public.ar_normalise(field) LIKE ${pattern(f.q)})
 OR EXISTS(SELECT 1 FROM public.power_of_attorney_lawyers l JOIN public.people person ON person.id=l.person_id WHERE l.power_of_attorney_id=p.id AND (NOT l.is_retired OR l.legacy_source_record_key IS NOT NULL) AND (public.ar_normalise(person.name_ar) LIKE ${pattern(f.q)} OR EXISTS(SELECT 1 FROM public.person_name_alias a WHERE a.person_id=person.id AND NOT a.is_retired AND public.ar_normalise(a.alias_ar) LIKE ${pattern(f.q)}))))`);
  return Prisma.join(conditions, ' AND ');
}
function projection(q: string) {
  return Prisma.sql`p.id,p.row_version::text version,p.is_archived archived,p.client_id AS "clientId",c.name_ar AS "clientName",coalesce(c.is_archived,false) AS "clientArchived",p.client_name AS "sourceClient",p.legacy_lawyers_raw AS "sourceLawyers",p.serial_no serial,p.principal_name principal,p.poa_capacity capacity,p.poa_number number,p.poa_letter letter,p.poa_year AS "year",p.issuing_authority issuer,p.issue_date::text AS "issueDate",p.copies_count copies,p.show_on_poa_report report,p.notes,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'personId',l.person_id,'name',person.name_ar,'active',person.is_active,'staff',person.is_staff,'retired',l.is_retired,'original',l.legacy_source_record_key IS NOT NULL,'order',coalesce(l.current_order,l.source_member_ordinal)) ORDER BY (l.current_order IS NOT NULL),l.source_member_ordinal NULLS LAST,l.current_order,l.id),'[]') FROM public.power_of_attorney_lawyers l JOIN public.people person ON person.id=l.person_id WHERE l.power_of_attorney_id=p.id) lawyers,
 ARRAY(SELECT DISTINCT a.alias_ar FROM public.power_of_attorney_lawyers l JOIN public.person_name_alias a ON a.person_id=l.person_id WHERE l.power_of_attorney_id=p.id AND (NOT l.is_retired OR l.legacy_source_record_key IS NOT NULL) AND NOT a.is_retired AND ${q !== ''} AND public.ar_normalise(a.alias_ar) LIKE ${pattern(q)} ORDER BY a.alias_ar) AS "aliasMatches"`;
}
export function poaCountQuery(f: PoaFilters) {
  return Prisma.sql`SELECT count(*)::int total ${joins} WHERE ${where(f)}`;
}
export function poaRowsQuery(f: PoaFilters, page: number) {
  return Prisma.sql`SELECT ${projection(f.q)} ${joins} WHERE ${where(f)} ORDER BY p.id DESC LIMIT ${POA_PAGE_SIZE} OFFSET ${(page - 1) * POA_PAGE_SIZE}`;
}
export function poaDetailQuery(id: number) {
  return Prisma.sql`SELECT ${projection('')} ${joins} WHERE p.id=${id}`;
}
export function poaOptionsQuery() {
  return Prisma.sql`SELECT * FROM (
 SELECT 'client' kind,id,name_ar name,is_archived archived,false inactive,false staff FROM public.clients
 UNION ALL SELECT 'lawyer',p.id,p.name_ar,false,NOT p.is_active,p.is_staff FROM public.people p WHERE EXISTS(SELECT 1 FROM public.power_of_attorney_lawyers l WHERE l.person_id=p.id)
 ) x ORDER BY kind,name COLLATE "arabic",id`;
}
function authorize(session: Session | null) {
  requireAuthorizedDecision(decideAuthorization(session, 'powersOfAttorney', 'view'));
  if (!session || !(Date.parse(session.expires) > Date.now()))
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
      const accounts = await tx.$queryRaw<{ id: number }[]>(
        Prisma.sql`SELECT u.id FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.id=${Number(session.user.id)} AND u.person_id=${session.user.personId} AND u.role_code=${session.user.role} AND u.session_version=${session.user.sessionVersion} AND u.is_enabled AND u.password_hash IS NOT NULL AND NOT u.must_change_password AND p.is_staff AND p.is_active AND p.can_login`,
      );
      if (accounts.length !== 1 || !(Date.parse(session.expires) > Date.now()))
        throw new AuthorizationError('unauthenticated');
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
export async function readPoas(
  session: Session | null,
  params: ClientSearchParams,
  db: PrismaClient,
) {
  authorize(session);
  const filters = parsePoaFilters(params);
  return snapshot(db, session!, async (tx) => {
    const options = await tx.$queryRaw<PoaOption[]>(Prisma.sql`${poaOptionsQuery()}`);
    for (const key of ['client', 'lawyer'] as const)
      if (
        !['all', 'missing'].includes(String(new Map(Object.entries(filters)).get(key)!)) &&
        !options.some(
          (o) => o.kind === key && o.id === Number(new Map(Object.entries(filters)).get(key)!),
        )
      )
        throw new PoaFilterError('unknown identity');
    const counts = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`${poaCountQuery(filters)}`);
    if (counts.length !== 1) throw new Error('POA count cardinality');
    const total = counts[0]!.total,
      pages = Math.max(1, Math.ceil(total / POA_PAGE_SIZE)),
      page = Math.min(filters.page, pages);
    const rows = await tx.$queryRaw<PoaRecord[]>(Prisma.sql`${poaRowsQuery(filters, page)}`);
    if (
      rows.length !== Math.min(POA_PAGE_SIZE, Math.max(0, total - (page - 1) * POA_PAGE_SIZE)) ||
      new Set(rows.map((r) => r.id)).size !== rows.length
    )
      throw new Error('POA page cardinality');
    return {
      rows,
      total,
      pages,
      options,
      filters: { ...filters, page },
      clamped: page !== filters.page,
    };
  });
}
export async function readPoa(
  session: Session | null,
  rawId: string,
  db: PrismaClient,
): Promise<PoaRecord | null> {
  authorize(session);
  const id = clientId(rawId);
  if (id === null) return null;
  return snapshot(db, session!, async (tx) => {
    const rows = await tx.$queryRaw<PoaRecord[]>(Prisma.sql`${poaDetailQuery(id)}`);
    if (rows.length > 1) throw new Error('POA identity cardinality');
    return rows[0] ?? null;
  });
}
