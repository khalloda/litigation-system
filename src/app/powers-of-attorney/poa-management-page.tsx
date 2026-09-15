import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Session } from 'next-auth';
import { readPoaMutation } from '@/lib/poa-mutations';
import { PoaMutationError, type PoaOperation } from '@/lib/poa-mutation-input';
import { parsePoaFilters, poaListHref, poaDetailHref, PoaFilterError } from '@/lib/poa-query';
import { clientId, type ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { PoaEditor } from './poa-editor';
import styles from '../staff/staff.module.css';
export async function PoaManagementPage({
  session,
  operation,
  rawId,
  searchParams,
}: {
  session: Session;
  operation: PoaOperation;
  rawId: string | null;
  searchParams: ClientSearchParams;
}) {
  let f;
  try {
    f = parsePoaFilters(searchParams);
  } catch (e) {
    if (!(e instanceof PoaFilterError)) throw e;
    notFound();
  }
  const id = rawId === null ? null : clientId(rawId);
  if (rawId !== null && id === null) notFound();
  let snapshot;
  try {
    snapshot = await readPoaMutation(session, operation, id);
  } catch (e) {
    if (e instanceof PoaMutationError && e.code === 'not-found') notFound();
    throw e;
  }
  const title =
    operation === 'create'
      ? t.poa.create
      : operation === 'update'
        ? t.poa.edit
        : operation === 'archive'
          ? t.poa.archive
          : t.poa.restore;
  const lifecycle = operation === 'archive' || operation === 'restore',
    cancel =
      id === null ? poaListHref(f) : poaDetailHref(id, f) + (lifecycle ? '#poa-lifecycle' : ''),
    query = poaListHref(f).slice('/powers-of-attorney'.length);
  const blocked =
    snapshot.record && (snapshot.record.parentArchived || (!lifecycle && snapshot.record.archived));
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{title}</h1>
        <Link className={styles.link} href={cancel}>
          {t.poa.cancel}
        </Link>
      </header>
      <section className={styles.panel}>
        {blocked ? (
          <p role="alert">
            {snapshot.record?.parentArchived ? t.poa.parentArchived : t.poa.recordArchived}
          </p>
        ) : (
          <PoaEditor
            snapshot={snapshot}
            operation={operation}
            submission={randomUUID()}
            cancel={cancel}
            reload={
              id === null
                ? '/powers-of-attorney/new' + query
                : poaDetailHref(id, f, '/' + (operation === 'update' ? 'edit' : operation))
            }
            query={query}
          />
        )}
      </section>
    </main>
  );
}
