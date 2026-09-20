import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Session } from 'next-auth';
import { getBillingRecord } from '@/lib/billing';
import {
  billingHref,
  parseBillingFilters,
  BillingFilterError,
  type BillingKind,
} from '@/lib/billing-query';
import { billingPercent } from '@/lib/billing-format';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { AuditRecordEntry } from '@/app/audit-history/record-entry';
import { BillingFields } from './billing-fields';
import styles from '../staff/staff.module.css';
import local from './billing.module.css';
export async function BillingDetail({
  session,
  kind,
  id,
  params,
}: {
  session: Session;
  kind: BillingKind;
  id: string;
  params: ClientSearchParams;
}) {
  let data, filters;
  try {
    const { allocationPage, ...context } = params;
    if (allocationPage !== undefined && (kind !== 'invoices' || typeof allocationPage !== 'string'))
      throw new BillingFilterError('allocation page');
    filters = parseBillingFilters(kind, context);
    data = await getBillingRecord(session, kind, id, allocationPage as string | undefined);
  } catch (e) {
    if (!(e instanceof BillingFilterError)) throw e;
    return (
      <main className={`${styles.page} ${local.page}`}>
        <p role="alert">{t.billing.invalid}</p>
        <Link href={billingHref(kind)}>{t.billing.clear}</Link>
      </main>
    );
  }
  if (!data) notFound();
  const href = (page: number) => {
    const url = billingHref(kind, filters, filters.page, data.record.id);
    return url + (url.includes('?') ? '&' : '?') + 'allocationPage=' + page;
  };
  return (
    <main className={`${styles.page} ${local.page}`}>
      <header className={styles.header}>
        <h1>
          {kind === 'invoices' ? t.billing.invoices : t.billing.payments} · {data.record.id}
        </h1>
        <Link href={billingHref(kind, filters)}>{t.billing.back}</Link>
      </header>
      <AuditRecordEntry session={session} table={kind} id={data.record.id} />
      <section className={styles.panel}>
        <p>{t.billing.readOnly}</p>
        <BillingFields record={data.record} kind={kind} full />
        <p>{t.billing.relationsHelp}</p>
        {kind === 'payments' ? <p>{t.billing.paymentHelp}</p> : null}
      </section>
      {kind === 'invoices' ? (
        <>
          <section className={styles.panel}>
            <h2>
              {t.billing.payments} · {data.paymentCount}
            </h2>
            <p>
              {t.billing.shown} · {data.payments.length}
            </p>
            <Link href={'/billing/payments?invoice=' + data.record.id}>
              {t.billing.allPayments}
            </Link>
            {data.payments.length ? (
              data.payments.map((r) => (
                <article className={local.card} key={r.id}>
                  <h3>
                    <Link href={'/billing/payments/' + r.id + '?invoice=' + data.record.id}>
                      {t.billing.id} · {r.id}
                    </Link>
                  </h3>
                  <BillingFields record={r} kind="payments" />
                </article>
              ))
            ) : (
              <p>{t.billing.empty}</p>
            )}
          </section>
          <section className={styles.panel}>
            <h2>
              {t.billing.allocations} · {data.allocationCount}
            </h2>
            <p>{t.billing.sharesHelp}</p>
            <p id="billing-table-hint">{t.billing.tableHint}</p>
            {data.allocations.length ? (
              <div
                className={local.tableRegion}
                tabIndex={0}
                role="region"
                aria-label={t.billing.allocations}
                aria-describedby="billing-table-hint"
              >
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t.billing.id}</th>
                      <th scope="col">{t.auditHistory.title}</th>
                      <th scope="col">{t.billing.person}</th>
                      <th scope="col">{t.billing.role}</th>
                      <th scope="col">{t.billing.share}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.allocations.map((a) => (
                      <tr key={a.id} data-allocation-id={a.id}>
                        <td>{a.id}</td>
                        <td>
                          <AuditRecordEntry
                            session={session}
                            table="invoice_allocations"
                            id={a.id}
                          />
                        </td>
                        <td>
                          {a.personName ?? t.billing.missing}
                          {a.personId !== null ? ' · ' + a.personId : ''}
                          {a.active === false ? ' · ' + t.billing.inactive : ''}
                        </td>
                        <td>{a.role ?? t.billing.missing}</td>
                        <td>
                          <bdi>{billingPercent(a.share) ?? t.billing.missing}</bdi>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{t.billing.empty}</p>
            )}
            <nav className={styles.pagination} aria-label={t.billing.allocations}>
              {data.allocationPage > 1 ? (
                <Link href={href(data.allocationPage - 1)}>{t.billing.previous}</Link>
              ) : null}
              <p>
                {t.billing.page} {data.allocationPage} {t.billing.of} {data.allocationPages}
              </p>
              {data.allocationPage < data.allocationPages ? (
                <Link href={href(data.allocationPage + 1)}>{t.billing.next}</Link>
              ) : null}
            </nav>
          </section>
        </>
      ) : null}
    </main>
  );
}
