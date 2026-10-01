import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { decideAuthorization } from '@/lib/auth/authorization-core';
import { ReportSelectionError } from '@/lib/reports/selection';
import { readAdministrativeReportSelection } from '@/lib/reports/administrative-selection';
import { reporting } from '@/lib/reports/production';
import { t } from '@/strings';
import { ReportReferenceSelect } from '../reference-select';
import { ReportLabelParts } from '../label-parts';
import { AdministrativeSelectionEditor } from './editor';
import styles from '../reports.module.css';
export const dynamic = 'force-dynamic';
export default async function AdministrativeSelectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission({ area: 'reports', action: 'run' });
  const params = await searchParams;
  const integer = (v: string | string[] | undefined) =>
    typeof v === 'string' && /^[1-9]\d{0,9}$/u.test(v) && Number(v) <= 2147483647
      ? Number(v)
      : null;
  const kind = params.kind ?? 'hearing',
    client = integer(params.client),
    parent = integer(params.parent),
    page = params.page === undefined ? 1 : integer(params.page);
  if (
    !['hearing', 'step'].includes(String(kind)) ||
    Array.isArray(kind) ||
    page === null ||
    page > 100000 ||
    (params.client !== undefined && client === null) ||
    (params.parent !== undefined && (parent === null || client === null)) ||
    Object.keys(params).some((k) => !['kind', 'client', 'parent', 'page'].includes(k))
  )
    notFound();
  if (kind !== 'hearing' && kind !== 'step') notFound();
  const title =
    kind === 'hearing' ? t.administrativeSelection.hearings : t.administrativeSelection.steps;
  const base = `/reports/administrative-selection?kind=${kind}${client === null ? '' : `&client=${client}`}`;
  const switchKind = kind === 'hearing' ? 'step' : 'hearing';
  if (client === null) {
    const { options } = await reporting.describe(session, 'client-matters');
    return (
      <main className={styles.page} data-reviewed>
        <Link href="/reports">{t.reports.back}</Link>
        <h1>{title}</h1>
        <p>{t.administrativeSelection.help}</p>
        <Link href={`/reports/administrative-selection?kind=${switchKind}`}>
          {kind === 'hearing'
            ? t.administrativeSelection.steps
            : t.administrativeSelection.hearings}
        </Link>
        <form action="/reports/administrative-selection" className={styles.form}>
          <input type="hidden" name="kind" value={kind} />
          <label htmlFor="administrative-client">{t.fields.client}</label>
          <ReportReferenceSelect
            id="administrative-client"
            name="client"
            label={t.fields.client}
            options={options.client}
            rule={{ required: true, help: t.clientReports.clientHelp }}
            invalid={false}
            describedBy="administrative-client-help"
          />
          <p id="administrative-client-help">{t.clientReports.clientHelp}</p>
          <button type="submit">{t.administrativeSelection.open}</button>
        </form>
      </main>
    );
  }
  let model;
  try {
    model = await readAdministrativeReportSelection(session, kind, client, parent, page);
  } catch (error) {
    if (error instanceof ReportSelectionError) notFound();
    throw error;
  }
  const canEdit = decideAuthorization(
    session,
    kind === 'hearing' ? 'hearings' : 'administrativeWorks',
    'update',
  ).allowed;
  const url = (p: number) => `${base}${parent === null ? '' : `&parent=${parent}`}&page=${p}`;
  return (
    <main className={styles.page} data-reviewed>
      <Link href={parent === null ? `/reports?client=${client}` : base}>
        {parent === null ? t.reports.back : t.administrativeSelection.parents}
      </Link>
      <h1>{title}</h1>
      <p>{t.administrativeSelection.help}</p>
      <ReportLabelParts
        parts={[
          { label: t.fields.client, value: model.name },
          { label: t.auditHistory.fields.client_id, value: String(client) },
        ]}
      />
      <Link href={`/reports/administrative-selection?kind=${switchKind}&client=${client}`}>
        {kind === 'hearing' ? t.administrativeSelection.steps : t.administrativeSelection.hearings}
      </Link>
      {parent === null ? (
        <section className={styles.selectionList} aria-label={title}>
          {model.parents.length === 0 ? <p>{t.administrativeSelection.empty}</p> : null}
          {model.parents.map((p) => (
            <article key={p.id} className={styles.guidance}>
              <ReportLabelParts
                parts={[
                  { label: t.fields.caseNumber, value: p.caseNumber ?? t.reports.nullValue },
                  { label: t.fields.subject, value: p.subject ?? t.reports.nullValue },
                  { label: t.auditHistory.fields.matter_id, value: String(p.matterId) },
                  ...(kind === 'step'
                    ? [
                        { label: t.adminWorks.requiredWork, value: p.work ?? t.reports.nullValue },
                        { label: t.auditHistory.fields.task_id, value: String(p.id) },
                      ]
                    : []),
                ]}
              />
              <Link href={`${base}&parent=${p.id}`}>
                {t.administrativeSelection.open} <bdi>({p.id})</bdi>
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <>
          <ReportLabelParts
            parts={[
              {
                label: t.fields.caseNumber,
                value: model.parents[0]!.caseNumber ?? t.reports.nullValue,
              },
              { label: t.auditHistory.fields.matter_id, value: String(model.parents[0]!.matterId) },
              ...(kind === 'step'
                ? [
                    {
                      label: t.adminWorks.requiredWork,
                      value: model.parents[0]!.work ?? t.reports.nullValue,
                    },
                    { label: t.auditHistory.fields.task_id, value: String(parent) },
                  ]
                : []),
            ]}
          />
          <p>
            {t.administrativeSelection.total}: <bdi>{model.counts.total}</bdi> ·{' '}
            {t.administrativeSelection.selected}: <bdi>{model.counts.selected}</bdi>
          </p>
          <AdministrativeSelectionEditor
            key={`${kind}:${parent}:${page}`}
            kind={kind}
            client={client}
            parent={model.parents[0]!}
            records={model.records}
            canEdit={canEdit}
            reload={url(page)}
          />
        </>
      )}
      <nav className={styles.actions} aria-label={t.reports.page}>
        {page > 1 ? <Link href={url(page - 1)}>{t.reportSelection.previous}</Link> : null}
        {page * 25 < (parent === null ? model.parentCount : model.counts.total) ? (
          <Link href={url(page + 1)}>{t.reportSelection.next}</Link>
        ) : null}
      </nav>
    </main>
  );
}
