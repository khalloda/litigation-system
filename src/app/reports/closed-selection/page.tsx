import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { decideAuthorization } from '@/lib/auth/authorization-core';
import { ReportSelectionError } from '@/lib/reports/selection';
import { readClosedReportSelection } from '@/lib/reports/closed-selection';
import { t } from '@/strings';
import { SelectionEditor } from '../selection/editor';
import styles from '../reports.module.css';
export const dynamic = 'force-dynamic';
export default async function SelectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission({ area: 'reports', action: 'run' });
  const params = await searchParams;
  const integer = (v: string | string[] | undefined) =>
    typeof v === 'string' && /^[1-9]\d{0,9}$/u.test(v) ? Number(v) : null;
  const client = integer(params['client']),
    id = params['id'] === undefined ? null : integer(params['id']);
  const page = params['page'] === undefined ? 1 : integer(params['page']);
  if (client === null || page === null || (params['id'] !== undefined && id === null)) notFound();
  let model;
  try {
    model = await readClosedReportSelection(session, client, id, page);
  } catch (error) {
    if (error instanceof ReportSelectionError) notFound();
    throw error;
  }
  const canEdit =
    decideAuthorization(session, 'matters', 'update').allowed &&
    decideAuthorization(session, 'hearings', 'update').allowed;
  const url = (p: number) =>
    `/reports/closed-selection?client=${client}${id === null ? '' : `&id=${id}`}&page=${p}`;
  return (
    <main className={styles.page} data-reviewed>
      <Link
        className={styles.secondaryAction}
        href={
          id === null ? `/reports?client=${client}` : `/reports/closed-selection?client=${client}`
        }
      >
        {id === null ? t.reports.back : t.reportSelection.returnList}
      </Link>
      <h1>{t.closedSelection.title}</h1>
      <p className={styles.hint}>
        {model.name} ({client})
        {id !== null
          ? ` · ${model.matters[0]!.caseNumber ?? model.matters[0]!.subject} · ${id}`
          : ''}
      </p>
      {id === null ? (
        <dl className={styles.countCards}>
          <div>
            <dt>{t.reportSelection.totalCount}</dt>
            <dd>{model.counts.total}</dd>
          </div>
          <div>
            <dt>{t.reportSelection.savedCount}</dt>
            <dd>{model.counts.selected}</dd>
          </div>
          <div>
            <dt>{t.closedSelection.draftCount}</dt>
            <dd>{model.counts.incomplete}</dd>
          </div>
        </dl>
      ) : null}
      {id === null ? (
        <aside className={styles.guidance}>
          <h2>{t.ui.savedChoice}</h2>
          <p>{t.closedSelection.help}</p>
        </aside>
      ) : null}
      {id === null ? (
        <section className={styles.selectionList} aria-label={t.closedSelection.title}>
          <h2>{t.closedSelection.title}</h2>
          <div
            className={styles.scroll}
            role="region"
            tabIndex={0}
            aria-label={t.closedSelection.title}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">{t.matters.title}</th>
                  <th scope="col">{t.closedSelection.include}</th>
                  <th scope="col">{t.reportSelection.current}</th>
                </tr>
              </thead>
              <tbody>
                {model.matters.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">
                      <Link href={`/reports/closed-selection?client=${client}&id=${m.id}`}>
                        <bdi className={styles.wrap}>
                          {m.caseNumber ?? m.subject ?? t.reports.nullValue}
                        </bdi>
                        <span className={styles.hint}> ({m.id})</span>
                      </Link>
                    </th>
                    <td>
                      {m.selected ? t.reports.trueValue : t.reports.falseValue}
                      {!m.eligible ? <p>{t.closedSelection.ineligible}</p> : null}
                      {m.selected && (m.hearingId === null || m.date === null || !m.eligible) ? (
                        <p>{t.reportSelection.draft}</p>
                      ) : null}
                    </td>
                    <td>
                      <bdi>
                        {m.hearingId ?? t.reportSelection.none} {m.date ?? ''}
                      </bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <>
          <div className={styles.setupLayout}>
            <div>
              <SelectionEditor
                scope="closed"
                key={`${id}:${page}`}
                client={client}
                matter={model.matters[0]!}
                hearings={model.hearings}
                latest={
                  <details className={styles.guidance}>
                    <summary>{t.ui.latestAvailable}</summary>
                    {page === 1 ? (
                      model.hearings[0] ? (
                        <p className={styles.wrap} dir="auto">
                          ({model.hearings[0].id}){' '}
                          {model.hearings[0].date ?? t.clientReports.undated}
                          {'\n'}
                          {model.hearings[0].decision ?? t.reports.nullValue}
                          {model.hearings[0].archived ? '\n' + t.reportSelection.archive : ''}
                        </p>
                      ) : (
                        <p>{t.reportSelection.none}</p>
                      )
                    ) : (
                      <Link href={`/reports/closed-selection?client=${client}&id=${id}`}>
                        {t.ui.latestFirstPage}
                      </Link>
                    )}
                    <p>{t.ui.latestDoesNotSave}</p>
                  </details>
                }
                canEdit={canEdit}
              />
            </div>
            <aside className={styles.setupSummary}>
              <h2>{t.ui.selectionUsage}</h2>
              <h3>{t.reportSelection.selected}</h3>
              <p>{t.closedSelection.help}</p>
              <h3>{t.closedSelection.all}</h3>
              <p>{t.closedSelection.period}</p>
              <p>{t.reportSelection.readOnly}</p>
              <Link className={styles.secondaryAction} href={`/reports?client=${client}`}>
                {t.reports.back}
              </Link>
            </aside>
          </div>
        </>
      )}
      <nav className={styles.actions} aria-label={t.reports.page}>
        {page > 1 ? <Link href={url(page - 1)}>{t.reportSelection.previous}</Link> : null}
        {(id === null ? page * 25 < model.counts.total : model.moreHearings) ? (
          <Link href={url(page + 1)}>{t.reportSelection.next}</Link>
        ) : null}
      </nav>
    </main>
  );
}
