import { hasPermission } from '@/lib/auth/permissions';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { listAdminWorks } from '@/lib/admin-works';
import {
  ADMIN_SEARCH_LIMIT,
  AdminFilterError,
  adminListHref,
  adminDetailHref,
} from '@/lib/admin-work-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { Field } from '../clients/client-fields';
import { ClientAlert } from '../clients/client-alert';
import styles from '../staff/staff.module.css';
import local from '../hearings/hearings.module.css';

export const metadata: Metadata = { title: t.adminWorks.title };
export default async function AdminWorksPage({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'administrativeWorks', action: 'view' });
  let snapshot;
  try {
    snapshot = await listAdminWorks(session, await searchParams);
  } catch (error) {
    if (!(error instanceof AdminFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.adminWorks.title}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href="/admin-works">
            {t.clients.clear}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  const { rows, total, pages, filters, options } = snapshot;
  const choices = [
    ['matter', t.nav.matters, filters.matter],
    ['client', t.fields.client, filters.client],
    ['person', t.adminWorks.person, filters.person],
    ['status', t.adminWorks.status, filters.status],
  ] as const;
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#admin-results">
        {t.adminWorks.skip}
      </a>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.adminWorks.title}</h1>
          <p>{t.adminWorks.subtitle}</p>
          {!hasPermission(session.user.role, 'administrativeWorks', 'create') ? (
            <p>{t.adminWorks.readOnly}</p>
          ) : (
            <Link
              className={styles.link}
              href={'/admin-works/new' + adminListHref(filters).slice('/admin-works'.length)}
            >
              {t.adminWorks.manage.create}
            </Link>
          )}
        </div>
        <Link className={styles.link} href="/">
          {t.nav.dashboard}
        </Link>
        {filters.fromMatter ? (
          <Link className={styles.link} href={filters.fromMatter}>
            {t.adminWorks.backMatter}
          </Link>
        ) : null}
      </header>
      <section className={styles.panel} aria-label={t.common.search}>
        <form key={adminListHref(filters)} action="/admin-works" method="get">
          {filters.fromMatter ? (
            <input type="hidden" name="fromMatter" value={filters.fromMatter} />
          ) : null}
          <div className={styles.field}>
            <label htmlFor="admin-search">{t.adminWorks.search}</label>
            <input
              id="admin-search"
              name="q"
              type="search"
              maxLength={ADMIN_SEARCH_LIMIT}
              defaultValue={filters.q}
              aria-describedby="admin-search-hint"
            />
            <p id="admin-search-hint" className={styles.hint}>
              {t.adminWorks.searchHint}
            </p>
          </div>
          <div className={local.filters}>
            <div className={styles.field}>
              <label htmlFor="admin-archive">{t.adminWorks.lifecycle.filter}</label>
              <select id="admin-archive" name="archive" defaultValue={filters.archive}>
                <option value="current">{t.adminWorks.lifecycle.current}</option>
                <option value="archived">{t.adminWorks.lifecycle.archivedChoice}</option>
                <option value="all">{t.adminWorks.lifecycle.all}</option>
              </select>
            </div>
            {choices.map(([key, label, value]) => (
              <div className={styles.field} key={key}>
                <label htmlFor={`admin-${key}`}>{label}</label>
                <select id={`admin-${key}`} name={key} defaultValue={value}>
                  <option value="all">{t.matters.all}</option>
                  <option value="missing">{t.common.notRecorded}</option>
                  {options
                    .filter((o) => o.kind === key)
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {key === 'status'
                          ? o.label?.trim()
                            ? o.label
                            : t.common.notRecorded
                          : t.matters.option(
                              o.label?.trim() ? o.label : t.common.notRecorded,
                              o.value,
                            )}
                        {o.archived ? ` — ${t.clients.archived}` : ''}
                        {o.inactive ? ` — ${t.matters.former}` : ''}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.clients.apply}
            </button>
            <Link
              className={styles.link}
              href={
                filters.fromMatter
                  ? `/admin-works?fromMatter=${encodeURIComponent(filters.fromMatter)}`
                  : '/admin-works'
              }
            >
              {t.clients.clear}
            </Link>
          </div>
        </form>
      </section>
      <section
        id="admin-results"
        tabIndex={-1}
        className={`${styles.panel} ${styles.focusTarget}`}
        aria-label={t.adminWorks.title}
      >
        <div className={styles.resultsHeading}>
          <h2>{t.adminWorks.title}</h2>
          <p role="status" aria-live="polite" aria-atomic="true">
            {t.adminWorks.results(total)}
          </p>
        </div>
        {snapshot.pageClamped ? <p role="status">{t.adminWorks.lifecycle.pageClamped}</p> : null}
        {rows.length ? (
          <ol className={local.timeline}>
            {rows.map((row) => (
              <li key={row.id} data-admin-id={row.id} className={local.row}>
                <div>
                  {row.archived ? <p>{t.adminWorks.lifecycle.archived}</p> : null}
                  <h3>
                    <Link className={styles.nameLink} href={adminDetailHref(row.id, filters)}>
                      {t.adminWorks.identity(row.id)}
                    </Link>
                  </h3>
                  <dl>
                    <Field label={t.adminWorks.createdDate} value={row.taskCreatedDate} />
                    <Field label={t.adminWorks.status} value={row.status} />
                    <Field label={t.adminWorks.person} value={row.personName} />
                    {row.assigneeRaw !== null ? (
                      <Field
                        label={t.adminWorks.person + ' — ' + t.adminWorks.sourceText}
                        value={<span className={local.multiline}>{row.assigneeRaw}</span>}
                      />
                    ) : null}
                  </dl>
                  {row.personActive === false ? <p>{t.matters.former}</p> : null}
                </div>
                <div>
                  <p className={local.multiline} dir="auto">
                    {row.caseNumber?.trim() ? row.caseNumber : t.common.notRecorded}
                  </p>
                  <p dir="auto">{row.clientName ?? t.common.notRecorded}</p>
                  {row.matterArchived ? <p>{t.matters.lifecycle.archived}</p> : null}
                  {row.clientArchived ? <p>{t.clients.archivedNotice}</p> : null}
                </div>
                <div>
                  <dl>
                    <Field label={t.adminWorks.requiredWork} value={row.requiredWork} />
                  </dl>
                  <p>{t.adminWorks.stepCount(row.stepCount)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className={styles.empty}>
            <h3>{t.common.noResults}</h3>
            <p>
              {filters.q || choices.some(([, , value]) => value !== 'all')
                ? t.adminWorks.empty
                : t.adminWorks.none}
            </p>
          </div>
        )}
        <nav className={styles.pagination} aria-label={t.adminWorks.pagination}>
          {filters.page > 1 ? (
            <Link className={styles.link} href={adminListHref(filters, filters.page - 1)}>
              {t.clients.previous}
            </Link>
          ) : null}
          <p>{t.clients.page(filters.page, pages)}</p>
          {filters.page < pages ? (
            <Link className={styles.link} href={adminListHref(filters, filters.page + 1)}>
              {t.clients.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
