import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { readFeeLetterMutation } from '@/lib/fee-letter-mutations';
import { clientId, type ClientSearchParams } from '@/lib/client-query';
import {
  parseFeeLetterFilters,
  feeLetterDetailHref,
  FeeLetterFilterError,
} from '@/lib/fee-letter-query';
import { t } from '@/strings';
import { CoveredMatterEditor } from '../../fee-letter-editor';
import styles from '../../../staff/staff.module.css';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'feeLetters', action: 'update' });
  const id = clientId((await params).id);
  if (id === null) notFound();
  let filters;
  try {
    filters = parseFeeLetterFilters(await searchParams);
  } catch (error) {
    if (!(error instanceof FeeLetterFilterError)) throw error;
    notFound();
  }
  const snapshot = await readFeeLetterMutation(session, 'update', id);
  const cancel = feeLetterDetailHref(id, filters);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t.feeLettersModule.covered}</h1>
        <Link className={styles.link} href={cancel}>
          {t.feeLettersModule.cancel}
        </Link>
      </header>
      <section className={styles.panel}>
        {snapshot.record?.archived || snapshot.record?.facts.clientArchived ? (
          <p role="alert">
            {snapshot.record.archived
              ? t.feeLettersModule.recordArchived
              : t.feeLettersModule.parentArchived}
          </p>
        ) : (
          <CoveredMatterEditor snapshot={snapshot} reload={cancel} />
        )}
      </section>
    </main>
  );
}
