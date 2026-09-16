import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Session } from 'next-auth';
import { readFeeLetterMutation } from '@/lib/fee-letter-mutations';
import { FeeLetterMutationError, type FeeLetterOperation } from '@/lib/fee-letter-mutation-input';
import {
  parseFeeLetterFilters,
  feeLetterListHref,
  feeLetterDetailHref,
  FeeLetterFilterError,
} from '@/lib/fee-letter-query';
import { clientId, type ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { FeeLetterEditor } from './fee-letter-editor';
import styles from '../staff/staff.module.css';
export async function FeeLetterManagementPage({
  session,
  operation,
  rawId,
  searchParams,
}: {
  session: Session;
  operation: FeeLetterOperation;
  rawId: string | null;
  searchParams: ClientSearchParams;
}) {
  let f;
  try {
    f = parseFeeLetterFilters(searchParams);
  } catch (e) {
    if (!(e instanceof FeeLetterFilterError)) throw e;
    notFound();
  }
  const id = rawId === null ? null : clientId(rawId);
  if (rawId !== null && id === null) notFound();
  let snapshot;
  try {
    snapshot = await readFeeLetterMutation(session, operation, id);
  } catch (e) {
    if (e instanceof FeeLetterMutationError && e.code === 'not-found') notFound();
    throw e;
  }
  const title =
    operation === 'create'
      ? t.feeLettersModule.create
      : operation === 'update'
        ? t.feeLettersModule.edit
        : operation === 'archive'
          ? t.feeLettersModule.archive
          : t.feeLettersModule.restore;
  const cancel = id === null ? feeLetterListHref(f) : feeLetterDetailHref(id, f),
    query = feeLetterListHref(f).slice('/fee-letters'.length),
    blocked =
      snapshot.record &&
      ((snapshot.record.archived && operation === 'update') ||
        Boolean(snapshot.record.facts.clientArchived));
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{title}</h1>
        <Link className={styles.link} href={cancel}>
          {t.feeLettersModule.cancel}
        </Link>
      </header>
      <section className={styles.panel}>
        {blocked ? (
          <p role="alert">
            {snapshot.record?.archived
              ? t.feeLettersModule.recordArchived
              : t.feeLettersModule.parentArchived}
          </p>
        ) : (
          <FeeLetterEditor
            snapshot={snapshot}
            operation={operation}
            submission={randomUUID()}
            cancel={cancel}
            reload={
              id === null
                ? '/fee-letters/new' + query
                : feeLetterDetailHref(id, f, '/' + (operation === 'update' ? 'edit' : operation))
            }
            query={query}
          />
        )}
      </section>
    </main>
  );
}
