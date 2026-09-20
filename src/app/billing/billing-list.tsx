import Link from 'next/link';
import type { Session } from 'next-auth';
import { getBilling } from '@/lib/billing';
import {
  billingDefaults,
  billingHref,
  BillingFilterError,
  type BillingKind,
} from '@/lib/billing-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { ListFilterClear } from '../list-filter-clear';
import { BillingFields } from './billing-fields';
import styles from '../staff/staff.module.css';
import local from './billing.module.css';
export async function BillingList({
  session,
  kind,
  params,
}: {
  session: Session;
  kind: BillingKind;
  params: ClientSearchParams;
}) {
  const labels = new Map(Object.entries(t.billing));
  let data;
  try {
    data = await getBilling(session, kind, params);
  } catch (error) {
    if (!(error instanceof BillingFilterError)) throw error;
    return (
      <main className={`${styles.page} ${local.page}`}>
        <h1>{labels.get(kind)}</h1>
        <p role="alert">{t.billing.invalid}</p>
        <Link href={billingHref(kind)}>{t.billing.clear}</Link>
      </main>
    );
  }
  const f = data.filters;
  const selectKeys =
    kind === 'invoices'
      ? (['client', 'fee', 'status', 'type', 'currency'] as const)
      : (['client', 'fee', 'invoice', 'currency'] as const);
  return (
    <main className={`${styles.page} ${local.page}`}>
      <header className={styles.header}>
        <div>
          <h1>{labels.get(kind)}</h1>
          <p>{t.billing.readOnly}</p>
        </div>
        <Link href="/">{t.nav.dashboard}</Link>
        <Link href={billingHref(kind === 'invoices' ? 'payments' : 'invoices')}>
          {labels.get(kind === 'invoices' ? 'payments' : 'invoices')}
        </Link>
      </header>
      {kind === 'payments' ? <p>{t.billing.paymentHelp}</p> : null}
      <section className={styles.panel}>
        <form
          key={JSON.stringify(params)}
          method="get"
          action={billingHref(kind)}
          data-filter-form={billingHref(kind)}
        >
          <div className={local.filters}>
            <div className={styles.field}>
              <label htmlFor="billing-q">{t.billing.search}</label>
              <input
                id="billing-q"
                name="q"
                defaultValue={f.q}
                maxLength={160}
                aria-describedby="billing-search-hint"
              />
              <p id="billing-search-hint">{t.billing.searchHint}</p>
            </div>
            {selectKeys.map((key) => (
              <div className={styles.field} key={key}>
                <label htmlFor={'billing-' + key}>{labels.get(key)}</label>
                <select
                  id={'billing-' + key}
                  name={key}
                  defaultValue={new Map(Object.entries(f)).get(key)}
                >
                  <option value="all">{t.billing.all}</option>
                  <option value="missing">{t.billing.missing}</option>
                  {data.options
                    .filter((o) => o.kind === key)
                    .map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.name === '' ? t.billing.emptyValue : (o.name ?? t.billing.missing)}
                        {key !== 'currency' ? ' · ' + o.id : ''}
                      </option>
                    ))}
                </select>
              </div>
            ))}
            <div className={styles.field}>
              <label htmlFor="billing-date">{t.billing.dateFilter}</label>
              <select id="billing-date" name="date" defaultValue={f.date}>
                {(['all', 'present', 'missing'] as const).map((key) => (
                  <option key={key} value={key}>
                    {labels.get(key)}
                  </option>
                ))}
              </select>
            </div>
            {(['from', 'to'] as const).map((key) => (
              <div className={styles.field} key={key}>
                <label htmlFor={'billing-' + key}>{labels.get(key)}</label>
                <input
                  type="date"
                  id={'billing-' + key}
                  name={key}
                  defaultValue={new Map(Object.entries(f)).get(key)}
                />
              </div>
            ))}
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.common.search}
            </button>
            <ListFilterClear
              className={styles.link}
              href={billingHref(kind)}
              label={t.billing.clear}
              defaults={billingDefaults(kind)}
            />
          </div>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>
          {t.billing.results} · <span data-total>{data.total}</span>
        </h2>
        <p>
          {t.billing.shown} · {data.rows.length}
        </p>
        {data.clamped ? <p>{t.billing.clamped}</p> : null}
        {data.rows.length ? (
          data.rows.map((r) => (
            <article className={local.card} key={r.id} data-billing-id={r.id}>
              <h3>
                <Link href={billingHref(kind, f, f.page, r.id)}>
                  {t.billing.id} · {r.id}
                </Link>
              </h3>
              <BillingFields kind={kind} record={r} />
            </article>
          ))
        ) : (
          <p>{t.billing.empty}</p>
        )}
        <nav className={styles.pagination} aria-label={t.billing.results}>
          {f.page > 1 ? (
            <Link href={billingHref(kind, f, f.page - 1)}>{t.billing.previous}</Link>
          ) : null}
          <p>
            {t.billing.page} {f.page} {t.billing.of} {data.pages}
          </p>
          {f.page < data.pages ? (
            <Link href={billingHref(kind, f, f.page + 1)}>{t.billing.next}</Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
