import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from './auth/authorization-core';
import { clientId, type ClientSearchParams } from './client-query';

export class DocumentFilterError extends Error {}
export const DOCUMENT_PAGE_SIZE = 25;
export type DocumentFilters = {
  q: string;
  page: number;
  archive: 'current' | 'archived' | 'all';
  client: string;
  matter: string;
  person: string;
  mfiles: 'all' | 'present' | 'missing';
};
export type DocumentRecord = {
  id: number;
  legacyId: number | null;
  version: string;
  archived: boolean;
  description: string | null;
  documentDate: string | null;
  depositDate: string | null;
  pageCount: number | null;
  clientId: number | null;
  clientName: string | null;
  clientArchived: boolean;
  matterId: number | null;
  matterNumber: string | null;
  matterArchived: boolean;
  personId: number | null;
  personName: string | null;
  personActive: boolean;
  movementCard: string | null;
  storageLocation: string | null;
  notes: string | null;
  mfilesId: string | null;
  sourceClient: string | null;
  sourceMatter: string | null;
  sourcePerson: string | null;
  sourcePageCount: string | null;
  sourceMfiles: string | null;
  evidenceCount: number;
};
type FilterOption = { kind: string; id: number; name: string; archived: boolean };
function one(params: ClientSearchParams, key: string, fallback: string) {
  const value = new Map(Object.entries(params)).get(key);
  if (Array.isArray(value)) throw new DocumentFilterError('repeated filter');
  return value ?? fallback;
}
export function parseDocumentFilters(params: ClientSearchParams): DocumentFilters {
  const allowed = ['q', 'page', 'archive', 'client', 'matter', 'person', 'mfiles'];
  if (Object.keys(params).some((key) => !allowed.includes(key)))
    throw new DocumentFilterError('unknown filter');
  const q = one(params, 'q', '').trim();
  const page = clientId(one(params, 'page', '1'));
  const archive = one(params, 'archive', 'current');
  const client = one(params, 'client', 'all');
  const matter = one(params, 'matter', 'all');
  const person = one(params, 'person', 'all');
  const mfiles = one(params, 'mfiles', 'all');
  if (
    page === null ||
    q.length > 160 ||
    /[\u0000-\u001f\u007f]/u.test(q) ||
    !['current', 'archived', 'all'].includes(archive) ||
    !['all', 'present', 'missing'].includes(mfiles) ||
    [client, matter, person].some(
      (value) => !['all', 'missing'].includes(value) && clientId(value) === null,
    )
  )
    throw new DocumentFilterError('invalid filter');
  return { q, page, archive, client, matter, person, mfiles } as DocumentFilters;
}
export function documentListHref(filters: DocumentFilters, page = filters.page) {
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
  return '/documents' + (query.size ? '?' + query.toString() : '');
}
export function documentDetailHref(id: number, filters: DocumentFilters, suffix = '') {
  return `/documents/${id}${suffix}${documentListHref(filters).slice('/documents'.length)}`;
}
const joins = Prisma.sql`FROM public.documents d
 LEFT JOIN public.clients c ON c.id=d.client_id
 LEFT JOIN public.matters m ON m.id=d.matter_id
 LEFT JOIN public.people p ON p.id=d.responsible_person_id`;
const pattern = (q: string) =>
  Prisma.sql`('%'||public.ar_normalise(${q.replace(/[\\%_]/gu, '\\$&')})||'%')`;
function where(filters: DocumentFilters) {
  const conditions = [Prisma.sql`true`];
  if (filters.archive !== 'all')
    conditions.push(Prisma.sql`d.is_archived=${filters.archive === 'archived'}`);
  for (const [key, column] of [
    [filters.client, Prisma.sql`d.client_id`],
    [filters.matter, Prisma.sql`d.matter_id`],
    [filters.person, Prisma.sql`d.responsible_person_id`],
  ] as const) {
    if (key === 'missing') conditions.push(Prisma.sql`${column} IS NULL`);
    else if (key !== 'all') conditions.push(Prisma.sql`${column}=${Number(key)}`);
  }
  if (filters.mfiles === 'present') conditions.push(Prisma.sql`d.mfiles_id IS NOT NULL`);
  if (filters.mfiles === 'missing') conditions.push(Prisma.sql`d.mfiles_id IS NULL`);
  if (filters.q)
    conditions.push(Prisma.sql`(
      d.id::text=public.ar_normalise(${filters.q})
      OR d.legacy_id::text=public.ar_normalise(${filters.q})
      OR EXISTS(SELECT 1 FROM unnest(ARRAY[d.description,d.movement_card,d.storage_location,
        d.notes,d.mfiles_id,d.legacy_client_name_raw,d.legacy_matter_ref_raw,
        d.legacy_responsible_raw,d.legacy_page_count_raw,c.name_ar,c.full_name,c.name_en,
        m.case_number_ar,m.subject,p.name_ar]) value
        WHERE public.ar_normalise(value) LIKE ${pattern(filters.q)})
      OR EXISTS(SELECT 1 FROM public.person_name_alias a WHERE a.person_id=p.id
        AND NOT a.is_retired AND public.ar_normalise(a.alias_ar) LIKE ${pattern(filters.q)})
    )`);
  return Prisma.join(conditions, ' AND ');
}
const projection = Prisma.sql`d.id,d.legacy_id AS "legacyId",d.row_version::text version,
 d.is_archived archived,d.description,d.document_date::text AS "documentDate",
 d.deposit_date::text AS "depositDate",d.page_count AS "pageCount",
 d.client_id AS "clientId",c.name_ar AS "clientName",coalesce(c.is_archived,false) AS "clientArchived",
 d.matter_id AS "matterId",m.case_number_ar AS "matterNumber",coalesce(m.is_archived,false) AS "matterArchived",
 d.responsible_person_id AS "personId",p.name_ar AS "personName",coalesce(p.is_active,false) AS "personActive",
 d.movement_card AS "movementCard",d.storage_location AS "storageLocation",d.notes,
 d.mfiles_id AS "mfilesId",d.legacy_client_name_raw AS "sourceClient",
 d.legacy_matter_ref_raw AS "sourceMatter",d.legacy_responsible_raw AS "sourcePerson",
 d.legacy_page_count_raw AS "sourcePageCount",d.legacy_mfiles_id_raw AS "sourceMfiles",
 public.document_edit_evidence_count(d.legacy_source_record_key) AS "evidenceCount"`;
function authorize(session: Session | null) {
  requireAuthorizedDecision(decideAuthorization(session, 'documents', 'view'));
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
      const valid = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT u.id
       FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
       WHERE u.id=${Number(session.user.id)} AND u.person_id=${session.user.personId}
        AND u.role_code=${session.user.role} AND u.session_version=${session.user.sessionVersion}
        AND u.is_enabled AND u.password_hash IS NOT NULL AND NOT u.must_change_password
        AND p.is_staff AND p.is_active AND p.can_login`);
      if (valid.length !== 1 || !(Date.parse(session.expires) > Date.now()))
        throw new AuthorizationError('unauthenticated');
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
export async function readDocuments(
  session: Session | null,
  params: ClientSearchParams,
  db: PrismaClient,
) {
  authorize(session);
  const filters = parseDocumentFilters(params);
  return snapshot(db, session!, async (tx) => {
    if (
      filters.client !== 'all' &&
      filters.client !== 'missing' &&
      !(
        await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`SELECT EXISTS(
        SELECT 1 FROM public.clients WHERE id=${Number(filters.client)}) ok`)
      )[0]?.ok
    )
      throw new DocumentFilterError('unknown identity');
    if (
      filters.matter !== 'all' &&
      filters.matter !== 'missing' &&
      !(
        await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`SELECT EXISTS(
        SELECT 1 FROM public.matters WHERE id=${Number(filters.matter)}) ok`)
      )[0]?.ok
    )
      throw new DocumentFilterError('unknown identity');
    if (
      filters.person !== 'all' &&
      filters.person !== 'missing' &&
      !(
        await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`SELECT EXISTS(
        SELECT 1 FROM public.people WHERE id=${Number(filters.person)}) ok`)
      )[0]?.ok
    )
      throw new DocumentFilterError('unknown identity');
    const counts = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT count(*)::int total ${joins} WHERE ${where(filters)}`,
    );
    if (counts.length !== 1) throw new Error('document count cardinality');
    const total = counts[0]!.total;
    const pages = Math.max(1, Math.ceil(total / DOCUMENT_PAGE_SIZE));
    const page = Math.min(filters.page, pages);
    const rows = await tx.$queryRaw<DocumentRecord[]>(Prisma.sql`SELECT ${projection} ${joins}
      WHERE ${where(filters)} ORDER BY d.id DESC LIMIT ${DOCUMENT_PAGE_SIZE}
      OFFSET ${(page - 1) * DOCUMENT_PAGE_SIZE}`);
    if (
      rows.length !==
        Math.min(DOCUMENT_PAGE_SIZE, Math.max(0, total - (page - 1) * DOCUMENT_PAGE_SIZE)) ||
      new Set(rows.map((row) => row.id)).size !== rows.length
    )
      throw new Error('document page cardinality');
    const clients = await tx.client.findMany({
      select: { id: true, nameAr: true, isArchived: true },
      orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
    });
    const matters = await tx.matter.findMany({
      select: { id: true, caseNumberAr: true, isArchived: true },
      orderBy: [{ caseNumberAr: 'asc' }, { id: 'asc' }],
    });
    const people = await tx.person.findMany({
      select: { id: true, nameAr: true, isActive: true },
      orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
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
      ...people.map((row) => ({
        kind: 'person',
        id: row.id,
        name: row.nameAr,
        archived: !row.isActive,
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
export async function readDocument(
  session: Session | null,
  rawId: string,
  db: PrismaClient,
): Promise<DocumentRecord | null> {
  authorize(session);
  const id = clientId(rawId);
  if (id === null) return null;
  return snapshot(db, session!, async (tx) => {
    const rows = await tx.$queryRaw<DocumentRecord[]>(
      Prisma.sql`SELECT ${projection} ${joins} WHERE d.id=${id}`,
    );
    if (rows.length > 1) throw new Error('document identity cardinality');
    return rows[0] ?? null;
  });
}
