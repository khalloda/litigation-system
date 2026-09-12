import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listMatters } from '@/lib/matters';
import {
  MATTER_SEARCH_LIMIT,
  MatterFilterError,
  matterListHref,
  matterDetailHref,
  type MatterFilterKey,
} from '@/lib/matter-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { Field } from '../clients/client-fields';
import { ClientAlert } from '../clients/client-alert';
import styles from '../staff/staff.module.css';
import local from './matters.module.css';

export const metadata: Metadata = { title: t.matters.title };
export default async function MattersPage({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'matters', action: 'view' });
  let snapshot;
  try {
    snapshot = await listMatters(session, await searchParams);
  } catch (error) {
    if (!(error instanceof MatterFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.matters.title}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href="/matters">
            {t.clients.clear}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  const { rows, total, pages, filters, options } = snapshot;
  const primaryFilters = [
    ['client', t.matters.filters.client, filters.client],
    ['status', t.matters.filters.status, filters.status],
    ['lawyer', t.matters.filters.lawyer, filters.lawyer],
  ] as const;
  const moreFilters = [
    ['type', t.matters.filters.type, filters.type],
    ['category', t.matters.filters.category, filters.category],
    ['degree', t.matters.filters.degree, filters.degree],
    ['venue', t.matters.filters.venue, filters.venue],
    ['branch', t.matters.filters.branch, filters.branch],
  ] as const;
  const select = ([key, label, selected]: readonly [MatterFilterKey, string, string]) => (
    <div className={styles.field} key={key}>
      <label htmlFor={`matter-${key}`}>{label}</label>
      <select id={`matter-${key}`} name={key} defaultValue={selected}>
        <option value="all">{t.matters.all}</option>
        <option value="missing">
          {key === 'lawyer' ? t.matters.noLawyer : t.common.notRecorded}
        </option>
        {options
          .filter((o) => o.kind === key)
          .map((o) => (
            <option key={o.value} value={o.value}>
              {key === 'client' || key === 'lawyer' ? t.matters.option(o.label, o.value) : o.label}
              {o.archived ? ` — ${t.clients.archived}` : ''}
              {o.inactive ? ` — ${t.matters.former}` : ''}
            </option>
          ))}
      </select>
    </div>
  );
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#matter-results">
        {t.matters.skip}
      </a>
      <header className={styles.header}>
        {hasPermission(session.user.role, 'matters', 'create') ? (
          <Link
            className={styles.button}
            href={`/matters/new${matterListHref(filters).slice('/matters'.length)}`}
          >
            {t.matters.manage.create}
          </Link>
        ) : null}
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.matters.title}</h1>
          <p>{t.matters.subtitle}</p>
        </div>
        <Link className={styles.link} href="/">
          {t.nav.dashboard}
        </Link>
        {filters.fromClient ? (
          <Link className={styles.link} href={filters.fromClient}>
            {t.clients.backClient}
          </Link>
        ) : null}
      </header>
      <section className={styles.panel} aria-label={t.common.search}>
        <form key={matterListHref(filters)} action="/matters" method="get">
          {filters.fromClient ? (
            <input type="hidden" name="fromClient" value={filters.fromClient} />
          ) : null}
          <div className={styles.field}>
            <label htmlFor="matter-search">{t.matters.searchLabel}</label>
            <input
              id="matter-search"
              name="q"
              type="search"
              maxLength={MATTER_SEARCH_LIMIT}
              defaultValue={filters.q}
              aria-describedby="matter-search-hint"
            />
            <p id="matter-search-hint" className={styles.hint}>
              {t.matters.searchHint}
            </p>
          </div>
          <div className={local.filters}>{primaryFilters.map(select)}</div>
          <details className={local.more} open={moreFilters.some(([, , value]) => value !== 'all')}>
            <summary>{t.matters.moreFilters}</summary>
            <div className={local.filters}>{moreFilters.map(select)}</div>
          </details>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.clients.apply}
            </button>
            <Link className={styles.link} href="/matters">
              {t.clients.clear}
            </Link>
          </div>
        </form>
      </section>
      <section
        id="matter-results"
        tabIndex={-1}
        className={`${styles.panel} ${styles.focusTarget}`}
        aria-label={t.matters.title}
      >
        <div className={styles.resultsHeading}>
          <h2>{t.matters.title}</h2>
          <p role="status" aria-live="polite" aria-atomic="true">
            {t.matters.results(total)}
          </p>
        </div>
        {rows.length ? (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li className={styles.row} key={row.id} data-matter-id={row.id}>
                <div>
                  <h3>
                    <Link className={styles.nameLink} href={matterDetailHref(row.id, filters)}>
                      <bdi className={local.multiline}>
                        {row.caseNumber?.trim() ? row.caseNumber : t.common.notRecorded}
                      </bdi>
                    </Link>
                  </h3>
                  <p className={local.multiline} dir="auto">
                    {row.subject}
                  </p>
                  {row.matches.length ? (
                    <div className={local.matches}>
                      <span>{t.matters.searchIncludes}</span>
                      <ul>
                        {row.matches.map((match, i) => (
                          <li key={i} className={local.multiline} dir="auto">
                            {match}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <dl>
                  <Field
                    label={t.fields.client}
                    value={
                      row.clientId ? (
                        <Link
                          className={styles.nameLink}
                          href={`/clients/${row.clientId}?matterReturn=${encodeURIComponent(matterListHref(filters))}`}
                        >
                          {row.clientName}
                        </Link>
                      ) : null
                    }
                  />
                  {row.clientArchived ? (
                    <Field label={t.clients.archive} value={t.clients.archived} />
                  ) : null}
                  <Field label={t.matters.filters.branch} value={row.branch} />
                </dl>
                <dl>
                  <Field label={t.matters.filters.status} value={row.status} />
                  <Field label={t.matters.filters.type} value={row.type} />
                  <Field label={t.matters.filters.degree} value={row.degree} />
                </dl>
                <div>
                  <p className={row.lawyerCount ? undefined : local.unassigned}>
                    {row.lawyerCount ? t.matters.lawyerCount(row.lawyerCount) : t.matters.noLawyer}
                  </p>
                  <dl>
                    <Field label={t.clients.systemId} value={row.id} />
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <h3>{t.common.noResults}</h3>
            <p>{t.matters.empty}</p>
          </div>
        )}
        <nav className={styles.pagination} aria-label={t.matters.pagination}>
          {filters.page > 1 ? (
            <Link className={styles.link} href={matterListHref(filters, filters.page - 1)}>
              {t.clients.previous}
            </Link>
          ) : null}
          <p>{t.clients.page(filters.page, pages)}</p>
          {filters.page < pages ? (
            <Link className={styles.link} href={matterListHref(filters, filters.page + 1)}>
              {t.clients.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
