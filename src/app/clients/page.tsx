import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listClients } from '@/lib/clients';
import {
  CLIENT_SEARCH_LIMIT,
  ClientFilterError,
  clientListHref,
  clientDetailHref,
  type ClientSearchParams,
} from '@/lib/client-query';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from './clients.module.css';
import { Field, classificationLabel, statusLabel } from './client-fields';
import { ClientAlert } from './client-alert';
export const metadata: Metadata = { title: t.clients.title };
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'clients', action: 'view' });
  let snapshot;
  try {
    snapshot = await listClients(session, await searchParams);
  } catch (error) {
    if (!(error instanceof ClientFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.clients.title}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href="/clients">
            {t.clients.clear}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  const { rows, total, pages, filters } = snapshot;
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#client-results">
        {t.clients.skip}
      </a>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.clients.title}</h1>
          <p>{t.clients.subtitle}</p>
          {hasPermission(session.user.role, 'clients', 'create') ? (
            <Link
              className={styles.link}
              href={`/clients/new${clientListHref(filters).slice('/clients'.length)}`}
            >
              {t.clients.manage.titles['client-create']}
            </Link>
          ) : null}
        </div>
        <Link className={styles.link} href="/">
          {t.nav.dashboard}
        </Link>
      </header>
      <section className={styles.panel} aria-label={t.common.search}>
        <form key={clientListHref(filters)} action="/clients" method="get">
          <div className={local.filters}>
            <div className={styles.field}>
              <label htmlFor="client-search">{t.clients.searchLabel}</label>
              <input
                id="client-search"
                type="search"
                name="q"
                defaultValue={filters.q}
                maxLength={CLIENT_SEARCH_LIMIT}
                aria-describedby="client-search-hint"
              />
              <p id="client-search-hint" className={styles.hint}>
                {t.clients.searchHint}
              </p>
            </div>
            <div className={styles.field}>
              <label htmlFor="client-status">{t.clients.status}</label>
              <select id="client-status" name="status" defaultValue={filters.status}>
                <option value="all">{t.clients.allStatuses}</option>
                <option value="Active">{t.clients.active}</option>
                <option value="Disabled">{t.clients.disabled}</option>
                <option value="Potential">{t.clients.potential}</option>
                <option value="missing">{t.common.notRecorded}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="client-archive">{t.clients.archive}</label>
              <select id="client-archive" name="archive" defaultValue={filters.archive}>
                <option value="current">{t.clients.current}</option>
                <option value="archived">{t.clients.archived}</option>
                <option value="all">{t.clients.allArchives}</option>
              </select>
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.clients.apply}
            </button>
            <Link className={styles.link} href="/clients">
              {t.clients.clear}
            </Link>
          </div>
        </form>
      </section>
      <section
        id="client-results"
        tabIndex={-1}
        className={`${styles.panel} ${styles.focusTarget}`}
        aria-label={t.clients.title}
      >
        <div className={styles.resultsHeading}>
          <h2>{t.clients.title}</h2>
          <p role="status" aria-live="polite" aria-atomic="true">
            {t.clients.results(total)}
          </p>
        </div>
        {rows.length ? (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li className={styles.row} key={row.id}>
                <div className={local.multiline}>
                  <h3>
                    <Link className={styles.nameLink} href={clientDetailHref(row.id, filters)}>
                      <bdi>{row.nameAr}</bdi>
                    </Link>
                  </h3>
                  {row.nameEn ? (
                    <p className={styles.secondary} dir="auto">
                      {row.nameEn}
                    </p>
                  ) : null}
                  {row.matchedContact ? (
                    <p className={styles.aliasMatch}>{t.clients.matchContact}</p>
                  ) : null}
                </div>
                <dl>
                  <Field label={t.clients.systemId} value={row.id} />
                  <Field label={t.clients.accessId} value={row.legacyId ?? t.clients.native} />
                </dl>
                <dl>
                  <Field label={t.clients.status} value={statusLabel(row.status)} />
                  <Field
                    label={t.clients.classification}
                    value={classificationLabel(row.classification)}
                  />
                </dl>
                <dl>
                  <Field
                    label={t.clients.archive}
                    value={row.isArchived ? t.clients.archived : t.clients.current}
                  />
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <h3>{t.common.noResults}</h3>
            <p>{t.clients.empty}</p>
            <Link className={styles.link} href={clientListHref({ ...filters, archive: 'all' }, 1)}>
              {t.clients.allArchives}
            </Link>
          </div>
        )}
        <nav className={styles.pagination} aria-label={t.clients.pagination}>
          {filters.page > 1 ? (
            <Link className={styles.link} href={clientListHref(filters, filters.page - 1)}>
              {t.clients.previous}
            </Link>
          ) : null}
          <p>{t.clients.page(filters.page, pages)}</p>
          {filters.page < pages ? (
            <Link className={styles.link} href={clientListHref(filters, filters.page + 1)}>
              {t.clients.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
