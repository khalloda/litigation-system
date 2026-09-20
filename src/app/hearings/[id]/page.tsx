import { hasPermission } from '@/lib/auth/permissions';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { getHearing } from '@/lib/hearings';
import {
  HearingFilterError,
  parseHearingFilters,
  hearingListHref,
  hearingDetailHref,
} from '@/lib/hearing-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { AuditRecordEntry } from '@/app/audit-history/record-entry';
import { Field } from '../../clients/client-fields';
import { ClientAlert } from '../../clients/client-alert';
import styles from '../../staff/staff.module.css';
import local from '../hearings.module.css';
export const metadata: Metadata = { title: t.hearings.details };
export default async function HearingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'hearings', action: 'view' });
  const { id } = await params;
  let filters;
  try {
    filters = parseHearingFilters(await searchParams);
  } catch (error) {
    if (!(error instanceof HearingFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.hearings.details}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href="/hearings">
            {t.hearings.back}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  const hearing = await getHearing(session, id);
  if (!hearing) notFound();
  const returnQuery = `hearingReturn=${encodeURIComponent(hearingDetailHref(hearing.id, filters))}`;
  const parentMatter =
    filters.fromMatter?.split('?')[0] === `/matters/${hearing.matterId}`
      ? filters.fromMatter
      : `/matters/${hearing.matterId}`;
  return (
    <main className={styles.page} data-hearing-id={hearing.id}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.hearings.details}</p>
          <h1>{t.hearings.identity(hearing.id)}</h1>
          {hearing.hearingArchived ? <p>{t.hearings.lifecycle.archivedNotice}</p> : null}
          {hasPermission(
            session.user.role,
            'hearings',
            hearing.hearingArchived ? 'restore' : 'archive',
          ) && !hearing.matterArchived ? (
            <Link
              className={styles.link}
              href={`/hearings/${hearing.id}/${hearing.hearingArchived ? 'restore' : 'archive'}${hearingDetailHref(hearing.id, filters).slice(`/hearings/${hearing.id}`.length)}`}
            >
              {hearing.hearingArchived
                ? t.hearings.lifecycle.restore
                : t.hearings.lifecycle.archive}
            </Link>
          ) : null}
          {hasPermission(session.user.role, 'hearings', 'update') &&
          !hearing.matterArchived &&
          !hearing.hearingArchived ? (
            <Link
              className={styles.link}
              href={
                '/hearings/' +
                hearing.id +
                '/edit' +
                hearingDetailHref(hearing.id, filters).slice(`/hearings/${hearing.id}`.length)
              }
            >
              {t.hearings.manage.edit}
            </Link>
          ) : (
            <p>{t.hearings.readOnly}</p>
          )}
        </div>
        <Link className={styles.link} href={hearingListHref(filters)}>
          {t.hearings.back}
        </Link>
        {filters.fromMatter ? (
          <Link className={styles.link} href={filters.fromMatter}>
            {t.hearings.backMatter}
          </Link>
        ) : null}
      </header>
      <AuditRecordEntry session={session} table="hearings" id={hearing.id} />
      <section className={styles.panel} aria-label={t.hearings.details}>
        <h2>{t.hearings.details}</h2>
        <dl className={styles.facts}>
          <Field label={t.fields.hearingDate} value={hearing.hearingDate} />
          <Field label={t.fields.nextHearingDate} value={hearing.nextHearingDate} />
          <Field label={t.hearings.action} value={hearing.action} />
          <Field label={t.fields.decision} value={hearing.decision} />
          <Field label={t.hearings.outcome} value={hearing.outcome} />
          <Field label={t.fields.court} value={hearing.court} />
          <Field label={t.fields.destination} value={hearing.destination} />
          <Field label={t.fields.circuit} value={hearing.circuit} />
          <Field label={t.fields.notes} value={hearing.notes} />
          <Field label={t.clients.systemId} value={hearing.id} />
          <Field label={t.clients.accessId} value={hearing.legacyId ?? t.clients.native} />
        </dl>
      </section>
      <section className={styles.panel} aria-label={t.nav.matters}>
        <h2>{t.nav.matters}</h2>
        {hearing.matterArchived ? <p>{t.matters.lifecycle.archived}</p> : null}
        {hearing.clientArchived ? <p>{t.clients.archivedNotice}</p> : null}
        <dl className={styles.facts}>
          <Field
            label={t.fields.caseNumber}
            value={
              hearing.matterId ? (
                <Link
                  className={`${styles.nameLink} ${local.multiline}`}
                  href={parentMatter + (parentMatter.includes('?') ? '&' : '?') + returnQuery}
                >
                  <bdi>
                    {hearing.caseNumber?.trim() ? hearing.caseNumber : t.common.notRecorded}
                  </bdi>
                </Link>
              ) : (
                t.hearings.unassigned
              )
            }
          />
          <Field label={t.fields.subject} value={hearing.subject} />
          <Field
            label={t.fields.client}
            value={
              hearing.clientId ? (
                <Link
                  className={styles.nameLink}
                  href={`/clients/${hearing.clientId}?${returnQuery}`}
                >
                  {hearing.clientName}
                </Link>
              ) : null
            }
          />
        </dl>
      </section>
      <section className={styles.panel} aria-label={t.fields.attendees}>
        <h2>{t.fields.attendees}</h2>
        <p className={styles.hint}>{t.hearings.attendeeHint}</p>
        {hearing.attendees.length ? (
          <ol className={local.attendees}>
            {hearing.attendees.map((a) => (
              <li key={a.id} data-attendee-id={a.id}>
                <AuditRecordEntry session={session} table="hearing_attendees" id={a.id} />
                <bdi>{a.name?.trim() ? a.name : t.common.notRecorded}</bdi>
                {a.active === false ? <span> — {t.matters.former}</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p>{t.hearings.noAttendees}</p>
        )}
      </section>
      {hearing.retiredAttendees.length ? (
        <section className={styles.panel} aria-label={t.hearings.lifecycle.retiredAttendees}>
          <h2>{t.hearings.lifecycle.retiredAttendees}</h2>
          <ol className={local.attendees}>
            {hearing.retiredAttendees.map((a) => (
              <li key={a.id} data-retired-attendee-id={a.id}>
                <AuditRecordEntry session={session} table="hearing_attendees" id={a.id} />
                <bdi>{a.name?.trim() ? a.name : t.common.notRecorded}</bdi>
                {a.active === false ? <span> {t.matters.former}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
