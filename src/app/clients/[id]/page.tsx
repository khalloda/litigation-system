import { hearingReturnHref, HearingFilterError } from '@/lib/hearing-query';
import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getClient, getClientContacts } from '@/lib/clients';
import {
  ClientFilterError,
  parseClientFilters,
  clientListHref,
  clientDetailHref,
  type ClientSearchParams,
} from '@/lib/client-query';
import { t } from '@/strings';
import { AuditRecordEntry, AuditLogoEntry } from '@/app/audit-history/record-entry';
import styles from '../../staff/staff.module.css';
import local from '../clients.module.css';
import { Field, classificationLabel, statusLabel } from '../client-fields';
import { ClientLogo } from '../client-logo';
import { ClientAlert } from '../client-alert';
import {
  matterListHref,
  parseMatterFilters,
  matterReturnHref,
  MatterFilterError,
} from '@/lib/matter-query';
export const metadata: Metadata = { title: t.clients.details };
export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'clients', action: 'view' });
  const { id } = await params;
  const client = await getClient(session, id);
  if (!client) notFound();
  let filters, contacts, matterReturn, hearingReturn;
  try {
    const input = await searchParams;
    matterReturn = matterReturnHref(input.matterReturn);
    hearingReturn = hearingReturnHref(input.hearingReturn);
    filters = parseClientFilters(input);
    if (Array.isArray(input.contactsPage)) throw new ClientFilterError('repeated contacts page');
    contacts = await getClientContacts(session, id, input.contactsPage ?? '1');
  } catch (error) {
    if (
      !(error instanceof ClientFilterError) &&
      !(error instanceof MatterFilterError) &&
      !(error instanceof HearingFilterError)
    )
      throw error;
    return (
      <main className={styles.page}>
        <h1>{t.clients.details}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href={`/clients/${client.id}`}>
            {t.clients.clear}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  if (!contacts) notFound();
  const detailHref = clientDetailHref(client.id, filters);
  const returnQuery = detailHref.slice(detailHref.indexOf('?')) + `&contactsPage=${contacts.page}`;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={local.multiline}>
          <p className={styles.eyebrow}>{t.clients.details}</p>
          <h1 dir="auto">{client.nameAr}</h1>
          <p>{t.clients.subtitle}</p>
          <Link className={styles.link} href={clientListHref(filters)}>
            {t.clients.back}
          </Link>
          {hearingReturn ? (
            <Link className={styles.link} href={hearingReturn}>
              {t.hearings.back}
            </Link>
          ) : null}
          {matterReturn ? (
            <Link className={styles.link} href={matterReturn}>
              {t.matters.back}
            </Link>
          ) : null}
        </div>
        <ClientLogo key={client.id} id={client.id} name={client.nameAr} version={randomUUID()} />
      </header>
      <AuditRecordEntry session={session} table="clients" id={client.id} />
      <AuditLogoEntry session={session} clientId={client.id} />
      {client.isArchived ? (
        <p className={`${styles.panel} ${styles.state}`}>{t.clients.archivedNotice}</p>
      ) : null}
      <div className={styles.actions}>
        {hasPermission(session.user.role, 'billing', 'view') ? (
          <Link className={styles.link} href={`/billing/invoices?client=${client.id}`}>
            {t.billing.invoices}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'billing', 'view') ? (
          <Link className={styles.link} href={`/billing/payments?client=${client.id}`}>
            {t.billing.payments}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'documents', 'view') ? (
          <Link className={styles.link} href={`/documents?client=${client.id}&archive=all`}>
            {t.nav.documents}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'feeLetters', 'view') ? (
          <Link className={styles.link} href={`/fee-letters?client=${client.id}&archive=all`}>
            {t.nav.feeLetters}
          </Link>
        ) : null}
        <Link
          className={styles.link}
          href={matterListHref(
            parseMatterFilters({
              client: String(client.id),
              fromClient: `/clients/${client.id}${returnQuery}`,
            }),
          )}
        >
          {t.matters.clientMatters}
        </Link>
        <Link className={styles.link} href={`/clients/${client.id}/logo/manage${returnQuery}`}>
          {t.logos.title}
        </Link>
        {!client.isArchived && hasPermission(session.user.role, 'clients', 'update') ? (
          <Link className={styles.link} href={`/clients/${client.id}/edit${returnQuery}`}>
            {t.clients.manage.titles['client-update']}
          </Link>
        ) : null}
        {!client.isArchived && hasPermission(session.user.role, 'contacts', 'create') ? (
          <Link className={styles.link} href={`/clients/${client.id}/contacts/new${returnQuery}`}>
            {t.clients.manage.titles['contact-create']}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'clients', client.isArchived ? 'restore' : 'archive') ? (
          <Link
            className={styles.link}
            href={`/clients/${client.id}/${client.isArchived ? 'restore' : 'archive'}${returnQuery}`}
          >
            {client.isArchived
              ? t.clients.manage.titles['client-restore']
              : t.clients.manage.titles['client-archive']}
          </Link>
        ) : null}
      </div>
      <section className={styles.panel} aria-label={t.clients.details}>
        <h2>{t.clients.details}</h2>
        <dl className={styles.facts}>
          <Field label={t.clients.systemId} value={client.id} />
          <Field label={t.clients.accessId} value={client.legacyId ?? t.clients.native} />
          <Field label={t.clients.displayName} value={client.nameAr} />
          <Field label={t.clients.englishName} value={client.nameEn} />
          <Field label={t.clients.fullName} value={client.fullName} />
          <Field label={t.clients.status} value={statusLabel(client.status)} />
          <Field
            label={t.clients.classification}
            value={classificationLabel(client.classification)}
          />
          <Field
            label={t.clients.archive}
            value={client.isArchived ? t.clients.archived : t.clients.current}
          />
          <Field label={t.clients.poaLocation} value={client.poaLocation} />
          <Field label={t.clients.documentsLocation} value={client.documentsLocation} />
          <Field label={t.clients.startDate} value={client.startDate} />
          <Field label={t.clients.endDate} value={client.endDate} />
          <Field label={t.clients.matterCount} value={client.matterCount} />
          <Field
            label={t.clients.mainContact}
            value={
              client.mainContact ? (
                <Link
                  className={styles.nameLink}
                  href={`/clients/${client.id}/contacts/${client.mainContact.id}${detailHref.slice(detailHref.indexOf('?'))}&contactsPage=${contacts.page}`}
                >
                  {client.mainContact.contactName?.trim()
                    ? client.mainContact.contactName
                    : t.clients.unnamed}
                </Link>
              ) : (
                t.clients.noMainContact
              )
            }
          />
        </dl>
      </section>
      <section className={styles.panel} aria-label={t.clients.historicalLawyer}>
        <h2>{t.clients.historicalLawyer}</h2>
        <p className={local.multiline} dir="auto">
          {client.historicalLawyer?.trim() ? client.historicalLawyer : t.common.notRecorded}
        </p>
        <p className={styles.hint}>{t.clients.historicalHint}</p>
      </section>
      <section className={styles.panel} aria-label={t.clients.contacts}>
        <div className={styles.resultsHeading}>
          <h2>{t.clients.contacts}</h2>
          <p role="status">{t.clients.contactResults(contacts.total)}</p>
        </div>
        <p>{t.clients.contactHistory}</p>
        {contacts.rows.length ? (
          <ul className={styles.list}>
            {contacts.rows.map((contact) => (
              <li className={styles.row} key={contact.id}>
                <AuditRecordEntry session={session} table="contacts" id={contact.id} />
                <div className={local.multiline}>
                  <h3>
                    <Link
                      className={styles.nameLink}
                      href={`/clients/${client.id}/contacts/${contact.id}${detailHref.slice(detailHref.indexOf('?'))}&contactsPage=${contacts.page}`}
                    >
                      <bdi>
                        {contact.contactName?.trim() ? contact.contactName : t.clients.unnamed}
                      </bdi>
                    </Link>
                  </h3>
                </div>
                <dl>
                  <Field label={t.clients.systemId} value={contact.id} />
                  <Field label={t.clients.accessId} value={contact.legacyId ?? t.clients.native} />
                </dl>
                <dl>
                  <Field label={t.clients.jobTitle} value={contact.jobTitle} />
                </dl>
                <dl>
                  <Field
                    label={t.clients.archive}
                    value={contact.isArchived ? t.clients.archived : t.clients.current}
                  />
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{t.clients.noContacts}</p>
        )}
        <nav className={styles.pagination} aria-label={t.clients.contactPagination}>
          {contacts.page > 1 ? (
            <Link className={styles.link} href={`${detailHref}&contactsPage=${contacts.page - 1}`}>
              {t.clients.previous}
            </Link>
          ) : null}
          <p>{t.clients.page(contacts.page, contacts.pages)}</p>
          {contacts.page < contacts.pages ? (
            <Link className={styles.link} href={`${detailHref}&contactsPage=${contacts.page + 1}`}>
              {t.clients.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
