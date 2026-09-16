import Link from 'next/link';
import type { DocumentRecord } from '@/lib/document-query';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from '../powers-of-attorney/poa.module.css';
const Value = ({ label, value }: { label: string; value: string | number | null }) => (
  <div>
    <dt>{label}</dt>
    <dd className={local.value}>{value ?? t.documentsModule.unknown}</dd>
  </div>
);
export function DocumentFields({
  record: r,
  full = false,
}: {
  record: DocumentRecord;
  full?: boolean;
}) {
  return (
    <>
      <dl className={local.fields}>
        <Value label={t.documentsModule.technicalId} value={r.id} />
        <Value label={t.documentsModule.legacyId} value={r.legacyId} />
        <Value label={t.documentsModule.description} value={r.description} />
        <Value label={t.documentsModule.documentDate} value={r.documentDate} />
        <Value label={t.documentsModule.pageCount} value={r.pageCount} />
        <Value label={t.documentsModule.depositDate} value={r.depositDate} />
        <div>
          <dt>{t.documentsModule.currentClient}</dt>
          <dd>
            {r.clientId ? (
              <Link className={styles.nameLink} href={'/clients/' + r.clientId}>
                {r.clientName ?? t.documentsModule.unknown}
              </Link>
            ) : (
              t.documentsModule.unknown
            )}
          </dd>
        </div>
        <div>
          <dt>{t.documentsModule.currentMatter}</dt>
          <dd>
            {r.matterId ? (
              <Link className={styles.nameLink} href={'/matters/' + r.matterId}>
                {r.matterNumber ?? t.documentsModule.unknown}
              </Link>
            ) : (
              t.documentsModule.unknown
            )}
          </dd>
        </div>
        <Value label={t.documentsModule.responsible} value={r.personName} />
        <Value label={t.documentsModule.mfilesId} value={r.mfilesId} />
        {full ? (
          <>
            <Value label={t.documentsModule.movementCard} value={r.movementCard} />
            <Value label={t.documentsModule.storageLocation} value={r.storageLocation} />
            <Value label={t.fields.notes} value={r.notes} />
          </>
        ) : null}
      </dl>
      {full ? (
        <section className={local.source}>
          <h2>{t.documentsModule.source}</h2>
          <dl className={local.fields}>
            <Value label={t.documentsModule.sourceClient} value={r.sourceClient} />
            <Value label={t.documentsModule.sourceMatter} value={r.sourceMatter} />
            <Value label={t.documentsModule.sourcePerson} value={r.sourcePerson} />
            <Value label={t.documentsModule.sourcePages} value={r.sourcePageCount} />
            <Value label={t.documentsModule.sourceMfiles} value={r.sourceMfiles} />
            <Value label={t.documentsModule.evidence} value={r.evidenceCount} />
          </dl>
        </section>
      ) : null}
    </>
  );
}
