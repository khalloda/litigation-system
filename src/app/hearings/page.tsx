import { hasPermission } from '@/lib/auth/permissions';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { listHearings } from '@/lib/hearings';
import {
  HEARING_SEARCH_LIMIT,
  HearingFilterError,
  hearingListHref,
  hearingDetailHref,
} from '@/lib/hearing-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { Field } from '../clients/client-fields';
import { ClientAlert } from '../clients/client-alert';
import styles from '../staff/staff.module.css';
import local from './hearings.module.css';

export const metadata: Metadata = { title: t.hearings.title };
export default async function HearingsPage({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'hearings', action: 'view' });
  let snapshot;
  try {
    snapshot = await listHearings(session, await searchParams);
  } catch (error) {
    if (!(error instanceof HearingFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.hearings.title}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href="/hearings">
            {t.clients.clear}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  const { rows, total, pages, filters, options } = snapshot;
  const choices = [
    ['matter', t.hearings.filters.matter, filters.matter],
    ['client', t.hearings.filters.client, filters.client],
    ['court', t.hearings.filters.court, filters.court],
    ['attendee', t.hearings.filters.attendee, filters.attendee],
  ] as const;
  const filtered =
    filters.q || filters.from || filters.to || choices.some(([, , value]) => value !== 'all');
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#hearing-results">
        {t.hearings.skip}
      </a>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.hearings.title}</h1>
          {hasPermission(session.user.role, 'hearings', 'create') ? (
            <Link className={styles.link} href="/hearings/new">
              {t.hearings.manage.create}
            </Link>
          ) : null}
          <p>{t.hearings.subtitle}</p>
        </div>
        <Link className={styles.link} href="/">
          {t.nav.dashboard}
        </Link>
        {filters.fromMatter ? (
          <Link className={styles.link} href={filters.fromMatter}>
            {t.hearings.backMatter}
          </Link>
        ) : null}
      </header>
      <section className={styles.panel} aria-label={t.common.search}>
        <form key={hearingListHref(filters)} action="/hearings" method="get">
          {filters.fromMatter ? (
            <input type="hidden" name="fromMatter" value={filters.fromMatter} />
          ) : null}
          <div className={styles.field}>
            <label htmlFor="hearing-search">{t.hearings.search}</label>
            <input
              id="hearing-search"
              name="q"
              type="search"
              maxLength={HEARING_SEARCH_LIMIT}
              defaultValue={filters.q}
              aria-describedby="hearing-search-hint"
            />
            <p id="hearing-search-hint" className={styles.hint}>
              {t.hearings.searchHint}
            </p>
          </div>
          <div className={local.filters}>
            <div className={styles.field}>
              <label htmlFor="hearing-date-field">{t.hearings.dateField}</label>
              <select id="hearing-date-field" name="dateField" defaultValue={filters.dateField}>
                <option value="hearing">{t.fields.hearingDate}</option>
                <option value="next">{t.fields.nextHearingDate}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="hearing-from">{t.common.from}</label>
              <input id="hearing-from" name="from" type="date" defaultValue={filters.from} />
            </div>
            <div className={styles.field}>
              <label htmlFor="hearing-to">{t.common.to}</label>
              <input id="hearing-to" name="to" type="date" defaultValue={filters.to} />
            </div>
          </div>
          <div className={local.filters}>
            {choices.map(([key, label, value]) => (
              <div className={styles.field} key={key}>
                <label htmlFor={`hearing-${key}`}>{label}</label>
                <select id={`hearing-${key}`} name={key} defaultValue={value}>
                  <option value="all">{t.matters.all}</option>
                  <option value="missing">
                    {key === 'matter'
                      ? t.hearings.unassigned
                      : key === 'attendee'
                        ? t.hearings.noAttendees
                        : t.common.notRecorded}
                  </option>
                  {options
                    .filter((o) => o.kind === key)
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {t.matters.option(
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
            <Link className={styles.link} href="/hearings">
              {t.clients.clear}
            </Link>
          </div>
        </form>
      </section>
      <section
        id="hearing-results"
        tabIndex={-1}
        className={`${styles.panel} ${styles.focusTarget}`}
        aria-label={t.hearings.title}
      >
        <div className={styles.resultsHeading}>
          <h2>{t.hearings.title}</h2>
          <p role="status" aria-live="polite" aria-atomic="true">
            {t.hearings.results(total)}
          </p>
        </div>
        {rows.length ? (
          <ol className={local.timeline}>
            {rows.map((row) => (
              <li key={row.id} data-hearing-id={row.id} className={local.row}>
                <div>
                  <h3>
                    <Link className={styles.nameLink} href={hearingDetailHref(row.id, filters)}>
                      <bdi>{row.hearingDate ?? t.common.notRecorded}</bdi>
                      <span>{t.hearings.identity(row.id)}</span>
                    </Link>
                  </h3>
                  <dl>
                    <Field label={t.fields.nextHearingDate} value={row.nextHearingDate} />
                    <Field label={t.hearings.action} value={row.action} />
                  </dl>
                </div>
                <div>
                  <p className={local.multiline} dir="auto">
                    {row.caseNumber?.trim()
                      ? row.caseNumber
                      : row.matterId
                        ? t.common.notRecorded
                        : t.hearings.unassigned}
                  </p>
                  <p dir="auto">{row.clientName ?? t.common.notRecorded}</p>
                  {row.matterArchived ? <p>{t.matters.lifecycle.archived}</p> : null}
                  {row.clientArchived ? <p>{t.clients.archivedNotice}</p> : null}
                  <dl>
                    <Field label={t.fields.court} value={row.court} />
                  </dl>
                </div>
                <div>
                  <p className={local.multiline} dir="auto">
                    {row.decision?.trim() ? row.decision : t.common.notRecorded}
                  </p>
                  <p>
                    {row.attendeeCount
                      ? t.hearings.attendeeCount(row.attendeeCount)
                      : t.hearings.noAttendees}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className={styles.empty}>
            <h3>{t.common.noResults}</h3>
            <p>{filtered ? t.hearings.empty : t.hearings.none}</p>
          </div>
        )}
        <nav className={styles.pagination} aria-label={t.hearings.pagination}>
          {filters.page > 1 ? (
            <Link className={styles.link} href={hearingListHref(filters, filters.page - 1)}>
              {t.clients.previous}
            </Link>
          ) : null}
          <p>{t.clients.page(filters.page, pages)}</p>
          {filters.page < pages ? (
            <Link className={styles.link} href={hearingListHref(filters, filters.page + 1)}>
              {t.clients.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
