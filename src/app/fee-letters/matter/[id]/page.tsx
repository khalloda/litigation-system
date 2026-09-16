import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { readMatterFeeReferenceMutation } from '@/lib/fee-letter-mutations';
import { clientId } from '@/lib/client-query';
import { t } from '@/strings';
import { MatterFeeReferenceEditor } from '../../fee-letter-editor';
import styles from '../../../staff/staff.module.css';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission({ area: 'feeLetters', action: 'update' });
  const id = clientId((await params).id);
  if (id === null) notFound();
  const snapshot = await readMatterFeeReferenceMutation(session, id),
    cancel = '/matters/' + id;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>
          {t.feeLettersModule.matterReferenceTitle} · {snapshot.matterName ?? id}
        </h1>
        <Link className={styles.link} href={cancel}>
          {t.feeLettersModule.cancel}
        </Link>
      </header>
      <section className={styles.panel}>
        {snapshot.matterArchived ? (
          <p role="alert">{t.feeLettersModule.parentArchived}</p>
        ) : (
          <MatterFeeReferenceEditor snapshot={snapshot} cancel={cancel} />
        )}
      </section>
    </main>
  );
}
