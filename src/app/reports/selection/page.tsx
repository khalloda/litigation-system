import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { decideAuthorization } from '@/lib/auth/authorization-core';
import { readReportSelection, ReportSelectionError } from '@/lib/reports/selection';
import { t } from '@/strings';
import { SelectionEditor } from './editor';
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
    model = await readReportSelection(session, client, id, page);
  } catch (error) {
    if (error instanceof ReportSelectionError) notFound();
    throw error;
  }
  const canEdit =
    decideAuthorization(session, 'matters', 'update').allowed &&
    decideAuthorization(session, 'hearings', 'update').allowed;
  const url = (p: number) =>
    `/reports/selection?client=${client}${id === null ? '' : `&id=${id}`}&page=${p}`;
  return (
    <main className={styles.page}>
      <Link href="/reports">{t.reports.back}</Link>
      <h1>{t.reportSelection.title}</h1>
      <h2>
        {model.name} ({client})
      </h2>
      <p>
        {t.reportSelection.totalCount}: {model.counts.total} · {t.reportSelection.savedCount}:{' '}
        {model.counts.selected} · {t.reportSelection.draftCount}: {model.counts.incomplete}
      </p>
      <p>{t.reportSelection.help}</p>
      {id === null ? (
        <ul>
          {model.matters.map((m) => (
            <li key={m.id} className={styles.choice}>
              <Link href={`/reports/selection?client=${client}&id=${m.id}`}>
                <span dir="auto">
                  {m.caseNumber ?? m.subject ?? t.reports.nullValue} ({m.id})
                </span>
              </Link>
              <p>
                {t.reportSelection.include}:{' '}
                {m.selected ? t.reports.trueValue : t.reports.falseValue} ·{' '}
                {t.reportSelection.current}: {m.hearingId ?? t.reportSelection.none} {m.date ?? ''}
              </p>
              {m.selected && (m.hearingId === null || !m.decision) ? (
                <p>{t.reportSelection.draft}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <Link href={`/reports/selection?client=${client}`}>{t.reportSelection.returnList}</Link>
          <h3 dir="auto" className={styles.choice}>
            {model.matters[0]!.caseNumber ?? model.matters[0]!.subject}
          </h3>
          <SelectionEditor
            key={`${id}:${page}`}
            client={client}
            matter={model.matters[0]!}
            hearings={model.hearings}
            canEdit={canEdit}
          />
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
