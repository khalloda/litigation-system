import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { listStaff } from '@/lib/staff-roster';
import {
  STAFF_SEARCH_LIMIT,
  StaffFilterError,
  staffListHref,
  type StaffSearchParams,
} from '@/lib/staff-roster-query';
import { t } from '@/strings';
import styles from './staff.module.css';
import { StaffAlert } from './staff-alert';

export const metadata: Metadata = { title: t.staff.title };

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<StaffSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'staff', action: 'view' });
  const params = await searchParams;
  let snapshot;
  try {
    snapshot = await listStaff(session, params);
  } catch (error) {
    if (!(error instanceof StaffFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.staff.title}</h1>
        <StaffAlert>
          <p>{t.staff.invalidFilters}</p>
          <Link className={styles.link} href="/staff">
            {t.staff.clear}
          </Link>
        </StaffAlert>
      </main>
    );
  }
  const { rows, teams, total, pages, filters } = snapshot;
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#staff-results">
        {t.staff.skip}
      </a>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.staff.title}</h1>
          <p>{t.staff.subtitle}</p>
        </div>
        <Link className={styles.link} href="/">
          {t.users.back}
        </Link>
      </header>
      <section className={styles.panel} aria-label={t.common.search}>
        <form action="/staff" method="get">
          <div className={styles.filters}>
            <div className={styles.field}>
              <label htmlFor="staff-search">{t.staff.searchLabel}</label>
              <input
                id="staff-search"
                name="q"
                type="search"
                defaultValue={filters.q}
                maxLength={STAFF_SEARCH_LIMIT}
                aria-describedby="staff-search-hint"
              />
              <p id="staff-search-hint" className={styles.hint}>
                {t.staff.searchHint}
              </p>
            </div>
            <div className={styles.field}>
              <label htmlFor="staff-status">{t.staff.status}</label>
              <select id="staff-status" name="status" defaultValue={filters.status}>
                <option value="active">{t.staff.activeFilter}</option>
                <option value="former">{t.staff.formerFilter}</option>
                <option value="all">{t.staff.allStaff}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="staff-team">{t.staff.team}</label>
              <select id="staff-team" name="team" defaultValue={filters.team}>
                <option value="all">{t.staff.allTeams}</option>
                <option value="unassigned">{t.staff.unassigned}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="staff-trainee">{t.staff.trainee}</label>
              <select id="staff-trainee" name="trainee" defaultValue={filters.trainee}>
                <option value="all">{t.staff.allTrainees}</option>
                <option value="yes">{t.staff.traineeYes}</option>
                <option value="no">{t.staff.traineeNo}</option>
              </select>
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.staff.apply}
            </button>
            <Link className={styles.link} href="/staff">
              {t.staff.clear}
            </Link>
          </div>
        </form>
      </section>
      <section
        id="staff-results"
        tabIndex={-1}
        className={`${styles.panel} ${styles.focusTarget}`}
        aria-label={t.staff.title}
      >
        <div className={styles.resultsHeading}>
          <h2>{t.staff.title}</h2>
          <p role="status" aria-live="polite" aria-atomic="true">
            {t.staff.results(total)}
          </p>
        </div>
        {rows.length ? (
          <ul className={styles.list}>
            {rows.map((person) => (
              <li className={styles.row} key={person.id}>
                <div>
                  <h3>
                    <Link className={styles.nameLink} href={`/staff/${person.id}`}>
                      {person.nameAr}
                    </Link>
                  </h3>
                  {person.nameEn ? (
                    <p dir="ltr" className={`${styles.secondary} ${styles.ltr}`}>
                      {person.nameEn}
                    </p>
                  ) : null}
                  {person.matchedAlias ? (
                    <p className={styles.aliasMatch}>{t.staff.aliasMatch(person.matchedAlias)}</p>
                  ) : null}
                </div>
                <dl>
                  <dt>{t.staff.status}</dt>
                  <dd className={styles.state}>
                    {person.isActive ? t.staff.active : t.staff.former}
                  </dd>
                </dl>
                <dl>
                  <dt>{t.staff.trainee}</dt>
                  <dd>{person.isTrainee ? t.staff.traineeYes : t.staff.traineeNo}</dd>
                </dl>
                <dl>
                  <dt>{t.staff.team}</dt>
                  <dd>{person.teamName ?? t.staff.unassigned}</dd>
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <h3>{t.common.noResults}</h3>
            <p>{t.staff.empty}</p>
            <p>{t.staff.emptyHint}</p>
            <Link className={styles.link} href="/staff?status=all">
              {t.staff.allStaff}
            </Link>
          </div>
        )}
        <nav className={styles.pagination} aria-label={t.staff.pagination}>
          {filters.page > 1 ? (
            <Link className={styles.link} href={staffListHref(filters, filters.page - 1)}>
              {t.staff.previous}
            </Link>
          ) : null}
          <p>{t.staff.page(filters.page, pages)}</p>
          {filters.page < pages ? (
            <Link className={styles.link} href={staffListHref(filters, filters.page + 1)}>
              {t.staff.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
