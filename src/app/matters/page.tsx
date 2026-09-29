import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listMatters } from '@/lib/matters';
import {
  MATTER_SEARCH_LIMIT,
  MatterFilterError,
  matterListHref,
  type MatterFilterKey,
} from '@/lib/matter-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { ClientAlert } from '../clients/client-alert';
import styles from '../staff/staff.module.css';
import local from './matters.module.css';
import { MatterDetail } from './matter-detail';
import { MatterWorkspace } from './matter-workspace';
import { MatterFilterPanel } from './filter-panel';
import { Icon } from '../_components/icon';
import { reportClientContext } from '@/lib/reports/client-context';

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
      <main className={styles.page} data-workspace>
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
  const selected = reportClientContext((await searchParams).selected);
  const listHref = matterListHref(filters);
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
    <main className={styles.page} data-workspace>
      <a className={styles.skip} href="#matter-results">
        {t.matters.skip}
      </a>
      <header className={local.toolbarTitle}>
        <h1>{t.matters.title}</h1>
        <div className={local.search}>
          <Icon name="Search" />
          <label className={local.srOnly} htmlFor="matter-search">
            {t.matters.searchLabel}
          </label>
          <input
            id="matter-search"
            form="matter-filter-form"
            name="q"
            type="search"
            maxLength={MATTER_SEARCH_LIMIT}
            defaultValue={filters.q}
            placeholder={t.matters.searchLabel}
            aria-describedby="matter-search-hint"
          />
          <details className={local.searchHelp}>
            <summary>{t.ui.searchHelp}</summary>
            <p id="matter-search-hint">{t.matters.searchHint}</p>
          </details>
        </div>
        {hasPermission(session.user.role, 'matters', 'create') ? (
          <Link
            className={styles.button}
            href={`/matters/new${matterListHref(filters).slice('/matters'.length)}`}
          >
            {t.matters.manage.create}
          </Link>
        ) : null}
      </header>
      {filters.fromClient ? (
        <Link className={styles.link} href={filters.fromClient}>
          {t.clients.backClient}
        </Link>
      ) : null}
      <MatterFilterPanel>
        <form
          id="matter-filter-form"
          key={matterListHref(filters)}
          action="/matters"
          method="get"
          className={local.filterForm}
        >
          {filters.fromClient ? (
            <input type="hidden" name="fromClient" value={filters.fromClient} />
          ) : null}
          <div className={local.filters}>
            {primaryFilters.map(select)}
            <div className={styles.field}>
              <label htmlFor="matter-archive">{t.matters.lifecycle.archiveFilter}</label>
              <select id="matter-archive" name="archive" defaultValue={filters.archive}>
                <option value="current">{t.matters.lifecycle.current}</option>
                <option value="archived">{t.matters.lifecycle.archivedFilter}</option>
                <option value="all">{t.matters.lifecycle.all}</option>
              </select>
            </div>
          </div>
          <div className={local.filterActions}>
            <button className={styles.button} type="submit">
              {t.clients.apply}
            </button>
            <Link className={styles.link} href="/matters">
              {t.clients.clear}
            </Link>
            <details
              className={local.more}
              open={moreFilters.some(([, , value]) => value !== 'all')}
            >
              <summary>{t.matters.moreFilters}</summary>
              <div className={local.extraFilters}>{moreFilters.map(select)}</div>
            </details>
          </div>
        </form>
      </MatterFilterPanel>
      <MatterWorkspace
        selected={selected}
        listHref={listHref}
        detail={
          selected ? (
            <>
              <MatterDetail
                session={session}
                params={Promise.resolve({ id: String(selected) })}
                searchParams={searchParams}
                embedded
              />
            </>
          ) : (
            <p>{t.ui.chooseMatter}</p>
          )
        }
      >
        <section
          id="matter-results"
          tabIndex={-1}
          className={`${local.results} ${styles.focusTarget}`}
          aria-label={t.matters.title}
        >
          <div className={styles.resultsHeading}>
            <h2>{t.ui.searchResults}</h2>
            <p role="status" aria-live="polite" aria-atomic="true">
              {t.matters.results(total)}
            </p>
          </div>
          {rows.length ? (
            <ul className={styles.list}>
              {rows.map((row) => (
                <li
                  className={`${styles.row} ${selected === row.id ? local.selected : ''}`}
                  key={row.id}
                  data-matter-id={row.id}
                >
                  <div>
                    <h3>
                      <Link
                        className={styles.nameLink}
                        id={`matter-select-${row.id}`}
                        aria-current={selected === row.id ? 'true' : undefined}
                        scroll={false}
                        href={`${listHref}${listHref.includes('?') ? '&' : '?'}selected=${row.id}`}
                      >
                        <bdi className={local.multiline}>
                          {row.caseNumber?.trim() ? row.caseNumber : t.common.notRecorded}
                        </bdi>
                      </Link>
                    </h3>
                    <p className={local.multiline} dir="auto">
                      {row.subject}
                    </p>
                    {row.matches.length ? (
                      <details className={local.matches}>
                        <summary>{t.matters.searchIncludes}</summary>
                        <ul>
                          {row.matches.map((match, i) => (
                            <li key={i} className={local.multiline} dir="auto">
                              {match}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                  <p className={local.resultMeta}>
                    {row.archived
                      ? t.matters.lifecycle.archivedFilter
                      : (row.status ?? t.common.notRecorded)}
                    {' · '}
                    {t.matters.filters.branch}: {row.branch ?? t.common.notRecorded}
                  </p>
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
      </MatterWorkspace>
    </main>
  );
}
