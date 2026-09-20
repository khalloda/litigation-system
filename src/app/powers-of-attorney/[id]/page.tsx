import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getPoa } from '@/lib/powers-of-attorney';
import { parsePoaFilters, poaListHref, poaDetailHref, PoaFilterError } from '@/lib/poa-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { AuditRecordEntry } from '@/app/audit-history/record-entry';
import { PoaFields } from '../poa-fields';
import styles from '../../staff/staff.module.css';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'powersOfAttorney', action: 'view' });
  let f;
  try {
    f = parsePoaFilters(await searchParams);
  } catch (e) {
    if (!(e instanceof PoaFilterError)) throw e;
    notFound();
  }
  const r = await getPoa(session, (await params).id);
  if (!r) notFound();
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>
          {t.poa.details} · {r.id}
        </h1>
        <Link className={styles.link} href={poaListHref(f)}>
          {t.poa.back}
        </Link>
      </header>
      <AuditRecordEntry session={session} table="powers_of_attorney" id={r.id} />
      <section className={styles.panel}>
        <p>{r.archived ? t.poa.archived : t.poa.current}</p>
        {r.archived ? <p>{t.poa.recordArchived}</p> : null}
        {r.clientArchived ? <p>{t.poa.parentArchived}</p> : null}
        <PoaFields record={r} full session={session} />
        <div className={styles.actions}>
          {!r.archived &&
          !r.clientArchived &&
          hasPermission(session.user.role, 'powersOfAttorney', 'update') ? (
            <Link className={styles.link} href={poaDetailHref(r.id, f, '/edit')}>
              {t.poa.edit}
            </Link>
          ) : null}
          {!r.clientArchived &&
          hasPermission(
            session.user.role,
            'powersOfAttorney',
            r.archived ? 'restore' : 'archive',
          ) ? (
            <Link
              className={styles.link}
              id="poa-lifecycle"
              href={poaDetailHref(r.id, f, r.archived ? '/restore' : '/archive')}
            >
              {r.archived ? t.poa.restore : t.poa.archive}
            </Link>
          ) : null}
        </div>
        <p>{t.poa.copiesHelp}</p>
        <p>{t.poa.reportHelp}</p>
        <p>{t.poa.lifecycleHelp}</p>
      </section>
    </main>
  );
}
