import Link from 'next/link';
import type { Session } from 'next-auth';
import { AuditRecordEntry } from '@/app/audit-history/record-entry';
import type { FeeLetterRecord, FeeLetterMatterLink } from '@/lib/fee-letter-query';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from '../powers-of-attorney/poa.module.css';
const Value = ({ label, value }: { label: string; value: string | number | null }) => (
  <div>
    <dt>{label}</dt>
    <dd className={local.value}>{value ?? t.feeLettersModule.unknown}</dd>
  </div>
);
function Matters({
  rows,
  empty,
  session,
  table,
}: {
  rows: FeeLetterMatterLink[];
  empty: string;
  session?: Session;
  table?: 'fee_letter_matters' | 'matter_fee_letter_references';
}) {
  return rows.length ? (
    <ul className={local.members}>
      {rows.map((r) => (
        <li key={r.id}>
          {session && table ? <AuditRecordEntry session={session} table={table} id={r.id} /> : null}
          <Link className={styles.nameLink} href={'/matters/' + r.matterId}>
            {r.matterNumber ?? String(r.matterId)}
          </Link>
          {r.retired ? ' · ' + t.feeLettersModule.retired : ''}
          {r.original ? ' · ' + t.feeLettersModule.original : ''}
          {r.matterArchived ? ' · ' + t.feeLettersModule.archived : ''}
          {r.sourceReference ? (
            <span>
              {' '}
              · {t.feeLettersModule.sourceReference}: {r.sourceReference}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  ) : (
    <p>{empty}</p>
  );
}
export function FeeLetterFields({
  record: r,
  full = false,
  session,
}: {
  record: FeeLetterRecord;
  full?: boolean;
  session?: Session;
}) {
  return (
    <>
      <dl className={local.fields}>
        <Value label={t.feeLettersModule.technicalId} value={r.id} />
        <Value label={t.feeLettersModule.contractId} value={r.contractId} />
        <div>
          <dt>{t.feeLettersModule.client}</dt>
          <dd>
            {r.clientId ? (
              <Link className={styles.nameLink} href={'/clients/' + r.clientId}>
                {r.clientName ?? t.feeLettersModule.unknown}
              </Link>
            ) : (
              t.feeLettersModule.unknown
            )}
          </dd>
        </div>
        <Value label={t.feeLettersModule.mfilesId} value={r.mfilesId} />
        <Value label={t.feeLettersModule.type} value={r.contractType} />
        <Value label={t.feeLettersModule.date} value={r.contractDate} />
        {full ? (
          <>
            <Value label={t.feeLettersModule.detailsField} value={r.contractDetails} />
            <Value label={t.feeLettersModule.structure} value={r.contractStructure} />
          </>
        ) : null}
      </dl>
      <h3>{t.feeLettersModule.covered}</h3>
      <Matters
        rows={r.covered.filter((x) => !x.retired)}
        empty={t.feeLettersModule.missing}
        session={session}
        table="fee_letter_matters"
      />
      {full ? (
        <>
          <h3>{t.feeLettersModule.referencing}</h3>
          <Matters
            rows={r.referencing.filter((x) => !x.retired)}
            session={session}
            table="matter_fee_letter_references"
            empty={t.feeLettersModule.missing}
          />
          <section className={local.source}>
            <h2>{t.feeLettersModule.source}</h2>
            <dl className={local.fields}>
              <Value label={t.feeLettersModule.sourceClient} value={r.sourceClientName} />
              <Value label={t.feeLettersModule.sourceMfiles} value={r.sourceMfilesId} />
              <Value label={t.feeLettersModule.sourceStatus} value={r.sourceStatus} />
              <Value label={t.feeLettersModule.invoices} value={r.invoiceCount} />
              <Value
                label={t.feeLettersModule.quarantine}
                value={r.forwardQuarantineCount + r.reverseQuarantineCount}
              />
            </dl>
            <h3>{t.feeLettersModule.coveredHistory}</h3>
            <Matters
              rows={r.covered.filter((x) => x.retired || x.original)}
              session={session}
              table="fee_letter_matters"
              empty={t.feeLettersModule.missing}
            />
            <h3>{t.feeLettersModule.referencingHistory}</h3>
            <Matters
              rows={r.referencing.filter((x) => x.retired || x.original)}
              session={session}
              table="matter_fee_letter_references"
              empty={t.feeLettersModule.missing}
            />
          </section>
        </>
      ) : null}
    </>
  );
}
