import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import { decideAuthorization, requireAuthorizedDecision } from '@/lib/auth/authorization-core';

export const CLIENT_PAGE_SIZE = 25;
export const CLIENT_SEARCH_LIMIT = 160;
export type ClientSearchParams = Record<string, string | string[] | undefined>;
export type ClientFilters = {
  q: string;
  status: 'all' | 'Active' | 'Disabled' | 'Potential' | 'missing';
  archive: 'current' | 'archived' | 'all';
  page: number;
};
export class ClientFilterError extends Error {}
export function clientId(value: string): number | null {
  return /^[1-9]\d{0,9}$/u.test(value) && Number(value) <= 2_147_483_647 ? Number(value) : null;
}
export function parseClientFilters(params: ClientSearchParams): ClientFilters {
  const single = (value: string | string[] | undefined, fallback: string) => {
    if (Array.isArray(value)) throw new ClientFilterError('repeated filter');
    return value ?? fallback;
  };
  const q = single(params.q, '').trim();
  const status = single(params.status, 'all');
  const archive = single(params.archive, 'current');
  const page = clientId(single(params.page, '1'));
  if (
    q.length > CLIENT_SEARCH_LIMIT ||
    /[\u0000-\u001f\u007f]/u.test(q) ||
    !['all', 'Active', 'Disabled', 'Potential', 'missing'].includes(status) ||
    !['current', 'archived', 'all'].includes(archive) ||
    page === null
  )
    throw new ClientFilterError('invalid filters');
  return {
    q,
    status: status as ClientFilters['status'],
    archive: archive as ClientFilters['archive'],
    page,
  };
}
export function clientListHref(filters: ClientFilters, page = filters.page): string {
  const params = new URLSearchParams({ status: filters.status, archive: filters.archive });
  if (filters.q) params.set('q', filters.q);
  if (page !== 1) params.set('page', String(page));
  return '/clients?' + params.toString();
}
export function clientDetailHref(id: number, filters: ClientFilters): string {
  return `/clients/${id}${clientListHref(filters).slice('/clients'.length)}`;
}
export type ClientRow = {
  id: number;
  legacyId: number | null;
  nameAr: string;
  nameEn: string | null;
  fullName: string | null;
  status: string | null;
  classification: string | null;
  isArchived: boolean;
  matchedContact: boolean;
};
export type ContactRow = {
  id: number;
  legacyId: number | null;
  clientId: number;
  contactName: string | null;
  fullName: string | null;
  jobTitle: string | null;
  isArchived: boolean;
};
export type ClientDetail = Omit<ClientRow, 'matchedContact'> & {
  poaLocation: string | null;
  documentsLocation: string | null;
  startDate: string | null;
  endDate: string | null;
  historicalLawyer: string | null;
  mainContact: ContactRow | null;
  matterCount: number;
};
export type ContactDetail = ContactRow & {
  clientName: string;
  parentArchived: boolean;
  email: string | null;
  mobilePhone: string | null;
  businessPhone: string | null;
  fax: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  stateProvince: string | null;
  countryRegion: string | null;
  postalCode: string | null;
};
export type LogoMetadata = {
  clientId: number;
  relativePath: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
};

const clientProjection = Prisma.sql`c.id,c.legacy_id AS "legacyId",c.name_ar AS "nameAr",c.name_en AS "nameEn",c.full_name AS "fullName",c.status,c.cash_or_probono AS classification,c.is_archived AS "isArchived"`;
const contactProjection = Prisma.sql`k.id,k.legacy_id AS "legacyId",k.client_id AS "clientId",k.contact_name AS "contactName",k.full_name AS "fullName",k.job_title AS "jobTitle",k.is_archived AS "isArchived"`;
function pattern(q: string) {
  return Prisma.sql`('%' || public.ar_normalise(${q.replace(/[\\%_]/gu, '\\$&')}) || '%')`;
}
function contactMatch(q: string) {
  return Prisma.sql`EXISTS (SELECT 1 FROM public.contacts k WHERE k.client_id=c.id AND (k.contact_name_normalised LIKE ${pattern(q)} OR public.ar_normalise(k.full_name) LIKE ${pattern(q)}))`;
}
function clientWhere(f: ClientFilters) {
  const predicates = [Prisma.sql`true`];
  if (f.archive !== 'all') predicates.push(Prisma.sql`c.is_archived=${f.archive === 'archived'}`);
  if (f.status === 'missing') predicates.push(Prisma.sql`(c.status IS NULL OR c.status='')`);
  else if (f.status !== 'all') predicates.push(Prisma.sql`c.status=${f.status}`);
  // Contact history remains searchable, including individually archived contacts.
  if (f.q)
    predicates.push(
      Prisma.sql`(c.name_ar_normalised LIKE ${pattern(f.q)} OR c.full_name_normalised LIKE ${pattern(f.q)} OR public.ar_normalise(c.name_en) LIKE ${pattern(f.q)} OR ${contactMatch(f.q)})`,
    );
  return Prisma.join(predicates, ' AND ');
}
export function clientCountQuery(f: ClientFilters) {
  return Prisma.sql`SELECT count(*)::integer total FROM public.clients c WHERE ${clientWhere(f)}`;
}
export function clientRowsQuery(f: ClientFilters, page: number) {
  return Prisma.sql`SELECT ${clientProjection},${f.q ? contactMatch(f.q) : Prisma.sql`false`} AS "matchedContact" FROM public.clients c WHERE ${clientWhere(f)} ORDER BY c.name_ar COLLATE "arabic",c.id LIMIT ${CLIENT_PAGE_SIZE} OFFSET ${(page - 1) * CLIENT_PAGE_SIZE}`;
}
export function clientDetailQuery(id: number) {
  return Prisma.sql`SELECT ${clientProjection},c.poa_location AS "poaLocation",c.documents_location AS "documentsLocation",c.client_start::text AS "startDate",c.client_end::text AS "endDate",c.legacy_contact_lawyer_raw AS "historicalLawyer",
    CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object('id',k.id,'legacyId',k.legacy_id,'clientId',k.client_id,'contactName',k.contact_name,'fullName',k.full_name,'jobTitle',k.job_title,'isArchived',k.is_archived) END AS "mainContact",
    (SELECT count(*)::integer FROM public.matters m WHERE m.client_id=c.id) AS "matterCount"
    FROM public.clients c LEFT JOIN public.contacts k ON k.id=c.contact_person_id AND k.client_id=c.id WHERE c.id=${id}`;
}
async function readClientSnapshot<T>(
  database: PrismaClient,
  read: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      return read(tx);
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
export async function readClients(
  session: Session | null,
  params: ClientSearchParams,
  database: PrismaClient,
) {
  requireAuthorizedDecision(decideAuthorization(session, 'clients', 'view'));
  requireAuthorizedDecision(decideAuthorization(session, 'contacts', 'view'));
  const filters = parseClientFilters(params);
  return readClientSnapshot(database, async (tx) => {
    const counts = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`${clientCountQuery(filters)}`,
    );
    if (counts.length !== 1) throw new Error('Client count cardinality differs');
    const total = counts[0]!.total;
    const pages = Math.max(1, Math.ceil(total / CLIENT_PAGE_SIZE));
    const page = Math.min(filters.page, pages);
    const rows = await tx.$queryRaw<ClientRow[]>(Prisma.sql`${clientRowsQuery(filters, page)}`);
    const expected = Math.min(CLIENT_PAGE_SIZE, Math.max(0, total - (page - 1) * CLIENT_PAGE_SIZE));
    if (rows.length !== expected || new Set(rows.map((r) => r.id)).size !== expected)
      throw new Error('Client page cardinality differs');
    return { rows, total, pages, filters: { ...filters, page } };
  });
}
export async function readClient(
  session: Session | null,
  rawId: string,
  database: PrismaClient,
): Promise<ClientDetail | null> {
  requireAuthorizedDecision(decideAuthorization(session, 'clients', 'view'));
  requireAuthorizedDecision(decideAuthorization(session, 'contacts', 'view'));
  const id = clientId(rawId);
  if (id === null) return null;
  return readClientSnapshot(database, async (tx) => {
    const rows = await tx.$queryRaw<ClientDetail[]>(Prisma.sql`${clientDetailQuery(id)}`);
    if (rows.length > 1) throw new Error('Client identity cardinality differs');
    return rows[0] ?? null;
  });
}
export async function readClientContacts(
  session: Session | null,
  rawId: string,
  pageText: string,
  database: PrismaClient,
) {
  requireAuthorizedDecision(decideAuthorization(session, 'contacts', 'view'));
  requireAuthorizedDecision(decideAuthorization(session, 'clients', 'view'));
  const id = clientId(rawId);
  const requested = clientId(pageText);
  if (requested === null) throw new ClientFilterError('invalid contacts page');
  if (id === null) return null;
  return readClientSnapshot(database, async (tx) => {
    const parents = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT (SELECT count(*)::integer FROM public.contacts k WHERE k.client_id=c.id) total FROM public.clients c WHERE c.id=${id}`,
    );
    if (!parents[0]) return null;
    if (parents.length !== 1) throw new Error('Contact parent cardinality differs');
    const total = parents[0].total;
    const pages = Math.max(1, Math.ceil(total / CLIENT_PAGE_SIZE));
    const page = Math.min(requested, pages);
    const rows = await tx.$queryRaw<ContactRow[]>(
      Prisma.sql`SELECT ${contactProjection} FROM public.contacts k WHERE k.client_id=${id} ORDER BY k.contact_name COLLATE "arabic" NULLS LAST,k.id LIMIT ${CLIENT_PAGE_SIZE} OFFSET ${(page - 1) * CLIENT_PAGE_SIZE}`,
    );
    if (
      rows.length !== Math.min(CLIENT_PAGE_SIZE, Math.max(0, total - (page - 1) * CLIENT_PAGE_SIZE))
    )
      throw new Error('Contact page cardinality differs');
    return { rows, total, pages, page };
  });
}
export async function readContact(
  session: Session | null,
  rawParent: string,
  rawId: string,
  database: PrismaClient,
): Promise<ContactDetail | null> {
  requireAuthorizedDecision(decideAuthorization(session, 'contacts', 'view'));
  requireAuthorizedDecision(decideAuthorization(session, 'clients', 'view'));
  const parent = clientId(rawParent);
  const id = clientId(rawId);
  if (parent === null || id === null) return null;
  return readClientSnapshot(database, async (tx) => {
    const rows = await tx.$queryRaw<ContactDetail[]>(
      Prisma.sql`SELECT ${contactProjection},c.name_ar AS "clientName",c.is_archived AS "parentArchived",k.email,k.mobile_phone AS "mobilePhone",k.business_phone AS "businessPhone",k.fax_number AS fax,k.web_page AS website,k.address,k.city,k.state_province AS "stateProvince",k.country_region AS "countryRegion",k.zip_postal_code AS "postalCode" FROM public.contacts k JOIN public.clients c ON c.id=k.client_id WHERE k.id=${id} AND k.client_id=${parent}`,
    );
    if (rows.length > 1) throw new Error('Contact identity cardinality differs');
    return rows[0] ?? null;
  });
}
export async function readLogoMetadata(
  session: Session | null,
  rawId: string,
  database: PrismaClient,
): Promise<LogoMetadata | null> {
  requireAuthorizedDecision(decideAuthorization(session, 'clientLogoUpload', 'view'));
  const id = clientId(rawId);
  if (id === null) return null;
  return readClientSnapshot(database, async (tx) => {
    const rows = await tx.$queryRaw<LogoMetadata[]>(
      Prisma.sql`SELECT l.client_id AS "clientId",l.relative_path AS "relativePath",l.file_name AS "fileName",l.content_type AS "contentType",l.byte_size AS "byteSize",l.sha256 FROM public.client_logos l JOIN public.clients c ON c.id=l.client_id WHERE c.id=${id}`,
    );
    if (rows.length > 1) throw new Error('Client logo cardinality differs');
    return rows[0] ?? null;
  });
}
