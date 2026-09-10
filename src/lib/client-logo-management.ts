import type { Session } from 'next-auth';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from './db';
import { decideAuthorization, requireAuthorizedDecision } from './auth/authorization-core';
import { withSerializableRetry } from './auth/service';
import { setHumanAuditContext } from './audit';
import type { AuditRequestMetadata } from './audit-metadata';
import { LogoError, prepareLogo } from './client-logo-upload';
import { logoSubmission, persistPreparedLogo } from './client-logo-storage';
import { readClientLogoFile } from './client-logo-file';

export type LogoVersion = {
  id: string;
  client_id: number;
  relative_path: string;
  file_name: string;
  original_name: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  origin: string;
  registered_at: string;
  registered_by: number;
};
export type LogoState = {
  clientId: number;
  clientName: string;
  clientVersion: string;
  clientArchived: boolean;
  version: string;
  archived: boolean;
  current: LogoVersion | null;
  selected: LogoVersion | null;
  total: number;
  rows: LogoVersion[];
};
export type LogoAction = 'create' | 'update' | 'archive' | 'restore';
export type LogoResult = { id: string; version: string; changed: boolean; replayed: boolean };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
function id(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new LogoError('invalid');
  return value;
}
function version(value: unknown) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,17})$/u.test(value))
    throw new LogoError('invalid');
  return value;
}
export function logoMetadata(value: LogoVersion) {
  return {
    clientId: value.client_id,
    relativePath: value.relative_path,
    fileName: value.file_name,
    contentType: value.content_type,
    byteSize: value.byte_size,
    sha256: value.sha256,
  };
}

export async function readLogoManagement(
  session: Session | null,
  clientId: number,
  page = 1,
  target: string | null = null,
  database: PrismaClient = db,
): Promise<LogoState> {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'clientLogoUpload', 'view'));
  id(clientId);
  id(page);
  if (page > 4001) throw new LogoError('invalid');
  if (target !== null && !uuid.test(target)) throw new LogoError('invalid');
  return database
    .$transaction(
      async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const result = await transaction.$queryRaw<{ state: LogoState | null }[]>(
          Prisma.sql`SELECT public.client_logo_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${clientId}::integer,${(page - 1) * 25}::integer,${target}::uuid) AS state WHERE EXISTS (SELECT 1 FROM public.user_accounts WHERE id=${Number(actor.user.id)} AND person_id=${actor.user.personId})`,
        );
        if (result.length !== 1 || !result[0]?.state) throw new LogoError('missing');
        return result[0].state;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
    .catch((error) => {
      if (error instanceof LogoError) throw error;
      if (
        error instanceof Error &&
        /42501|Current logo viewer|Administrator logo recovery/u.test(error.message)
      )
        throw new LogoError('session');
      throw new LogoError('uncertain');
    });
}

export async function mutateLogo(
  session: Session | null,
  action: LogoAction,
  input: {
    clientId: number;
    version: string;
    clientVersion: string;
    submission: string;
    target: string | null;
    upload?: { bytes: Buffer; name: string; mime: string };
  },
  dependencies: { database?: PrismaClient; root?: string; auditMetadata: AuditRequestMetadata },
): Promise<LogoResult> {
  if (!['create', 'update', 'archive', 'restore'].includes(action)) throw new LogoError('invalid');
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'clientLogoUpload', action));
  const database = dependencies.database ?? db;
  const root = dependencies.root ?? process.env['CLIENT_LOGO_ROOT'];
  id(input.clientId);
  version(input.version);
  version(input.clientVersion);
  logoSubmission(input.submission);
  if (input.target !== null && !uuid.test(input.target)) throw new LogoError('invalid');
  let metadata: Record<string, string | number> = {};
  try {
    // Fresh server-authorized read precedes filesystem work. The committing SQL
    // locks/rechecks the actor, session, parent and exact original versions.
    const state = await readLogoManagement(actor, input.clientId, 1, input.target, database);
    if (state.clientArchived) throw new LogoError('archived');
    if (action === 'create' || action === 'update') {
      if (state.archived) throw new LogoError('archived');
      if (!input.upload || input.target !== null) throw new LogoError('invalid');
      const prepared = await prepareLogo(input.upload.bytes, input.upload.name, input.upload.mime);
      if (
        state.current?.sha256 === prepared.sha256 &&
        !(await readClientLogoFile(actor, root, logoMetadata(state.current)))
      )
        throw new LogoError('storage');
      const stored =
        state.version === input.version &&
        !state.archived &&
        state.current?.sha256 === prepared.sha256
          ? { fileName: `${input.submission}.${prepared.extension}` }
          : await persistPreparedLogo(root, input.clientId, input.submission, prepared);
      metadata = {
        fileName: stored.fileName,
        originalName: prepared.originalName,
        contentType: prepared.contentType,
        byteSize: prepared.bytes.length,
        sha256: prepared.sha256,
        inputSha256: prepared.inputSha256,
      };
    } else {
      if (input.upload || !state.selected) throw new LogoError('invalid');
      if (
        action === 'restore' &&
        !(await readClientLogoFile(actor, root, logoMetadata(state.selected)))
      )
        throw new LogoError('storage');
    }
    const payload = JSON.stringify(metadata);
    return await withSerializableRetry(() =>
      database.$transaction(
        async (transaction) => {
          const valid = await transaction.$queryRaw<{ valid: boolean }[]>(
            Prisma.sql`SELECT (u.role_code=${actor.user.role} AND u.is_enabled AND NOT u.must_change_password AND u.password_hash IS NOT NULL AND u.session_version=${actor.user.sessionVersion} AND p.id=${actor.user.personId} AND p.is_staff AND p.is_active AND p.can_login) AS valid FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.id=${Number(actor.user.id)}`,
          );
          if (valid.length !== 1 || !valid[0]?.valid) throw new LogoError('session');
          await setHumanAuditContext(
            transaction,
            Number(actor.user.id),
            dependencies.auditMetadata,
          );
          const rows = await transaction.$queryRaw<{ result: LogoResult }[]>(
            Prisma.sql`SELECT public.client_logo_mutate(${input.clientId}::integer,${input.version}::bigint,${input.clientVersion}::bigint,${input.submission}::uuid,${action}::text,${input.target}::uuid,${payload}::jsonb,${actor.user.sessionVersion}::integer,${actor.user.role}::text) AS result`,
          );
          if (rows.length !== 1 || !rows[0]?.result) throw new LogoError('uncertain');
          return rows[0].result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 30000,
        },
      ),
    );
  } catch (error) {
    if (error instanceof LogoError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (/version is stale|40001|P2034|40P01/u.test(message)) throw new LogoError('stale');
    if (message.includes('submission reused')) throw new LogoError('submission');
    if (/Restore.*(?:client|logo)/u.test(message)) throw new LogoError('archived');
    if (/42501|Current logo/u.test(message)) throw new LogoError('session');
    if (/22023|23514/u.test(message)) throw new LogoError('invalid');
    // A lost commit response is not proof of rollback. Keep the same submission
    // and file, and tell the user to retry/re-read rather than delete anything.
    throw new LogoError('uncertain');
  }
}
