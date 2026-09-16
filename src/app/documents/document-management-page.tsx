import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Session } from 'next-auth';
import { readDocumentMutation } from '@/lib/document-mutations';
import { DocumentMutationError, type DocumentOperation } from '@/lib/document-mutation-input';
import {
  parseDocumentFilters,
  documentListHref,
  documentDetailHref,
  DocumentFilterError,
} from '@/lib/document-query';
import { clientId, type ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { DocumentEditor } from './document-editor';
import styles from '../staff/staff.module.css';
export async function DocumentManagementPage({
  session,
  operation,
  rawId,
  searchParams,
}: {
  session: Session;
  operation: DocumentOperation;
  rawId: string | null;
  searchParams: ClientSearchParams;
}) {
  let filters;
  try {
    filters = parseDocumentFilters(searchParams);
  } catch (e) {
    if (!(e instanceof DocumentFilterError)) throw e;
    notFound();
  }
  const id = rawId === null ? null : clientId(rawId);
  if (rawId !== null && id === null) notFound();
  let snapshot;
  try {
    snapshot = await readDocumentMutation(session, operation, id);
  } catch (e) {
    if (e instanceof DocumentMutationError && e.code === 'not-found') notFound();
    throw e;
  }
  const title =
    operation === 'create'
      ? t.documentsModule.create
      : operation === 'update'
        ? t.documentsModule.edit
        : operation === 'archive'
          ? t.documentsModule.archive
          : t.documentsModule.restore;
  const cancel = id === null ? documentListHref(filters) : documentDetailHref(id, filters);
  const query = documentListHref(filters).slice('/documents'.length);
  const blocked =
    snapshot.record &&
    ((snapshot.record.archived && operation === 'update') ||
      Boolean(snapshot.record.facts.parentArchived));
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{title}</h1>
        <Link className={styles.link} href={cancel}>
          {t.documentsModule.cancel}
        </Link>
      </header>
      <section className={styles.panel}>
        {blocked ? (
          <p role="alert">
            {snapshot.record?.archived
              ? t.documentsModule.recordArchived
              : t.documentsModule.parentArchived}
          </p>
        ) : (
          <DocumentEditor
            snapshot={snapshot}
            operation={operation}
            submission={randomUUID()}
            cancel={cancel}
            reload={
              id === null
                ? '/documents/new' + query
                : documentDetailHref(
                    id,
                    filters,
                    '/' + (operation === 'update' ? 'edit' : operation),
                  )
            }
            query={query}
          />
        )}
      </section>
    </main>
  );
}
