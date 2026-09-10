import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readClientMutation } from '@/lib/client-mutations';
import { ClientMutationError, type ClientOperation } from '@/lib/client-mutation-input';
import {
  clientId,
  parseClientFilters,
  clientListHref,
  ClientFilterError,
  type ClientSearchParams,
} from '@/lib/client-query';
import { t } from '@/strings';
import { clientOperationTitle } from '@/lib/client-mutation-copy';
import { ClientEditor } from './client-editor';
import { ClientAlert } from './client-alert';
import styles from '../staff/staff.module.css';

export async function ClientManagementPage({
  session,
  operation,
  id = null,
  parentId = null,
  searchParams,
}: {
  session: Session;
  operation: ClientOperation;
  id?: string | null;
  parentId?: string | null;
  searchParams: ClientSearchParams;
}) {
  const isClient = operation.startsWith('client-');
  const creating = operation.endsWith('-create');
  if (
    (!creating && (!id || clientId(id) === null)) ||
    (!isClient && (!parentId || clientId(parentId) === null))
  )
    notFound();
  const base = isClient
    ? creating
      ? '/clients'
      : `/clients/${id}`
    : `/clients/${parentId}${creating ? '' : `/contacts/${id}`}`;
  const route =
    base +
    (creating
      ? isClient
        ? '/new'
        : '/contacts/new'
      : operation.endsWith('-update')
        ? '/edit'
        : operation.endsWith('-archive')
          ? '/archive'
          : '/restore');
  let query, list;
  try {
    for (const key of Object.keys(searchParams))
      if (!['q', 'status', 'archive', 'page', 'contactsPage'].includes(key))
        throw new ClientFilterError('unknown return filter');
    const filters = parseClientFilters(searchParams);
    const contactsPage = searchParams.contactsPage ?? '1';
    if (typeof contactsPage !== 'string' || clientId(contactsPage) === null)
      throw new ClientFilterError('invalid contacts page');
    list = clientListHref(filters);
    query = list.slice('/clients'.length) + `&contactsPage=${contactsPage}`;
  } catch (error) {
    if (!(error instanceof ClientFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{clientOperationTitle(operation)}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href={route}>
            {t.clients.clear}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  let snapshot;
  try {
    snapshot = await readClientMutation(session, operation, id, parentId);
  } catch (error) {
    if (error instanceof ClientMutationError && ['not-found', 'invalid'].includes(error.code))
      notFound();
    throw error;
  }
  const cancelHref = isClient && creating ? list : base + query;
  const newHref = (isClient ? '/clients/new' : `/clients/${parentId}/contacts/new`) + query;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{clientOperationTitle(operation)}</h1>
        <Link className={styles.link} href={cancelHref}>
          {creating
            ? isClient
              ? t.clients.back
              : t.clients.backClient
            : t.clients.manage.backRecord}
        </Link>
      </header>
      <ClientEditor
        key={`${operation}:${parentId ?? ''}:${id ?? ''}`}
        snapshot={snapshot}
        submission={creating ? randomUUID() : ''}
        query={query}
        cancelHref={cancelHref}
        reloadHref={route + query}
        newHref={newHref}
      />
      {isClient && !creating ? (
        <section className={styles.panel}>
          <h2>{t.clients.historicalLawyer}</h2>
          <p dir="auto">{snapshot.historicalLawyer ?? t.common.notRecorded}</p>
          <p>{t.clients.historicalHint}</p>
        </section>
      ) : null}
    </main>
  );
}
