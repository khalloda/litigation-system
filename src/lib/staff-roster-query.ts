import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import { decideAuthorization, requireAuthorizedDecision } from '@/lib/auth/authorization-core';

export const STAFF_PAGE_SIZE = 25;
export const STAFF_SEARCH_LIMIT = 160;
export type StaffSearchParams = Record<string, string | string[] | undefined>;
export type StaffFilters = {
  q: string;
  status: 'active' | 'former' | 'all';
  team: string;
  trainee: 'all' | 'yes' | 'no';
  page: number;
};

export class StaffFilterError extends Error {}

export function parseStaffFilters(params: StaffSearchParams): StaffFilters {
  const single = (value: string | string[] | undefined, fallback: string) => {
    if (Array.isArray(value)) throw new StaffFilterError('repeated filter');
    return value ?? fallback;
  };
  const q = single(params.q, '').trim();
  const status = single(params.status, 'active');
  const team = single(params.team, 'all');
  const trainee = single(params.trainee, 'all');
  const pageText = single(params.page, '1');
  if (
    q.length > STAFF_SEARCH_LIMIT ||
    /[\u0000-\u001f\u007f]/u.test(q) ||
    !['active', 'former', 'all'].includes(status) ||
    !(
      team === 'all' ||
      team === 'unassigned' ||
      (/^[1-9]\d{0,4}$/u.test(team) && Number(team) <= 32_767)
    ) ||
    !['all', 'yes', 'no'].includes(trainee) ||
    !/^[1-9]\d{0,9}$/u.test(pageText) ||
    Number(pageText) > 2_147_483_647
  ) {
    throw new StaffFilterError('invalid filters');
  }
  return {
    q,
    status: status as StaffFilters['status'],
    team,
    trainee: trainee as StaffFilters['trainee'],
    page: Number(pageText),
  };
}

export function staffListHref(filters: StaffFilters, page = filters.page): string {
  const params = new URLSearchParams({
    status: filters.status,
    team: filters.team,
    trainee: filters.trainee,
  });
  if (filters.q) params.set('q', filters.q);
  if (page !== 1) params.set('page', String(page));
  return `/staff?${params.toString()}`;
}

export function staffPersonId(value: string): number | null {
  if (!/^[1-9]\d{0,9}$/u.test(value)) return null;
  const id = Number(value);
  return id <= 2_147_483_647 ? id : null;
}

export type StaffRow = {
  id: number;
  nameAr: string;
  nameEn: string | null;
  isActive: boolean;
  isTrainee: boolean;
  teamId: number | null;
  teamName: string | null;
  matchedAlias: string | null;
};
export type StaffTeam = { id: number; name: string };
export type StaffAlias = {
  id: number;
  name: string;
  isPrimary: boolean;
  isRetired: boolean;
  isImported: boolean;
  retirementReason: string | null;
};
export type StaffDetail = Omit<StaffRow, 'matchedAlias'> & {
  email: string | null;
  reviewer: { id: number; name: string } | null;
  reviews: StaffTeam[];
  aliases: StaffAlias[];
  account?: { isEnabled: boolean } | null;
};

const projection = Prisma.sql`p.id, p.name_ar AS "nameAr", p.name_en AS "nameEn",
  p.is_active AS "isActive", p.is_trainee AS "isTrainee", p.team_id AS "teamId",
  t.label_ar AS "teamName"`;

function searchPattern(query: string) {
  // User wildcard characters are literal text. Normalization happens in the
  // same PostgreSQL function as the stored shadows, including Western digits.
  return Prisma.sql`('%' || public.ar_normalise(${query.replace(/[\\%_]/gu, '\\$&')}) || '%')`;
}

function staffWhere(filters: StaffFilters) {
  const predicates = [Prisma.sql`p.is_staff = true`];
  if (filters.status !== 'all')
    predicates.push(Prisma.sql`p.is_active = ${filters.status === 'active'}`);
  if (filters.team === 'unassigned') predicates.push(Prisma.sql`p.team_id IS NULL`);
  else if (filters.team !== 'all') predicates.push(Prisma.sql`p.team_id = ${Number(filters.team)}`);
  if (filters.trainee !== 'all')
    predicates.push(Prisma.sql`p.is_trainee = ${filters.trainee === 'yes'}`);
  if (filters.q) {
    const pattern = searchPattern(filters.q);
    predicates.push(Prisma.sql`(p.name_ar_normalised LIKE ${pattern} OR EXISTS (
      SELECT 1 FROM public.person_name_alias a WHERE a.person_id = p.id
        AND NOT a.is_retired AND a.alias_ar_normalised LIKE ${pattern}
    ))`);
  }
  return Prisma.join(predicates, ' AND ');
}

export function staffCountQuery(filters: StaffFilters) {
  return Prisma.sql`SELECT count(*)::integer AS total FROM public.people p WHERE ${staffWhere(filters)}`;
}

export function staffRowsQuery(filters: StaffFilters, page: number) {
  const match = filters.q
    ? Prisma.sql`(
    SELECT a.alias_ar FROM public.person_name_alias a
    WHERE a.person_id = p.id AND NOT a.is_retired
      AND a.alias_ar_normalised LIKE ${searchPattern(filters.q)}
      AND a.alias_ar <> p.name_ar
    ORDER BY a.alias_ar COLLATE "arabic", a.id LIMIT 1
  )`
    : Prisma.sql`NULL::text`;
  // EXISTS selects people, never joined alias rows. The ID tie-breaker makes
  // Arabic collation ties deterministic across every page.
  return Prisma.sql`SELECT ${projection}, ${match} AS "matchedAlias"
    FROM public.people p LEFT JOIN public.lookup_team t ON t.id = p.team_id
    WHERE ${staffWhere(filters)}
    ORDER BY p.name_ar COLLATE "arabic", p.id
    LIMIT ${STAFF_PAGE_SIZE} OFFSET ${(page - 1) * STAFF_PAGE_SIZE}`;
}

async function readSnapshot<T>(
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

/** session comes only from the independently guarded server page. These
 * checks also refuse accidental unauthorised service calls before any query. */
export async function readStaffRoster(
  session: Session | null,
  params: StaffSearchParams,
  database: PrismaClient,
) {
  requireAuthorizedDecision(decideAuthorization(session, 'staff', 'view'));
  const filters = parseStaffFilters(params);
  return readSnapshot(database, async (tx) => {
    const counts = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`${staffCountQuery(filters)}`);
    if (counts.length !== 1) throw new Error('Staff count cardinality differs');
    const total = counts[0]!.total;
    const pages = Math.max(1, Math.ceil(total / STAFF_PAGE_SIZE));
    const page = Math.min(filters.page, pages);
    const rows = await tx.$queryRaw<StaffRow[]>(Prisma.sql`${staffRowsQuery(filters, page)}`);
    const expected = Math.min(STAFF_PAGE_SIZE, Math.max(0, total - (page - 1) * STAFF_PAGE_SIZE));
    if (rows.length !== expected || new Set(rows.map((row) => row.id)).size !== expected) {
      throw new Error('Staff page cardinality differs');
    }
    const teams = await tx.$queryRaw<StaffTeam[]>(
      Prisma.sql`SELECT id, label_ar AS name FROM public.lookup_team ORDER BY sort_order, id`,
    );
    if (
      filters.team !== 'all' &&
      filters.team !== 'unassigned' &&
      !teams.some((team) => String(team.id) === filters.team)
    ) {
      throw new StaffFilterError('unknown team');
    }
    return { rows, teams, total, pages, filters: { ...filters, page } };
  });
}

export async function readStaffDetail(
  session: Session | null,
  rawId: string,
  database: PrismaClient,
): Promise<StaffDetail | null> {
  const viewer = requireAuthorizedDecision(decideAuthorization(session, 'staff', 'view'));
  const id = staffPersonId(rawId);
  if (id === null) return null;
  return readSnapshot(database, async (tx) => {
    const rows = await tx.$queryRaw<
      Omit<StaffDetail, 'aliases' | 'reviews' | 'account'>[]
    >(Prisma.sql`
      SELECT ${projection}, p.email,
        CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id', r.id, 'name', r.name_ar) END AS reviewer
      FROM public.people p LEFT JOIN public.lookup_team t ON t.id = p.team_id
      LEFT JOIN public.people r ON r.id = t.reviewer_id AND r.is_staff
      WHERE p.id = ${id} AND p.is_staff = true`);
    if (rows.length > 1) throw new Error('Staff identity cardinality differs');
    if (!rows[0]) return null;
    // Migration 53 permanently reserves actor 1 for system_migration; its
    // identity is checked by db:check. Combined with immutable person origin,
    // this matches the Phase 1 alias snapshot (proved in test:staff-read-only).
    // Runtime cannot read the private snapshot or audit actor registry.
    const aliases = await tx.$queryRaw<StaffAlias[]>(Prisma.sql`
      SELECT a.id, a.alias_ar AS name, a.is_primary AS "isPrimary", a.is_retired AS "isRetired",
        (NOT p.is_application_native AND a.created_by = 1) AS "isImported",
        a.retirement_reason AS "retirementReason"
      FROM public.person_name_alias a JOIN public.people p ON p.id = a.person_id
      WHERE a.person_id = ${id}
      ORDER BY a.is_primary DESC, a.is_retired, a.alias_ar COLLATE "arabic", a.id`);
    const reviews = await tx.$queryRaw<StaffTeam[]>(
      Prisma.sql`SELECT id, label_ar AS name FROM public.lookup_team WHERE reviewer_id = ${id} ORDER BY sort_order, id`,
    );
    const detail: StaffDetail = { ...rows[0], aliases, reviews };
    // Non-Administrators neither query nor receive account fields. This does
    // not expose usernames, roles, passwords, lock state or login eligibility.
    if (viewer.user.role === 'Administrator') {
      const accounts = await tx.$queryRaw<{ isEnabled: boolean }[]>(
        Prisma.sql`SELECT is_enabled AS "isEnabled" FROM public.user_accounts WHERE person_id = ${id}`,
      );
      if (accounts.length > 1) throw new Error('Staff account cardinality differs');
      detail.account = accounts[0] ?? null;
    }
    return detail;
  });
}
