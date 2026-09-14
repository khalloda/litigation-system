import { hasPermission } from '@/lib/auth/permissions';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { getAdminWork } from '@/lib/admin-works';
import {
  AdminFilterError,
  parseAdminDetailParams,
  adminListHref,
  adminDetailHref,
} from '@/lib/admin-work-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { Field } from '../../clients/client-fields';
import { ClientAlert } from '../../clients/client-alert';
import styles from '../../staff/staff.module.css';
import local from '../../hearings/hearings.module.css';
export const metadata: Metadata = { title: t.adminWorks.details };
export default async function AdminWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'administrativeWorks', action: 'view' });
  const { id } = await params;
  let state;
  try {
    state = parseAdminDetailParams(await searchParams);
  } catch (error) {
    if (!(error instanceof AdminFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.adminWorks.details}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href="/admin-works">
            {t.adminWorks.back}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  const { filters } = state;
  const record = await getAdminWork(session, id, String(state.stepPage));
  if (!record) notFound();
  return (
    <main className={styles.page} data-admin-id={record.id}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.adminWorks.details}</p>
          <h1>{t.adminWorks.identity(record.id)}</h1>
          {!record.matterArchived &&
          hasPermission(session.user.role, 'administrativeWorks', 'update') ? (
            <Link
              className={styles.link}
              href={
                '/admin-works/' +
                record.id +
                '/edit' +
                adminDetailHref(record.id, filters, state.stepPage).slice(
                  ('/admin-works/' + record.id).length,
                )
              }
            >
              {t.adminWorks.manage.edit}
            </Link>
          ) : (
            <p>{t.adminWorks.readOnly}</p>
          )}
        </div>
        <Link className={styles.link} href={adminListHref(filters)}>
          {t.adminWorks.back}
        </Link>
      </header>
      <section className={styles.panel} aria-label={t.adminWorks.details}>
        <h2>{t.adminWorks.details}</h2>
        <dl className={styles.facts}>
          <Field label={t.adminWorks.requiredWork} value={record.requiredWork} />
          <Field label={t.adminWorks.person} value={record.personName} />
          {record.assigneeRaw !== null ? (
            <Field
              label={t.adminWorks.person + ' — ' + t.adminWorks.sourceText}
              value={<span className={local.multiline}>{record.assigneeRaw}</span>}
            />
          ) : null}
          <Field label={t.adminWorks.createdDate} value={record.taskCreatedDate} />
          <Field label={t.adminWorks.executionDate} value={record.executionDate} />
          <Field label={t.adminWorks.result} value={record.result} />
          <Field label={t.adminWorks.previousDecision} value={record.previousDecision} />
          <Field label={t.adminWorks.lastFollowup} value={record.lastFollowup} />
          <Field label={t.adminWorks.deadline} value={record.deadline} />
          <Field label={t.fields.court} value={record.court} />
          <Field label={t.fields.circuit} value={record.circuit} />
          <Field label={t.fields.destination} value={record.destination} />
          {record.destinationRaw !== null ? (
            <Field
              label={t.fields.destination + ' — ' + t.adminWorks.sourceText}
              value={<span className={local.multiline}>{record.destinationRaw}</span>}
            />
          ) : null}
          <Field label={t.adminWorks.status} value={record.status} />
          <Field label={t.adminWorks.alert} value={record.alert} />
          <Field label={t.clients.systemId} value={record.id} />
          <Field label={t.clients.accessId} value={record.legacyId ?? t.clients.native} />
        </dl>
        {record.personActive === false ? <p>{t.matters.former}</p> : null}
      </section>
      <section className={styles.panel} aria-label={t.nav.matters}>
        <h2>{t.nav.matters}</h2>
        {record.matterArchived ? <p>{t.matters.lifecycle.archived}</p> : null}
        {record.clientArchived ? <p>{t.clients.archivedNotice}</p> : null}
        <dl className={styles.facts}>
          <Field
            label={t.fields.caseNumber}
            value={
              record.matterId ? (
                <Link
                  className={`${styles.nameLink} ${local.multiline}`}
                  href={
                    filters.fromMatter?.split('?')[0] === `/matters/${record.matterId}`
                      ? filters.fromMatter
                      : `/matters/${record.matterId}`
                  }
                >
                  <bdi>{record.caseNumber?.trim() ? record.caseNumber : t.common.notRecorded}</bdi>
                </Link>
              ) : null
            }
          />
          <Field label={t.fields.subject} value={record.subject} />
          <Field
            label={t.fields.client}
            value={
              record.clientId ? (
                <Link className={styles.nameLink} href={`/clients/${record.clientId}`}>
                  {record.clientName?.trim() ? record.clientName : t.common.notRecorded}
                </Link>
              ) : null
            }
          />
        </dl>
      </section>
      <section className={styles.panel} aria-label={t.adminWorks.steps}>
        <h2>{t.adminWorks.steps}</h2>
        {!record.matterArchived &&
        hasPermission(session.user.role, 'administrativeWorks', 'create') ? (
          <Link
            className={styles.link}
            href={
              '/admin-works/' +
              record.id +
              '/steps/new' +
              adminDetailHref(record.id, filters, state.stepPage).slice(
                ('/admin-works/' + record.id).length,
              )
            }
          >
            {t.adminWorks.manage.createStep}
          </Link>
        ) : null}
        <p>{t.adminWorks.stepOrder}</p>
        <p role="status" aria-live="polite" aria-atomic="true">
          {t.adminWorks.stepCount(record.stepCount)}
        </p>
        {record.steps.length ? (
          <ol className={local.timeline}>
            {record.steps.map((step) => (
              <li className={local.multiline} key={step.id} data-step-id={step.id}>
                <h3>{t.adminWorks.stepIdentity(step.id)}</h3>
                {!record.matterArchived &&
                hasPermission(session.user.role, 'administrativeWorks', 'update') ? (
                  <Link
                    className={styles.link}
                    href={
                      '/admin-works/' +
                      record.id +
                      '/steps/' +
                      step.id +
                      '/edit' +
                      adminDetailHref(record.id, filters, state.stepPage).slice(
                        ('/admin-works/' + record.id).length,
                      )
                    }
                  >
                    {t.adminWorks.manage.editStep}
                  </Link>
                ) : null}
                <dl className={styles.facts}>
                  <Field label={t.adminWorks.stepDate} value={step.actionDate} />
                  <Field label={t.adminWorks.person} value={step.personName} />
                  {step.performerRaw !== null ? (
                    <Field
                      label={t.adminWorks.person + ' — ' + t.adminWorks.sourceText}
                      value={<span className={local.multiline}>{step.performerRaw}</span>}
                    />
                  ) : null}
                  <Field label={t.adminWorks.result} value={step.result} />
                  <Field label={t.adminWorks.report} value={step.report} />
                </dl>
                {step.personActive === false ? <p>{t.matters.former}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p>{t.adminWorks.noSteps}</p>
        )}
        <nav className={styles.pagination} aria-label={t.adminWorks.stepPagination}>
          {record.stepPage > 1 ? (
            <Link
              className={styles.link}
              href={adminDetailHref(record.id, filters, record.stepPage - 1)}
            >
              {t.clients.previous}
            </Link>
          ) : null}
          <p>{t.clients.page(record.stepPage, record.stepPages)}</p>
          {record.stepPage < record.stepPages ? (
            <Link
              className={styles.link}
              href={adminDetailHref(record.id, filters, record.stepPage + 1)}
            >
              {t.clients.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
