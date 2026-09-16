import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getFeeLetter } from '@/lib/fee-letters';
import {
  parseFeeLetterFilters,
  feeLetterListHref,
  feeLetterDetailHref,
  FeeLetterFilterError,
} from '@/lib/fee-letter-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { FeeLetterFields } from '../fee-letter-fields';
import styles from '../../staff/staff.module.css';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'feeLetters', action: 'view' });
  let f;
  try {
    f = parseFeeLetterFilters(await searchParams);
  } catch (e) {
    if (!(e instanceof FeeLetterFilterError)) throw e;
    notFound();
  }
  const raw = (await params).id,
    r = await getFeeLetter(session, raw);
  if (!r) notFound();
  const canEdit =
    !r.archived && !r.clientArchived && hasPermission(session.user.role, 'feeLetters', 'update');
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>
          {t.feeLettersModule.details} · {r.id}
        </h1>
        <Link className={styles.link} href={feeLetterListHref(f)}>
          {t.feeLettersModule.back}
        </Link>
      </header>
      <section className={styles.panel}>
        <p>{r.archived ? t.feeLettersModule.archived : t.feeLettersModule.current}</p>
        {r.archived ? <p>{t.feeLettersModule.recordArchived}</p> : null}
        {r.clientArchived ? <p>{t.feeLettersModule.parentArchived}</p> : null}
        <FeeLetterFields record={r} full />
        <p>{t.feeLettersModule.relationshipHelp}</p>
        <div className={styles.actions}>
          {canEdit ? (
            <>
              <Link className={styles.link} href={feeLetterDetailHref(r.id, f, '/edit')}>
                {t.feeLettersModule.edit}
              </Link>
              <Link className={styles.link} href={feeLetterDetailHref(r.id, f, '/covered')}>
                {t.feeLettersModule.covered}
              </Link>
            </>
          ) : null}
          {!r.clientArchived &&
          hasPermission(session.user.role, 'feeLetters', r.archived ? 'restore' : 'archive') ? (
            <Link
              className={styles.link}
              href={feeLetterDetailHref(r.id, f, r.archived ? '/restore' : '/archive')}
            >
              {r.archived ? t.feeLettersModule.restore : t.feeLettersModule.archive}
            </Link>
          ) : null}
        </div>
        <p>{t.feeLettersModule.lifecycleHelp}</p>
      </section>
    </main>
  );
}
