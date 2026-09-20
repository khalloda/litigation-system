import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getDocument } from '@/lib/documents';
import {
  parseDocumentFilters,
  documentListHref,
  documentDetailHref,
  DocumentFilterError,
} from '@/lib/document-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { AuditRecordEntry } from '@/app/audit-history/record-entry';
import { DocumentFields } from '../document-fields';
import styles from '../../staff/staff.module.css';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'documents', action: 'view' });
  let f;
  try {
    f = parseDocumentFilters(await searchParams);
  } catch (e) {
    if (!(e instanceof DocumentFilterError)) throw e;
    notFound();
  }
  const r = await getDocument(session, (await params).id);
  if (!r) notFound();
  const parentArchived = r.matterId ? r.matterArchived : r.clientArchived;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>
          {t.documentsModule.details} · {r.id}
        </h1>
        <Link className={styles.link} href={documentListHref(f)}>
          {t.documentsModule.back}
        </Link>
      </header>
      <AuditRecordEntry session={session} table="documents" id={r.id} />
      <section className={styles.panel}>
        <p>{r.archived ? t.documentsModule.archived : t.documentsModule.current}</p>
        {r.archived ? <p>{t.documentsModule.recordArchived}</p> : null}
        {parentArchived ? <p>{t.documentsModule.parentArchived}</p> : null}
        <DocumentFields record={r} full />
        <div className={styles.actions}>
          {!r.archived &&
          !parentArchived &&
          hasPermission(session.user.role, 'documents', 'update') ? (
            <Link className={styles.link} href={documentDetailHref(r.id, f, '/edit')}>
              {t.documentsModule.edit}
            </Link>
          ) : null}
          {!parentArchived &&
          hasPermission(session.user.role, 'documents', r.archived ? 'restore' : 'archive') ? (
            <Link
              className={styles.link}
              href={documentDetailHref(r.id, f, r.archived ? '/restore' : '/archive')}
            >
              {r.archived ? t.documentsModule.restore : t.documentsModule.archive}
            </Link>
          ) : null}
        </div>
        <p>{t.documentsModule.lifecycleHelp}</p>
      </section>
    </main>
  );
}
