import type { Session } from 'next-auth';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { setHumanAuditContext } from '@/lib/audit';
import type { AuditRequestMetadata } from '@/lib/audit-metadata';
import { decideAuthorization, requireAuthorizedDecision } from '@/lib/auth/authorization-core';
import { withSerializableRetry } from '@/lib/auth/service';
import {
  ClientMutationError,
  mutationPermission,
  mutationId,
  parseClientMutationInput,
  clientPatch,
  clientValue,
  type ClientOperation,
} from '@/lib/client-mutation-input';

type RecordSnapshot = {
  id: number;
  version: string;
  archived: boolean;
  sigma: boolean;
  values: Record<string, string | number | null>;
};
export type ClientMutationSnapshot = {
  operation: ClientOperation;
  record: RecordSnapshot | null;
  parent: { id: number; name: string; archived: boolean; mainContactId: number | null } | null;
  contacts: { id: number; name: string | null; job: string | null }[];
  counts: { contacts: number; matters: number; invoices: number; feeLetters: number } | null;
  historicalLawyer: string | null;
};

async function currentActor(transaction: Prisma.TransactionClient, session: Session) {
  const rows = await transaction.$queryRaw<{ valid: boolean }[]>(Prisma.sql`
    SELECT (u.role_code=${session.user.role} AND u.is_enabled AND u.password_hash IS NOT NULL
      AND NOT u.must_change_password AND u.session_version=${session.user.sessionVersion}
      AND p.is_staff AND p.is_active AND p.can_login AND p.id=${session.user.personId}) AS valid
    FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
    WHERE u.id=${mutationId(session.user.id)}`);
  if (rows.length !== 1 || !rows[0]!.valid) throw new ClientMutationError('session');
}
async function parentRecord(transaction: Prisma.TransactionClient, clientId: number) {
  const rows = await transaction.$queryRaw<
    NonNullable<ClientMutationSnapshot['parent']>[]
  >(Prisma.sql`
    SELECT id,name_ar AS name,is_archived AS archived,contact_person_id AS "mainContactId" FROM public.clients WHERE id=${clientId}`);
  if (rows.length !== 1) throw new ClientMutationError('not-found');
  return rows[0]!;
}
async function currentRecord(
  transaction: Prisma.TransactionClient,
  operation: ClientOperation,
  id: number,
  clientId: number | null,
) {
  const rows = operation.startsWith('client-')
    ? await transaction.$queryRaw<RecordSnapshot[]>(Prisma.sql`
      SELECT id,row_version::text AS version,is_archived AS archived,(legacy_id=188) IS TRUE AS sigma,
      jsonb_build_object('name_ar',name_ar,'name_en',name_en,'full_name',full_name,
        'cash_or_probono',cash_or_probono,'status',status,'poa_location',poa_location,
        'documents_location',documents_location,'client_start',client_start::text,
        'client_end',client_end::text,'contact_person_id',contact_person_id) AS values
      FROM public.clients WHERE id=${id}`)
    : await transaction.$queryRaw<RecordSnapshot[]>(Prisma.sql`
      SELECT id,row_version::text AS version,is_archived AS archived,false AS sigma,
      jsonb_build_object('contact_name',contact_name,'full_name',full_name,'job_title',job_title,
        'email',email,'mobile_phone',mobile_phone,'business_phone',business_phone,'fax_number',fax_number,
        'web_page',web_page,'address',address,'city',city,'state_province',state_province,
        'zip_postal_code',zip_postal_code,'country_region',country_region) AS values
      FROM public.contacts WHERE id=${id} AND client_id=${clientId}`);
  if (rows.length !== 1) throw new ClientMutationError('not-found');
  return rows[0]!;
}

/** A separate permission check and forced-read-only snapshot for every form. */
export async function readClientMutation(
  session: Session | null,
  operation: ClientOperation,
  recordId: string | null,
  parentId: string | null,
  database: PrismaClient = db,
): Promise<ClientMutationSnapshot> {
  const permission = mutationPermission(operation);
  const actor = requireAuthorizedDecision(
    decideAuthorization(session, permission.area, permission.action),
  );
  const id = permission.action === 'create' ? null : mutationId(recordId);
  const clientId = permission.area === 'contacts' ? mutationId(parentId, 'clientId') : null;
  return database.$transaction(
    async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      await currentActor(transaction, actor);
      const parent = clientId === null ? null : await parentRecord(transaction, clientId);
      const record = id === null ? null : await currentRecord(transaction, operation, id, clientId);
      const editableClient =
        permission.area === 'clients' && permission.action === 'update' && !record?.archived;
      const contacts = editableClient
        ? await transaction.$queryRaw<ClientMutationSnapshot['contacts']>(Prisma.sql`
      SELECT id,contact_name AS name,job_title AS job FROM public.contacts
      WHERE client_id=${id} AND NOT is_archived ORDER BY contact_name COLLATE "arabic" NULLS LAST,id`)
        : [];
      const facts =
        permission.area === 'clients' && id !== null
          ? await transaction.$queryRaw<
              { historicalLawyer: string | null; counts: ClientMutationSnapshot['counts'] }[]
            >(Prisma.sql`
        SELECT legacy_contact_lawyer_raw AS "historicalLawyer",jsonb_build_object(
          'contacts',(SELECT count(*)::integer FROM public.contacts WHERE client_id=c.id),
          'matters',(SELECT count(*)::integer FROM public.matters WHERE client_id=c.id),
          'invoices',(SELECT count(*)::integer FROM public.invoices i JOIN public.fee_letters f ON f.id=i.fee_letter_id WHERE f.client_id=c.id),
          'feeLetters',(SELECT count(*)::integer FROM public.fee_letters WHERE client_id=c.id)) AS counts
        FROM public.clients c WHERE c.id=${id}`)
          : [];
      return {
        operation,
        parent,
        record,
        contacts,
        counts: facts[0]?.counts ?? null,
        historicalLawyer: facts[0]?.historicalLawyer ?? null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

/** Only the three deployed, fixed gateways may write. All retries retain the caller's version/UUID. */
export async function mutateClient(
  session: Session | null,
  operation: ClientOperation,
  untrusted: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
): Promise<{ id: number; clientId: number; changed: boolean }> {
  const permission = mutationPermission(operation);
  const actor = requireAuthorizedDecision(
    decideAuthorization(session, permission.area, permission.action),
  );
  const input = parseClientMutationInput(operation, untrusted);
  const requested = clientPatch(operation, input);
  const database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (transaction) => {
          await currentActor(transaction, actor);
          const parentId =
            permission.area === 'contacts' ? mutationId(input.clientId, 'clientId') : null;
          if (parentId !== null && (await parentRecord(transaction, parentId)).archived)
            throw new ClientMutationError('parent-archived');
          const current =
            permission.action === 'create'
              ? null
              : await currentRecord(transaction, operation, mutationId(input.id), parentId);
          if (current && current.version !== input.version) throw new ClientMutationError('stale');
          if (current?.archived && permission.action === 'update')
            throw new ClientMutationError('archived');
          const patch = Object.fromEntries(
            Object.entries(requested).filter(
              ([key, value]) => !current || value !== clientValue(current.values, key),
            ),
          );
          const done = (id: number, changed: boolean) => ({
            id,
            clientId: parentId ?? id,
            changed,
          });
          if (permission.action === 'update' && Object.keys(patch).length === 0)
            return done(current!.id, false);
          if (permission.action === 'archive' || permission.action === 'restore') {
            if (current!.archived === (permission.action === 'archive'))
              return done(current!.id, false);
          } else {
            const name = permission.area === 'clients' ? 'name_ar' : 'contact_name';
            if (
              (permission.action === 'create' || Object.hasOwn(patch, name)) &&
              !String(clientValue(patch, name) ?? '').trim()
            )
              throw new ClientMutationError('required', name);
            if (
              current?.sigma &&
              ['name_ar', 'name_en', 'full_name'].some((key) => Object.hasOwn(patch, key))
            )
              throw new ClientMutationError('sigma');
            if (
              Object.hasOwn(patch, 'cash_or_probono') &&
              !['', 'Cash', 'Probono'].includes(String(patch.cash_or_probono))
            )
              throw new ClientMutationError('invalid', 'cash_or_probono');
            if (
              Object.hasOwn(patch, 'status') &&
              !['', 'Active', 'Disabled', 'Potential'].includes(String(patch.status))
            )
              throw new ClientMutationError('invalid', 'status');
          }
          await setHumanAuditContext(
            transaction,
            Number(actor.user.id),
            dependencies.auditMetadata,
          );
          if (permission.action === 'create') {
            const payload = JSON.stringify(patch);
            const rows =
              permission.area === 'clients'
                ? await transaction.$queryRaw<{ id: number }[]>(
                    Prisma.sql`SELECT public.client_contact_create('clients'::text,NULL::integer,${input.submission}::uuid,${payload}::jsonb) AS id`,
                  )
                : await transaction.$queryRaw<{ id: number }[]>(
                    Prisma.sql`SELECT public.client_contact_create('contacts'::text,${parentId}::integer,${input.submission}::uuid,${payload}::jsonb) AS id`,
                  );
            return done(rows[0]!.id, true);
          }
          if (permission.action === 'update') {
            const payload = JSON.stringify(patch);
            if (permission.area === 'clients')
              await transaction.$queryRaw(
                Prisma.sql`SELECT public.client_contact_update('clients'::text,${current!.id}::integer,${input.version}::bigint,${payload}::jsonb)`,
              );
            else
              await transaction.$queryRaw(
                Prisma.sql`SELECT public.client_contact_update('contacts'::text,${current!.id}::integer,${input.version}::bigint,${payload}::jsonb)`,
              );
          } else {
            const archived = permission.action === 'archive';
            if (permission.area === 'clients')
              await transaction.$queryRaw(
                Prisma.sql`SELECT public.client_contact_set_archived('clients'::text,${current!.id}::integer,${input.version}::bigint,${archived}::boolean)`,
              );
            else
              await transaction.$queryRaw(
                Prisma.sql`SELECT public.client_contact_set_archived('contacts'::text,${current!.id}::integer,${input.version}::bigint,${archived}::boolean)`,
              );
          }
          return done(current!.id, true);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 30_000,
        },
      ),
    );
  } catch (error) {
    if (error instanceof ClientMutationError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('row version is stale')) throw new ClientMutationError('stale');
    if (message.includes('40001') || message.includes('P2034') || message.includes('40P01'))
      throw new ClientMutationError('conflict');
    if (message.includes('Creation submission reused')) throw new ClientMutationError('submission');
    if (message.includes('parent') && message.includes('archiv'))
      throw new ClientMutationError('parent-archived');
    if (message.includes('Main contact') || message.includes('main contact'))
      throw new ClientMutationError('main-contact', 'contact_person_id');
    if (message.includes('42501')) throw new ClientMutationError('session');
    if (message.includes('22023') || message.includes('23514'))
      throw new ClientMutationError('invalid');
    // Database errors may contain submitted text. The action returns fixed UI text only.
    throw error;
  }
}
