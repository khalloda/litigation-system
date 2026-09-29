import {
  hearingReturnHref,
  HearingFilterError,
  hearingListHref,
  parseHearingFilters,
} from '@/lib/hearing-query';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
import { AuditRecordEntry } from '@/app/audit-history/record-entry';
import { Field } from '../clients/client-fields';
import { ClientAlert } from '../clients/client-alert';
import styles from '../staff/staff.module.css';
import local from './matters.module.css';
import { workspaceSelection, selectedWorkspaceHref } from './workspace-context';

export async function MatterDetail({
  params,
  searchParams,
  session,
  embedded = false,
}: {
  session: Session;
  embedded?: boolean;
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const Container = embedded ? 'section' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  const { id } = await params;
  const workspace = workspaceSelection((await searchParams).workspace);
  let filters, hearingReturn;
  try {
    const input = await searchParams;
    hearingReturn = hearingReturnHref(input.hearingReturn);
    filters = parseMatterFilters(input);
  } catch (error) {
    if (!(error instanceof MatterFilterError) && !(error instanceof HearingFilterError))
      throw error;
    return (
      <Container className={styles.page}>
        <h1>{t.matters.details}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href="/matters">
            {t.matters.back}
          </Link>
        </ClientAlert>
      </Container>
    );
  }
  const matter = await getMatter(session, id);
  if (!matter) {
    if (embedded)
      return (
        <section>
          <p>{t.common.noResults}</p>
          <Link className={styles.link} href={matterListHref(filters)}>
            {t.matters.back}
          </Link>
        </section>
      );
    notFound();
  }
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
  if (embedded)
    return (
      <section data-matter-id={matter.id}>
        <header className={local.readingHeader}>
          <h2 className={local.hero}>
            {caseLines.map((line, i) => (
              <bdi className={local.caseLine} key={i}>
                {line || '\u00a0'}
              </bdi>
            ))}
          </h2>
          {!matter.archived && hasPermission(session.user.role, 'matters', 'update') ? (
            <Link
              className={styles.link}
              href={`/matters/${matter.id}/edit${matterListHref(filters).slice('/matters'.length)}`}
            >
              {t.matters.manage.edit}
            </Link>
          ) : null}
        </header>
        <p className={local.readingSubjectLabel}>{t.fields.subject}</p>
        <p className={local.readingSubject} dir="auto">
          {matter.subject ?? t.common.notRecorded}
        </p>
        <dl className={local.readingFacts}>
          <Field label={t.matters.filters.branch} value={matter.branch} />
          <Field label={t.matters.filters.status} value={matter.status} />
          <Field label={t.fields.status} value={matter.currentStatus} />
          <Field label={t.clients.systemId} value={matter.id} />
          <Field
            label={t.fields.client}
            value={
              matter.clientId ? (
                <Link
                  href={`/clients/${matter.clientId}?matterReturn=${encodeURIComponent(matterDetailHref(matter.id, filters))}`}
                >
                  {matter.clientName}
                </Link>
              ) : null
            }
          />
        </dl>
        {matter.archived ? <p className={styles.state}>{t.matters.lifecycle.notice}</p> : null}
        {matter.clientArchived ? <p className={styles.state}>{t.clients.archivedNotice}</p> : null}
        <section className={local.readingRelated}>
          <h2>{t.ui.relatedRecords}</h2>
          <div className={local.readingActions}>
            <Link
              className={styles.link}
              href={hearingListHref(
                parseHearingFilters({
                  matter: String(matter.id),
                  archive: 'all',
                  fromMatter: matterDetailHref(matter.id, filters),
                }),
              )}
            >
              {t.hearings.title}
            </Link>
            {hasPermission(session.user.role, 'documents', 'view') ? (
              <Link className={styles.link} href={`/documents?matter=${matter.id}&archive=all`}>
                {t.documentsModule.title}
              </Link>
            ) : null}
            <Link
              className={styles.link}
              href={`/admin-works?archive=all&matter=${matter.id}&fromMatter=${encodeURIComponent(matterDetailHref(matter.id, filters))}`}
            >
              {t.adminWorks.title}
            </Link>
          </div>
          <div className={local.readingActions}>
            <Link
              className={styles.link}
              data-full-matter
              href={`${matterDetailHref(matter.id, filters)}${matterDetailHref(matter.id, filters).includes('?') ? '&' : '?'}workspace=${matter.id}`}
            >
              {t.ui.fullDetails}
            </Link>
            <AuditRecordEntry session={session} table="matters" id={matter.id} />
          </div>
        </section>
      </section>
    );
  return (
    <Container className={styles.page} data-matter-id={matter.id}>
      <header className={styles.header}>
        {hearingReturn ? (
          <Link className={styles.link} href={hearingReturn}>
            {t.hearings.back}
          </Link>
        ) : null}
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
          <Heading className={local.hero}>
            {caseLines.map((line, i) => (
              <bdi
                className={`${local.caseLine} ${i > firstNumber ? local.secondaryLine : ''}`}
                key={i}
              >
                {line || '\u00a0'}
              </bdi>
            ))}
          </Heading>
          {!hasPermission(session.user.role, 'matters', 'update') ? (
            <p>{t.matters.readOnly}</p>
          ) : null}
        </div>
        <Link
          className={styles.link}
          data-workspace-return
          scroll={workspace === matter.id ? false : undefined}
          href={
            workspace === matter.id
              ? selectedWorkspaceHref(matterListHref(filters), matter.id)
              : matterListHref(filters)
          }
        >
          {t.matters.back}
        </Link>
      </header>
      <AuditRecordEntry session={session} table="matters" id={matter.id} />
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
      <section className={styles.panel} aria-label={t.adminWorks.title}>
        <h2>{t.adminWorks.title}</h2>
        <Link
          className={styles.link}
          href={`/admin-works?archive=all&matter=${matter.id}&fromMatter=${encodeURIComponent(matterDetailHref(matter.id, filters))}`}
        >
          {t.adminWorks.title}
        </Link>
      </section>
      <section className={styles.panel} aria-label={t.documentsModule.title}>
        <h2>{t.documentsModule.title}</h2>
        <div className={styles.actions}>
          {hasPermission(session.user.role, 'documents', 'view') ? (
            <Link className={styles.link} href={`/documents?matter=${matter.id}&archive=all`}>
              {t.documentsModule.title}
            </Link>
          ) : null}
          {hasPermission(session.user.role, 'feeLetters', 'view') ? (
            <>
              <Link className={styles.link} href={`/fee-letters?covered=${matter.id}&archive=all`}>
                {t.feeLettersModule.covered}
              </Link>
              <Link
                className={styles.link}
                href={`/fee-letters?referencing=${matter.id}&archive=all`}
              >
                {t.feeLettersModule.referencing}
              </Link>
            </>
          ) : null}
          {!matter.archived &&
          hasPermission(session.user.role, 'feeLetters', 'update') &&
          hasPermission(session.user.role, 'matters', 'update') ? (
            <Link className={styles.link} href={`/fee-letters/matter/${matter.id}`}>
              {t.feeLettersModule.manageMatterReference}
            </Link>
          ) : null}
        </div>
        <dl className={styles.facts}>
          <Field
            label={t.feeLettersModule.currentMatterReference}
            value={
              matter.currentFeeLetterId ? (
                <Link
                  className={styles.nameLink}
                  href={`/fee-letters/${matter.currentFeeLetterId}`}
                >
                  {matter.currentFeeContractId ?? matter.currentFeeLetterId} ·{' '}
                  {matter.currentFeeClientName ?? t.feeLettersModule.unknown}
                </Link>
              ) : null
            }
          />
          <Field
            label={t.feeLettersModule.originalMatterReference}
            value={
              <>
                {matter.originalFeeReference ?? t.feeLettersModule.unknown}
                {matter.originalFeeLetterId ? (
                  <>
                    {' '}
                    ·{' '}
                    <Link
                      className={styles.nameLink}
                      href={`/fee-letters/${matter.originalFeeLetterId}`}
                    >
                      {matter.originalFeeContractId ?? matter.originalFeeLetterId} ·{' '}
                      {matter.originalFeeClientName ?? t.feeLettersModule.unknown}
                    </Link>
                  </>
                ) : null}
                {matter.originalFeeIdentifierSpace
                  ? ` · ${t.feeLettersModule.sourceNamespace}: ${matter.originalFeeIdentifierSpace}`
                  : ''}
              </>
            }
          />
        </dl>
      </section>
      <section className={styles.panel} aria-label={t.hearings.title}>
        <h2>{t.hearings.title}</h2>
        <p>{t.hearings.matterHint}</p>
        <Link
          className={styles.link}
          href={hearingListHref(
            parseHearingFilters({
              matter: String(matter.id),
              archive: 'all',
              fromMatter: matterDetailHref(matter.id, filters),
            }),
          )}
        >
          {t.hearings.lifecycle.allRecords}
        </Link>
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
                        <AuditRecordEntry session={session} table="matter_parties" id={p.id} />
                        <p className={local.multiline} dir="auto">
                          {p.name?.trim() ? p.name : t.common.notRecorded}
                        </p>
                        {p.roles.length ? (
                          <ul>
                            {p.roles.map((r) => (
                              <li key={r.id} data-capacity-id={r.id}>
                                {r.name}
                                <AuditRecordEntry
                                  session={session}
                                  table="matter_party_roles"
                                  id={r.id}
                                />
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
                <AuditRecordEntry session={session} table="matter_lawyers" id={l.id} />
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
    </Container>
  );
}
