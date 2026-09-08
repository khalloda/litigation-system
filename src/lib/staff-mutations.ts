import type { Session } from 'next-auth';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { setHumanAuditContext } from '@/lib/audit';
import type { AuditRequestMetadata } from '@/lib/audit-metadata';
import { decideAuthorization, requireAuthorizedDecision } from '@/lib/auth/authorization-core';
import { withSerializableRetry } from '@/lib/auth/service';

export type StaffOperation =
  | 'create'
  | 'update'
  | 'rename'
  | 'add-alias'
  | 'retire-alias'
  | 'restore-alias'
  | 'deactivate'
  | 'reactivate'
  | 'reviewer';
export type StaffInput = Readonly<Record<string, string>>;
export type StaffMutationResult = Readonly<{ personId: number; changed: boolean }>;
export type StaffMutationErrorCode =
  | 'invalid'
  | 'name'
  | 'email'
  | 'reason'
  | 'confirmation'
  | 'not-found'
  | 'stale'
  | 'administrator'
  | 'self'
  | 'last-administrator'
  | 'reviewer'
  | 'immutable-alias'
  | 'retired-alias'
  | 'duplicate-name'
  | 'duplicate-email';
export class StaffMutationError extends Error {
  constructor(
    readonly code: StaffMutationErrorCode,
    readonly field: string = '',
  ) {
    super(code);
  }
}

type Person = {
  id: number;
  nameAr: string;
  nameEn: string | null;
  email: string | null;
  isActive: boolean;
  isTrainee: boolean;
  teamId: number | null;
  version: string;
};
export type StaffManagementSnapshot = {
  person: Person | null;
  teams: { id: number; name: string; reviewerId: number; version: string }[];
  reviewers: { id: number; name: string }[];
  aliases: {
    id: number;
    name: string;
    isPrimary: boolean;
    isRetired: boolean;
    isImported: boolean;
  }[];
  hasAccount: boolean;
  isSelf: boolean;
};

function id(value: string | undefined, field: string): number {
  if (!value || !/^[1-9]\d{0,9}$/u.test(value) || Number(value) > 2_147_483_647)
    throw new StaffMutationError('invalid', field);
  return Number(value);
}
function version(value: string | undefined): string {
  if (!value || !/^[1-9]\d{0,18}$/u.test(value) || BigInt(value) > 9_223_372_036_854_775_807n)
    throw new StaffMutationError('invalid');
  return value;
}
function text(value: string | undefined, field: string, limit: number, required = false) {
  const result = (value ?? '').trim();
  if ((required && !result) || [...result].length > limit || /[\u0000-\u001f\u007f]/u.test(result))
    throw new StaffMutationError(field === 'reason' ? 'reason' : 'invalid', field);
  return result || null;
}
function name(value: string | undefined, field: string): string {
  const result = text(value, field, 256, true)!;
  // Names are official labels supplied by the firm. Never generate a suffix.
  if (!/\p{Script=Arabic}/u.test(result)) throw new StaffMutationError('name', field);
  return result;
}
function email(value: string | undefined): string | null {
  const result = text(value, 'email', 254)?.toLowerCase() ?? null;
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result))
    throw new StaffMutationError('email', 'email');
  return result;
}
function boolean(value: string | undefined): boolean {
  if (value !== 'true' && value !== 'false') throw new StaffMutationError('invalid', 'isTrainee');
  return value === 'true';
}
function team(value: string | undefined): number | null {
  if (value === '') return null;
  const result = id(value, 'teamId');
  if (result > 32_767) throw new StaffMutationError('invalid', 'teamId');
  return result;
}
async function person(transaction: Prisma.TransactionClient, personId: number) {
  const rows = await transaction.$queryRaw<Person[]>(Prisma.sql`
    SELECT id,name_ar AS "nameAr",name_en AS "nameEn",email,is_active AS "isActive",
      is_trainee AS "isTrainee",team_id AS "teamId",row_version::text AS version
    FROM public.people WHERE id=${personId} AND is_staff`);
  if (rows.length !== 1) throw new StaffMutationError('not-found');
  return rows[0]!;
}
async function administrator(transaction: Prisma.TransactionClient, session: Session) {
  const rows = await transaction.$queryRaw<{ valid: boolean }[]>(Prisma.sql`
    SELECT (u.role_code='Administrator' AND u.is_enabled AND u.password_hash IS NOT NULL
      AND NOT u.must_change_password AND u.session_version=${session.user.sessionVersion}
      AND p.is_staff AND p.is_active AND p.can_login AND p.id=${session.user.personId}) AS valid
    FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
    WHERE u.id=${id(session.user.id, '')}`);
  if (rows.length !== 1 || !rows[0]!.valid) throw new StaffMutationError('administrator');
}

export async function readStaffManagement(
  session: Session | null,
  personId: string | null,
  database: PrismaClient = db,
): Promise<StaffManagementSnapshot> {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'staff', 'manage'));
  return database.$transaction(
    async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      await administrator(transaction, actor);
      const current = personId === null ? null : await person(transaction, id(personId, ''));
      const teams = await transaction.$queryRaw<StaffManagementSnapshot['teams']>(Prisma.sql`
      SELECT id,label_ar AS name,reviewer_id AS "reviewerId",row_version::text AS version
      FROM public.lookup_team ORDER BY sort_order,id`);
      const reviewers = await transaction.$queryRaw<
        StaffManagementSnapshot['reviewers']
      >(Prisma.sql`
      SELECT id,name_ar AS name FROM public.people WHERE is_staff AND is_active AND NOT is_trainee
      ORDER BY name_ar COLLATE "arabic",id`);
      const aliases = current
        ? await transaction.$queryRaw<StaffManagementSnapshot['aliases']>(Prisma.sql`
        SELECT a.id,a.alias_ar AS name,a.is_primary AS "isPrimary",a.is_retired AS "isRetired",
          (NOT p.is_application_native AND a.created_by=1) AS "isImported"
        FROM public.person_name_alias a JOIN public.people p ON p.id=a.person_id
        WHERE a.person_id=${current.id} ORDER BY a.is_primary DESC,a.alias_ar COLLATE "arabic",a.id`)
        : [];
      const account = current
        ? await transaction.userAccount.findUnique({
            where: { personId: current.id },
            select: { id: true },
          })
        : null;
      return {
        person: current,
        teams,
        reviewers,
        aliases,
        hasAccount: account !== null,
        isSelf: current?.id === actor.user.personId,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

/** The caller supplies a validated session, never a request-selected actor.
 * The serializable snapshot rechecks its version/eligibility, and migration 61
 * serializes and rechecks that actor again at every actual write gateway. */
export async function mutateStaff(
  session: Session | null,
  operation: StaffOperation,
  input: StaffInput,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
): Promise<StaffMutationResult> {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'staff', 'manage'));
  const database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (transaction) => {
          await administrator(transaction, actor);
          const current =
            operation === 'create' ? null : await person(transaction, id(input.personId, ''));
          if (current && current.version !== version(input.version))
            throw new StaffMutationError('stale');
          const done = (changed: boolean, personId = current!.id) => ({ personId, changed });
          const context = () =>
            setHumanAuditContext(transaction, Number(actor.user.id), dependencies.auditMetadata);
          if (operation === 'create' || operation === 'update') {
            const nameEn = text(input.nameEn, 'nameEn', 256);
            const acceptedEmail = email(input.email);
            const isTrainee = boolean(input.isTrainee);
            const teamId = team(input.teamId);
            if (
              teamId !== null &&
              !(await transaction.lookupTeam.findUnique({
                where: { id: teamId },
                select: { id: true },
              }))
            )
              throw new StaffMutationError('invalid', 'teamId');
            if (
              current &&
              isTrainee &&
              (await transaction.lookupTeam.count({ where: { reviewerId: current.id } })) > 0
            )
              throw new StaffMutationError('reviewer', 'isTrainee');
            if (
              current &&
              current.nameEn === nameEn &&
              current.email === acceptedEmail &&
              current.isTrainee === isTrainee &&
              current.teamId === teamId
            )
              return done(false);
            const nameAr = operation === 'create' ? name(input.nameAr, 'nameAr') : null;
            await context();
            if (operation === 'create') {
              const rows = await transaction.$queryRaw<{ id: number }[]>(Prisma.sql`
            SELECT public.staff_create_person(${nameAr}::text,${nameEn}::text,${acceptedEmail}::text,${isTrainee}::boolean,${teamId}::smallint) AS id`);
              if (rows.length !== 1) throw new Error('Invalid staff gateway result');
              return done(true, rows[0]!.id);
            }
            await transaction.$queryRaw(
              Prisma.sql`SELECT public.staff_update_person(${current!.id}::integer,${current!.version}::bigint,${nameEn}::text,${acceptedEmail}::text,${current!.isActive}::boolean,${isTrainee}::boolean,${teamId}::smallint)`,
            );
          } else if (operation === 'rename') {
            const nameAr = name(input.nameAr, 'nameAr');
            if (input.confirmation !== String(current!.id))
              throw new StaffMutationError('confirmation');
            if (current!.nameAr === nameAr) return done(false);
            await context();
            await transaction.$queryRaw(
              Prisma.sql`SELECT public.staff_rename_person(${current!.id}::integer,${current!.version}::bigint,${nameAr}::text)`,
            );
          } else if (operation === 'add-alias') {
            const alias = name(input.alias, 'alias');
            const existing = await transaction.personNameAlias.findUnique({
              where: { aliasAr: alias },
              select: { personId: true, isRetired: true },
            });
            if (existing?.personId === current!.id) {
              if (existing.isRetired) throw new StaffMutationError('retired-alias', 'alias');
              return done(false);
            }
            await context();
            await transaction.$queryRaw(
              Prisma.sql`SELECT public.staff_add_alias(${current!.id}::integer,${current!.version}::bigint,${alias}::text)`,
            );
          } else if (operation === 'retire-alias' || operation === 'restore-alias') {
            const aliasId = id(input.aliasId, 'aliasId');
            const reason = text(input.reason, 'reason', 2048, true)!;
            const aliases = await transaction.$queryRaw<
              { isPrimary: boolean; isRetired: boolean; isImported: boolean }[]
            >(Prisma.sql`
          SELECT a.is_primary AS "isPrimary",a.is_retired AS "isRetired",(NOT p.is_application_native AND a.created_by=1) AS "isImported"
          FROM public.person_name_alias a JOIN public.people p ON p.id=a.person_id WHERE a.id=${aliasId} AND a.person_id=${current!.id}`);
            if (aliases.length !== 1 || aliases[0]!.isPrimary || aliases[0]!.isImported)
              throw new StaffMutationError('immutable-alias', 'aliasId');
            if (input.confirmation !== String(current!.id))
              throw new StaffMutationError('confirmation');
            const retired = operation === 'retire-alias';
            if (aliases[0]!.isRetired === retired) return done(false);
            await context();
            await transaction.$queryRaw(
              Prisma.sql`SELECT public.staff_set_alias_retired(${current!.id}::integer,${current!.version}::bigint,${aliasId}::integer,${retired}::boolean,${reason}::text)`,
            );
          } else if (operation === 'deactivate' || operation === 'reactivate') {
            const active = operation === 'reactivate';
            if (input.confirmation !== String(current!.id))
              throw new StaffMutationError('confirmation');
            if (!active && current!.id === actor.user.personId)
              throw new StaffMutationError('self');
            if (current!.isActive === active) return done(false);
            if (!active) {
              if (await transaction.lookupTeam.count({ where: { reviewerId: current!.id } }))
                throw new StaffMutationError('reviewer');
              const admins = await transaction.$queryRaw<{ personId: number }[]>(Prisma.sql`
            SELECT u.person_id AS "personId" FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
            WHERE u.role_code='Administrator' AND u.is_enabled AND u.password_hash IS NOT NULL AND p.is_active AND p.can_login`);
              if (admins.length === 1 && admins[0]!.personId === current!.id)
                throw new StaffMutationError('last-administrator');
            }
            await context();
            await transaction.$queryRaw(
              Prisma.sql`SELECT public.staff_update_person(${current!.id}::integer,${current!.version}::bigint,${current!.nameEn}::text,${current!.email}::text,${active}::boolean,${current!.isTrainee}::boolean,${current!.teamId}::smallint)`,
            );
          } else if (operation === 'reviewer') {
            const teamId = id(input.teamId, 'teamId');
            const expected = version(input.teamVersion);
            const reviewerId = id(input.reviewerId, 'reviewerId');
            const selected = await transaction.lookupTeam.findUnique({
              where: { id: teamId },
              select: { rowVersion: true, reviewerId: true },
            });
            if (!selected) throw new StaffMutationError('invalid', 'teamId');
            if (selected.rowVersion.toString() !== expected) throw new StaffMutationError('stale');
            const reviewer = await person(transaction, reviewerId);
            if (!reviewer.isActive || reviewer.isTrainee)
              throw new StaffMutationError('reviewer', 'reviewerId');
            if (selected.reviewerId === reviewerId) return done(false);
            await context();
            await transaction.$queryRaw(
              Prisma.sql`SELECT public.staff_set_team_reviewer(${teamId}::smallint,${expected}::bigint,${reviewerId}::integer)`,
            );
          } else throw new StaffMutationError('invalid');
          return done(true);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 30_000,
        },
      ),
    );
  } catch (error) {
    if (error instanceof StaffMutationError) throw error;
    const message = error instanceof Error ? error.message : '';
    // Only fixed classifications leave this boundary. Raw PostgreSQL errors
    // may contain submitted values and must never become UI or audit text.
    if (message.includes('40001') || message.includes('P2034'))
      throw new StaffMutationError('stale');
    if (message.includes('people_email')) throw new StaffMutationError('duplicate-email', 'email');
    if (message.includes('Canonical target is ambiguous or retired'))
      throw new StaffMutationError('retired-alias', 'nameAr');
    if (message.includes('23505') || message.includes('Unique constraint'))
      throw new StaffMutationError(
        'duplicate-name',
        operation === 'add-alias' ? 'alias' : 'nameAr',
      );
    if (message.includes('reviewer')) throw new StaffMutationError('reviewer');
    if (message.includes('last usable Administrator'))
      throw new StaffMutationError('last-administrator');
    if (message.includes('42501')) throw new StaffMutationError('administrator');
    if (message.includes('Invalid staff text')) throw new StaffMutationError('invalid');
    throw error;
  }
}
