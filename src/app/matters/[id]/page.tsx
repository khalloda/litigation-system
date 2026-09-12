import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getMatter } from '@/lib/matters';
import {
  parseMatterFilters,
  MatterFilterError,
  matterListHref,
  matterDetailHref,
} from '@/lib/matter-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { Field } from '../../clients/client-fields';
import { ClientAlert } from '../../clients/client-alert';
import styles from '../../staff/staff.module.css';
import local from '../matters.module.css';

export const metadata: Metadata = { title: t.matters.details };
export default async function MatterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'matters', action: 'view' });
  const { id } = await params;
  let filters;
  try {
    filters = parseMatterFilters(await searchParams);
  } catch (error) {
    if (!(error instanceof MatterFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.matters.details}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href="/matters">
            {t.matters.back}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  const matter = await getMatter(session, id);
  if (!matter) notFound();
  const caseLines = (matter.caseNumber?.trim() ? matter.caseNumber : t.common.notRecorded).split(
    /\r\n|\n|\r/u,
  );
  const firstNumber = caseLines.findIndex((line) => line.trim());
  const fields = [
    [t.matters.startDate, matter.startDate],
    [t.matters.endDate, matter.endDate],
    [t.matters.askedAmount, matter.askedAmount],
    [t.matters.judgedAmount, matter.judgedAmount],
    [t.matters.evaluation, matter.evaluation],
    [t.matters.legalOpinion, matter.legalOpinion],
    [t.matters.notes1, matter.notes1],
    [t.matters.notes2, matter.notes2],
  ] as const;
  const courtFields = [
    [t.matters.circuitSecretary, matter.circuitSecretary],
    [t.matters.courtFloor, matter.courtFloor],
    [t.matters.courtHall, matter.courtHall],
    [t.matters.courtShelf, matter.courtShelf],
    [t.matters.courtSecretaryRoom, matter.courtSecretaryRoom],
  ] as const;
  return (
    <main className={styles.page} data-matter-id={matter.id}>
      <header className={styles.header}>
        {!matter.archived && hasPermission(session.user.role, 'matters', 'update') ? (
          <Link
            className={styles.button}
            href={`/matters/${matter.id}/edit${matterListHref(filters).slice('/matters'.length)}`}
          >
            {t.matters.manage.edit}
          </Link>
        ) : null}
        <div>
          <p className={styles.eyebrow}>{t.matters.details}</p>
          <h1 className={local.hero}>
            {caseLines.map((line, i) => (
              <bdi
                className={`${local.caseLine} ${i > firstNumber ? local.secondaryLine : ''}`}
                key={i}
              >
                {line || '\u00a0'}
              </bdi>
            ))}
          </h1>
          {!hasPermission(session.user.role, 'matters', 'update') ? (
            <p>{t.matters.readOnly}</p>
          ) : null}
        </div>
        <Link className={styles.link} href={matterListHref(filters)}>
          {t.matters.back}
        </Link>
      </header>
      {hasPermission(session.user.role, 'matters', matter.archived ? 'restore' : 'archive') ? (
        <Link
          className={styles.button}
          href={`/matters/${matter.id}/${matter.archived ? 'restore' : 'archive'}${matterListHref(filters).slice('/matters'.length)}`}
        >
          {matter.archived ? t.matters.lifecycle.restore : t.matters.lifecycle.archive}
        </Link>
      ) : null}
      {matter.archived ? (
        <p className={`${styles.panel} ${styles.state}`}>{t.matters.lifecycle.notice}</p>
      ) : null}
      {matter.clientArchived ? (
        <p className={`${styles.panel} ${styles.state}`}>{t.clients.archivedNotice}</p>
      ) : null}
      <section className={styles.panel} aria-label={t.matters.details}>
        <h2>{t.matters.details}</h2>
        <dl className={styles.facts}>
          <Field label={t.fields.subject} value={matter.subject} />
          <Field
            label={t.fields.client}
            value={
              matter.clientId ? (
                <Link
                  className={styles.nameLink}
                  href={`/clients/${matter.clientId}?matterReturn=${encodeURIComponent(matterDetailHref(matter.id, filters))}`}
                >
                  {matter.clientName}
                </Link>
              ) : null
            }
          />
          <Field label={t.matters.filters.branch} value={matter.branch} />
          <Field label={t.matters.filters.status} value={matter.status} />
          <Field label={t.fields.status} value={matter.currentStatus} />
          <Field label={t.clients.systemId} value={matter.id} />
          <Field label={t.clients.accessId} value={matter.legacyId ?? t.clients.native} />
        </dl>
      </section>
      <section className={styles.panel} aria-label={t.matters.classifications}>
        <h2>{t.matters.classifications}</h2>
        <dl className={styles.facts}>
          {[
            [t.matters.filters.type, matter.type],
            [t.matters.filters.category, matter.category],
            [t.matters.filters.degree, matter.degree],
            [t.matters.filters.venue, matter.venue],
          ].map(([label, value]) => (
            <Field key={label} label={label!} value={value} />
          ))}
          <Field label={t.matters.importance} value={matter.importance} />
          <Field label={t.fields.destination} value={matter.destination} />
        </dl>
      </section>
      <section className={styles.panel} aria-label={t.matters.parties}>
        <h2>{t.matters.parties}</h2>
        <div className={styles.detailGrid}>
          {(['client', 'opponent'] as const).map((side) => (
            <div key={side}>
              <h3>{side === 'client' ? t.fields.client : t.fields.opponent}</h3>
              {matter.parties.some((p) => p.side === side) ? (
                <ol className={local.parties}>
                  {matter.parties
                    .filter((p) => p.side === side)
                    .map((p) => (
                      <li key={p.id} data-party-id={p.id}>
                        <p className={local.multiline} dir="auto">
                          {p.name?.trim() ? p.name : t.common.notRecorded}
                        </p>
                        {p.roles.length ? (
                          <ul>
                            {p.roles.map((r) => (
                              <li key={r.id} data-capacity-id={r.id}>
                                {r.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{t.common.notRecorded}</p>
                        )}
                      </li>
                    ))}
                </ol>
              ) : (
                <p>{t.matters.noParties}</p>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className={styles.panel} aria-label={t.matters.assignedLawyers}>
        <h2>{t.matters.assignedLawyers}</h2>
        <p className={styles.hint}>{t.matters.relationshipHint}</p>
        {matter.lawyers.length ? (
          <ol className={local.parties}>
            {matter.lawyers.map((l) => (
              <li key={l.id} data-lawyer-id={l.personId}>
                <p className={local.multiline} dir="auto">
                  {l.name}
                </p>
                <p>
                  {l.role === 'lead'
                    ? t.matters.lawyerRoles.lead
                    : l.role === 'co_lead'
                      ? t.matters.lawyerRoles.co_lead
                      : t.matters.lawyerRoles.support}
                  {!l.active ? ` — ${t.matters.former}` : ''}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className={local.unassigned}>{t.matters.noLawyer}</p>
        )}
      </section>
      <section className={styles.panel} aria-label={t.matters.courtDetails}>
        <h2>{t.matters.courtDetails}</h2>
        <dl className={styles.facts}>
          <Field label={t.fields.court} value={matter.court} />
          <Field label={t.fields.circuit} value={matter.circuit} />
          {courtFields.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </dl>
      </section>
      <section className={styles.panel} aria-label={t.fields.notes}>
        <h2>{t.fields.notes}</h2>
        <dl className={styles.facts}>
          {fields.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </dl>
      </section>
    </main>
  );
}
