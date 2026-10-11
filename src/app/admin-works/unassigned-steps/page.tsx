import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { listUnassignedAdminSteps } from '@/lib/admin-works';
import { ADMIN_SEARCH_LIMIT, AdminFilterError, unassignedAdminHref } from '@/lib/admin-work-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { Field } from '../../clients/client-fields';
import styles from '../../staff/staff.module.css';
import local from '../../hearings/hearings.module.css';
export const metadata: Metadata = { title: t.adminWorks.unassignedSteps };
export default async function UnassignedStepsPage({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'administrativeWorks', action: 'view' });
  let snapshot;
  try {
    snapshot = await listUnassignedAdminSteps(session, await searchParams);
  } catch (error) {
    if (!(error instanceof AdminFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.adminWorks.unassignedSteps}</h1>
        <p>{t.clients.invalidFilters}</p>
        <Link className={styles.link} href="/admin-works/unassigned-steps">
          {t.clients.clear}
        </Link>
      </main>
    );
  }
  const { rows, total, pages, filters, options } = snapshot;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t.adminWorks.unassignedSteps}</h1>
          <p>{t.adminWorks.unassignedStepsHint}</p>
        </div>
        <Link className={styles.link} href="/admin-works">
          {t.adminWorks.back}
        </Link>
      </header>
      <section className={styles.panel} aria-label={t.common.search}>
        <form
          action="/admin-works/unassigned-steps"
          method="get"
          key={unassignedAdminHref(filters)}
        >
          <div className={styles.field}>
            <label htmlFor="unassigned-search">{t.adminWorks.unassignedStepsSearch}</label>
            <input
              id="unassigned-search"
              name="q"
              type="search"
              maxLength={ADMIN_SEARCH_LIMIT}
              defaultValue={filters.q}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="unassigned-person">{t.adminWorks.person}</label>
            <select id="unassigned-person" name="person" defaultValue={filters.person}>
              <option value="all">{t.matters.all}</option>
              <option value="missing">{t.common.notRecorded}</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.inactive ? ' — ' + t.staff.former : ''}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.clients.apply}
            </button>
            <Link className={styles.link} href="/admin-works/unassigned-steps">
              {t.clients.clear}
            </Link>
          </div>
        </form>
      </section>
      <section className={styles.panel} aria-label={t.adminWorks.unassignedSteps}>
        <p role="status">{t.adminWorks.stepCount(total)}</p>
        {rows.length ? (
          <ol className={local.timeline}>
            {rows.map((row) => (
              <li key={row.id} className={local.row}>
                <div>
                  <h2>{t.adminWorks.stepIdentity(row.id)}</h2>
                  {row.archived ? <p>{t.adminWorks.lifecycle.stepArchived}</p> : null}
                  <dl>
                    <Field label={t.documentsModule.legacyId} value={row.legacyId} />
                    <Field label={t.adminWorks.stepDate} value={row.actionDate} />
                    <Field
                      label={t.auditHistory.fields.next_appointment}
                      value={row.nextAppointment}
                    />
                    <Field label={t.auditHistory.fields.ordinal} value={row.sourceOrdinal} />
                  </dl>
                </div>
                <dl>
                  <Field
                    label={t.adminWorks.person}
                    value={
                      row.personName === null
                        ? null
                        : row.personName + (row.personActive ? '' : ' — ' + t.staff.former)
                    }
                  />
                  <Field
                    label={t.adminWorks.sourceText}
                    value={
                      <span className={local.multiline}>
                        {row.performerRaw ?? t.common.notRecorded}
                      </span>
                    }
                  />
                </dl>
                <dl>
                  <Field
                    label={t.adminWorks.result}
                    value={
                      <span className={local.multiline}>{row.result ?? t.common.notRecorded}</span>
                    }
                  />
                  <Field
                    label={t.adminWorks.report}
                    value={
                      <span className={local.multiline}>{row.report ?? t.common.notRecorded}</span>
                    }
                  />
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <p>{t.common.noResults}</p>
        )}
        <nav className={styles.pagination} aria-label={t.adminWorks.stepPagination}>
          {filters.page > 1 ? (
            <Link className={styles.link} href={unassignedAdminHref(filters, filters.page - 1)}>
              {t.clients.previous}
            </Link>
          ) : null}
          <p>{t.clients.page(filters.page, pages)}</p>
          {filters.page < pages ? (
            <Link className={styles.link} href={unassignedAdminHref(filters, filters.page + 1)}>
              {t.clients.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
