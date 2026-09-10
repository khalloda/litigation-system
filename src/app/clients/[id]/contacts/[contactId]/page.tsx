import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getContact } from '@/lib/clients';
import {
  clientId,
  ClientFilterError,
  parseClientFilters,
  clientDetailHref,
  type ClientSearchParams,
} from '@/lib/client-query';
import { t } from '@/strings';
import styles from '../../../../staff/staff.module.css';
import local from '../../../clients.module.css';
import { Field } from '../../../client-fields';
import { ClientAlert } from '../../../client-alert';
export const metadata: Metadata = { title: t.clients.contactDetails };
export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contactId: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'contacts', action: 'view' });
  const { id, contactId: rawContact } = await params;
  const contact = await getContact(session, id, rawContact);
  if (!contact) notFound();
  let back;
  try {
    const input = await searchParams;
    const filters = parseClientFilters(input);
    if (Array.isArray(input.contactsPage) || clientId(input.contactsPage ?? '1') === null)
      throw new ClientFilterError('invalid contacts page');
    back = `${clientDetailHref(contact.clientId, filters)}&contactsPage=${input.contactsPage ?? '1'}`;
  } catch (error) {
    if (!(error instanceof ClientFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.clients.contactDetails}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link
            className={styles.link}
            href={`/clients/${contact.clientId}/contacts/${contact.id}`}
          >
            {t.clients.clear}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <header className={`${styles.header} ${local.multiline}`}>
        <div>
          <p className={styles.eyebrow}>{t.clients.contactDetails}</p>
          <h1 dir="auto">
            {contact.contactName?.trim() ? contact.contactName : t.clients.unnamed}
          </h1>
          <p dir="auto">{contact.clientName}</p>
        </div>
        <Link className={styles.link} href={back}>
          {t.clients.backClient}
        </Link>
      </header>
      {contact.parentArchived ? (
        <p className={`${styles.panel} ${styles.state}`}>{t.clients.archivedNotice}</p>
      ) : null}
      {contact.isArchived ? (
        <p className={`${styles.panel} ${styles.state}`}>{t.clients.contactArchivedNotice}</p>
      ) : null}
      {!contact.parentArchived ? (
        <div className={styles.actions}>
          {!contact.isArchived && hasPermission(session.user.role, 'contacts', 'update') ? (
            <Link
              className={styles.link}
              href={`/clients/${contact.clientId}/contacts/${contact.id}/edit${back.slice(back.indexOf('?'))}`}
            >
              {t.clients.manage.titles['contact-update']}
            </Link>
          ) : null}
          {hasPermission(
            session.user.role,
            'contacts',
            contact.isArchived ? 'restore' : 'archive',
          ) ? (
            <Link
              className={styles.link}
              href={`/clients/${contact.clientId}/contacts/${contact.id}/${contact.isArchived ? 'restore' : 'archive'}${back.slice(back.indexOf('?'))}`}
            >
              {contact.isArchived
                ? t.clients.manage.titles['contact-restore']
                : t.clients.manage.titles['contact-archive']}
            </Link>
          ) : null}
        </div>
      ) : null}
      <section className={styles.panel} aria-label={t.clients.contactDetails}>
        <h2>{t.clients.contactDetails}</h2>
        <dl className={styles.facts}>
          <Field label={t.clients.systemId} value={contact.id} />
          <Field label={t.clients.accessId} value={contact.legacyId ?? t.clients.native} />
          <Field
            label={t.clients.contactName}
            value={contact.contactName?.trim() ? contact.contactName : t.clients.unnamed}
          />
          <Field label={t.clients.secondaryFullName} value={contact.fullName} />
          <Field label={t.clients.jobTitle} value={contact.jobTitle} />
          <Field
            label={t.clients.archive}
            value={contact.isArchived ? t.clients.archived : t.clients.current}
          />
          <Field label={t.clients.email} value={contact.email} />
          <Field label={t.clients.mobile} value={contact.mobilePhone} />
          <Field label={t.clients.businessPhone} value={contact.businessPhone} />
          <Field label={t.clients.fax} value={contact.fax} />
          <Field label={t.clients.website} value={contact.website} />
          <Field label={t.clients.address} value={contact.address} />
          <Field label={t.clients.city} value={contact.city} />
          <Field label={t.clients.stateProvince} value={contact.stateProvince} />
          <Field label={t.clients.countryRegion} value={contact.countryRegion} />
          <Field label={t.clients.postalCode} value={contact.postalCode} />
        </dl>
      </section>
    </main>
  );
}
