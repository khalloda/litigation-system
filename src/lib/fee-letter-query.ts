import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from './auth/authorization-core';
import { clientId, type ClientSearchParams } from './client-query';

export class FeeLetterFilterError extends Error {}
export const FEE_LETTER_PAGE_SIZE = 25;
export type FeeLetterFilters = {
  q: string;
  page: number;
  archive: 'current' | 'archived' | 'all';
  client: string;
  covered: string;
  referencing: string;
  mfiles: 'all' | 'present' | 'missing';
};
export type FeeLetterMatterLink = {
  id: number;
  matterId: number;
  matterNumber: string | null;
  matterArchived: boolean;
  retired: boolean;
  original: boolean;
  order: number | null;
  sourceReference: string | null;
};
export type FeeLetterRecord = {
  id: number;
  contractId: number | null;
  version: string;
  archived: boolean;
  clientId: number | null;
  clientName: string | null;
  clientArchived: boolean;
  sourceClientName: string | null;
  mfilesId: string | null;
  sourceMfilesId: string | null;
  contractType: string | null;
  contractDate: string | null;
  contractDetails: string | null;
  contractStructure: string | null;
  sourceStatus: string | null;
  covered: FeeLetterMatterLink[];
  referencing: FeeLetterMatterLink[];
  invoiceCount: number;
  forwardQuarantineCount: number;
  reverseQuarantineCount: number;
};
type FilterOption = { kind: string; id: number; name: string; archived: boolean };
function one(params: ClientSearchParams, key: string, fallback: string) {
  const value = new Map(Object.entries(params)).get(key);
  if (Array.isArray(value)) throw new FeeLetterFilterError('repeated filter');
  return value ?? fallback;
}
export function parseFeeLetterFilters(params: ClientSearchParams): FeeLetterFilters {
  const allowed = ['q', 'page', 'archive', 'client', 'covered', 'referencing', 'mfiles'];
  if (Object.keys(params).some((key) => !allowed.includes(key)))
    throw new FeeLetterFilterError('unknown filter');
  const q = one(params, 'q', '').trim();
  const page = clientId(one(params, 'page', '1'));
  const archive = one(params, 'archive', 'current');
  const client = one(params, 'client', 'all');
  const covered = one(params, 'covered', 'all');
  const referencing = one(params, 'referencing', 'all');
  const mfiles = one(params, 'mfiles', 'all');
  if (
    page === null ||
    q.length > 160 ||
    /[\u0000-\u001f\u007f]/u.test(q) ||
    !['current', 'archived', 'all'].includes(archive) ||
    !['all', 'present', 'missing'].includes(mfiles) ||
    [client, covered, referencing].some(
      (value) => !['all', 'missing'].includes(value) && clientId(value) === null,
    )
  )
    throw new FeeLetterFilterError('invalid filter');
  return { q, page, archive, client, covered, referencing, mfiles } as FeeLetterFilters;
}
export function feeLetterListHref(filters: FeeLetterFilters, page = filters.page) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page }))
    if (
      key === 'q'
        ? !!value
        : key === 'page'
          ? value !== 1
          : key === 'archive'
            ? value !== 'current'
            : value !== 'all'
    )
      query.set(key, String(value));
  return '/fee-letters' + (query.size ? '?' + query.toString() : '');
}
export function feeLetterDetailHref(id: number, filters: FeeLetterFilters, suffix = '') {
  return `/fee-letters/${id}${suffix}${feeLetterListHref(filters).slice('/fee-letters'.length)}`;
}
const joins = Prisma.sql`FROM public.fee_letters f LEFT JOIN public.clients c ON c.id=f.client_id`;
const pattern = (q: string) =>
  Prisma.sql`('%'||public.ar_normalise(${q.replace(/[\\%_]/gu, '\\$&')})||'%')`;
function where(filters: FeeLetterFilters) {
  const conditions = [Prisma.sql`true`];
  if (filters.archive !== 'all')
    conditions.push(Prisma.sql`f.is_archived=${filters.archive === 'archived'}`);
  if (filters.client === 'missing') conditions.push(Prisma.sql`f.client_id IS NULL`);
  else if (filters.client !== 'all')
    conditions.push(Prisma.sql`f.client_id=${Number(filters.client)}`);
  if (filters.covered === 'missing')
    conditions.push(Prisma.sql`NOT EXISTS(SELECT 1 FROM public.fee_letter_matters l
      WHERE l.fee_letter_id=f.id AND NOT l.is_retired)`);
  else if (filters.covered !== 'all')
    conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM public.fee_letter_matters l
      WHERE l.fee_letter_id=f.id AND NOT l.is_retired AND l.matter_id=${Number(filters.covered)})`);
  if (filters.referencing === 'missing')
    conditions.push(Prisma.sql`NOT EXISTS(SELECT 1 FROM public.matter_fee_letter_references r
      WHERE r.fee_letter_id=f.id AND NOT r.is_retired)`);
  else if (filters.referencing !== 'all')
    conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM public.matter_fee_letter_references r
      WHERE r.fee_letter_id=f.id AND NOT r.is_retired AND r.matter_id=${Number(filters.referencing)})`);
  if (filters.mfiles === 'present') conditions.push(Prisma.sql`f.mfiles_id IS NOT NULL`);
  if (filters.mfiles === 'missing') conditions.push(Prisma.sql`f.mfiles_id IS NULL`);
  if (filters.q)
    conditions.push(Prisma.sql`(
      f.id::text=public.ar_normalise(${filters.q}) OR f.contract_id::text=public.ar_normalise(${filters.q})
      OR EXISTS(SELECT 1 FROM unnest(ARRAY[f.mfiles_id,f.legacy_mfiles_id_raw,f.client_name,
        f.contract_type,f.contract_details,f.contract_structure,f.status,c.name_ar,c.full_name,c.name_en]) value
        WHERE public.ar_normalise(value) LIKE ${pattern(filters.q)})
      OR EXISTS(SELECT 1 FROM public.fee_letter_matters l JOIN public.matters m ON m.id=l.matter_id
        WHERE l.fee_letter_id=f.id AND (NOT l.is_retired OR l.legacy_source_record_key IS NOT NULL)
        AND (public.ar_normalise(m.case_number_ar) LIKE ${pattern(filters.q)}
          OR public.ar_normalise(l.legacy_matter_ref) LIKE ${pattern(filters.q)}))
      OR EXISTS(SELECT 1 FROM public.matter_fee_letter_references r JOIN public.matters m ON m.id=r.matter_id
        WHERE r.fee_letter_id=f.id AND (NOT r.is_retired OR r.legacy_source_record_key IS NOT NULL)
        AND (public.ar_normalise(m.case_number_ar) LIKE ${pattern(filters.q)}
          OR public.ar_normalise(r.legacy_reference_raw) LIKE ${pattern(filters.q)}))
    )`);
  return Prisma.join(conditions, ' AND ');
}
const projection = Prisma.sql`f.id,f.contract_id AS "contractId",f.row_version::text version,
 f.is_archived archived,f.client_id AS "clientId",c.name_ar AS "clientName",
 coalesce(c.is_archived,false) AS "clientArchived",f.client_name AS "sourceClientName",
 f.mfiles_id AS "mfilesId",f.legacy_mfiles_id_raw AS "sourceMfilesId",
 f.contract_type AS "contractType",f.contract_date::text AS "contractDate",
 f.contract_details AS "contractDetails",f.contract_structure AS "contractStructure",
 f.status AS "sourceStatus",
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'matterId',l.matter_id,
   'matterNumber',m.case_number_ar,'matterArchived',coalesce(m.is_archived,false),
   'retired',l.is_retired,'original',l.legacy_source_record_key IS NOT NULL,
   'order',coalesce(l.current_order,l.ordinal+1),'sourceReference',l.legacy_matter_ref)
   ORDER BY coalesce(l.current_order,l.ordinal+1),l.id),'[]')
  FROM public.fee_letter_matters l LEFT JOIN public.matters m ON m.id=l.matter_id
  WHERE l.fee_letter_id=f.id) covered,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'matterId',r.matter_id,
   'matterNumber',m.case_number_ar,'matterArchived',coalesce(m.is_archived,false),
   'retired',r.is_retired,'original',r.legacy_source_record_key IS NOT NULL,
   'order',NULL,'sourceReference',r.legacy_reference_raw) ORDER BY m.case_number_ar COLLATE "arabic",r.id),'[]')
  FROM public.matter_fee_letter_references r JOIN public.matters m ON m.id=r.matter_id
  WHERE r.fee_letter_id=f.id) referencing,
 (SELECT count(*)::int FROM public.invoices i WHERE i.fee_letter_id=f.id) AS "invoiceCount",
 public.fee_letter_edit_forward_quarantine_count(f.contract_id) AS "forwardQuarantineCount",
 public.fee_letter_edit_reverse_quarantine_count(f.legacy_source_record_key) AS "reverseQuarantineCount"`;
function authorize(session: Session | null) {
  requireAuthorizedDecision(decideAuthorization(session, 'feeLetters', 'view'));
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
      const valid = await tx.$queryRaw<
        { id: number }[]
      >(Prisma.sql`SELECT u.id FROM public.user_accounts u
      JOIN public.people p ON p.id=u.person_id WHERE u.id=${Number(session.user.id)}
      AND u.person_id=${session.user.personId} AND u.role_code=${session.user.role}
      AND u.session_version=${session.user.sessionVersion} AND u.is_enabled
      AND u.password_hash IS NOT NULL AND NOT u.must_change_password
      AND p.is_staff AND p.is_active AND p.can_login`);
      if (valid.length !== 1 || !(Date.parse(session.expires) > Date.now()))
        throw new AuthorizationError('unauthenticated');
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
export async function readFeeLetters(
  session: Session | null,
  params: ClientSearchParams,
  db: PrismaClient,
) {
  authorize(session);
  const filters = parseFeeLetterFilters(params);
  return snapshot(db, session!, async (tx) => {
    if (
      filters.client !== 'all' &&
      filters.client !== 'missing' &&
      !(
        await tx.$queryRaw<{ ok: boolean }[]>(
          Prisma.sql`SELECT EXISTS(SELECT 1 FROM public.clients WHERE id=${Number(filters.client)}) ok`,
        )
      )[0]?.ok
    )
      throw new FeeLetterFilterError('unknown identity');
    for (const value of [filters.covered, filters.referencing])
      if (
        value !== 'all' &&
        value !== 'missing' &&
        !(
          await tx.$queryRaw<{ ok: boolean }[]>(
            Prisma.sql`SELECT EXISTS(SELECT 1 FROM public.matters WHERE id=${Number(value)}) ok`,
          )
        )[0]?.ok
      )
        throw new FeeLetterFilterError('unknown identity');
    const counts = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT count(*)::int total ${joins} WHERE ${where(filters)}`,
    );
    if (counts.length !== 1) throw new Error('fee-letter count cardinality');
    const total = counts[0]!.total;
    const pages = Math.max(1, Math.ceil(total / FEE_LETTER_PAGE_SIZE));
    const page = Math.min(filters.page, pages);
    const rows = await tx.$queryRaw<FeeLetterRecord[]>(Prisma.sql`SELECT ${projection} ${joins}
      WHERE ${where(filters)} ORDER BY f.id DESC LIMIT ${FEE_LETTER_PAGE_SIZE}
      OFFSET ${(page - 1) * FEE_LETTER_PAGE_SIZE}`);
    if (
      rows.length !==
        Math.min(FEE_LETTER_PAGE_SIZE, Math.max(0, total - (page - 1) * FEE_LETTER_PAGE_SIZE)) ||
      new Set(rows.map((row) => row.id)).size !== rows.length
    )
      throw new Error('fee-letter page cardinality');
    const clients = await tx.client.findMany({
      select: { id: true, nameAr: true, isArchived: true },
      orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
    });
    const matters = await tx.matter.findMany({
      select: { id: true, caseNumberAr: true, isArchived: true },
      orderBy: [{ caseNumberAr: 'asc' }, { id: 'asc' }],
    });
    const options: FilterOption[] = [
      ...clients.map((row) => ({
        kind: 'client',
        id: row.id,
        name: row.nameAr,
        archived: row.isArchived,
      })),
      ...matters.map((row) => ({
        kind: 'matter',
        id: row.id,
        name: row.caseNumberAr ?? String(row.id),
        archived: row.isArchived,
      })),
    ];
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
export async function readFeeLetter(
  session: Session | null,
  rawId: string,
  db: PrismaClient,
): Promise<FeeLetterRecord | null> {
  authorize(session);
  const id = clientId(rawId);
  if (id === null) return null;
  return snapshot(db, session!, async (tx) => {
    const rows = await tx.$queryRaw<FeeLetterRecord[]>(
      Prisma.sql`SELECT ${projection} ${joins} WHERE f.id=${id}`,
    );
    if (rows.length > 1) throw new Error('fee-letter identity cardinality');
    return rows[0] ?? null;
  });
}
