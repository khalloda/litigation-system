import Link from 'next/link';
import type { BillingKind, BillingRecord } from '@/lib/billing-query';
import { billingDecimal } from '@/lib/billing-format';
import { t } from '@/strings';
import styles from './billing.module.css';
const text = (value: string | number | null) =>
  value === null ? t.billing.missing : value === '' ? t.billing.emptyValue : String(value);
export function BillingFields({
  record: r,
  kind,
  full = false,
}: {
  record: BillingRecord;
  kind: BillingKind;
  full?: boolean;
}) {
  const values: [string, string | number | null][] = [
    [t.billing.id, r.id],
    [t.billing.legacyId, r.legacyId],
    [t.billing.invoiceNo, r.invoiceNo],
    [t.billing.date, r.date],
    [t.billing.currency, r.currency],
    ...(kind === 'invoices'
      ? ([
          [t.billing.amount, billingDecimal(r.amount)],
          [t.billing.status, r.status],
          [t.billing.type, r.type],
        ] as [string, string | null][])
      : ([
          [t.billing.credit, billingDecimal(r.credit)],
          [t.billing.debit, billingDecimal(r.debit)],
        ] as [string, string | null][])),
  ];
  return (
    <>
      <dl className={styles.fields}>
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <bdi>{text(value)}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <p>
        {t.billing.client}:{' '}
        {r.clientId !== null ? (
          <Link href={'/clients/' + r.clientId}>{text(r.clientName)}</Link>
        ) : (
          t.billing.missing
        )}
      </p>
      <p>
        {t.billing.fee}:{' '}
        {r.feeId !== null ? (
          <Link href={'/fee-letters/' + r.feeId}>
            {text(r.contractId)} · {r.feeId}
          </Link>
        ) : (
          t.billing.missing
        )}
      </p>
      {kind === 'payments' ? (
        <p>
          {t.billing.invoice}:{' '}
          {r.invoiceId !== null ? (
            <Link href={'/billing/invoices/' + r.invoiceId}>
              {text(r.invoiceNo)} · {r.invoiceId}
            </Link>
          ) : (
            t.billing.missing
          )}
        </p>
      ) : null}
      {r.clientArchived || r.feeArchived ? <p>{t.billing.parentArchived}</p> : null}
      {full ? (
        <section>
          <h2>{t.billing.details}</h2>
          <p className={styles.longText}>{text(r.details)}</p>
        </section>
      ) : null}
    </>
  );
}
