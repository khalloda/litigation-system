import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { readLogoManagement } from '@/lib/client-logo-management';
import { LogoError } from '@/lib/client-logo-upload';
import {
  clientId,
  clientDetailHref,
  parseClientFilters,
  type ClientSearchParams,
  ClientFilterError,
} from '@/lib/client-query';
import { LogoManager } from '@/app/clients/logo-manager';
import { t } from '@/strings';
import { ClientAlert } from '@/app/clients/client-alert';
import styles from '@/app/staff/staff.module.css';
export const metadata: Metadata = { title: t.logos.title };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'clientLogoUpload', action: 'view' });
  const route = await params;
  const query = await searchParams;
  const identity = clientId(route.id);
  if (identity === null) notFound();
  const state = await readLogoManagement(session, identity).catch((error) => {
    if (error instanceof LogoError && error.code === 'missing') notFound();
    throw error;
  });
  let filters, contactPage;
  try {
    filters = parseClientFilters(query);
    if (Array.isArray(query.contactsPage)) throw new ClientFilterError('repeated contacts page');
    contactPage = clientId(query.contactsPage ?? '1');
    if (contactPage === null) throw new ClientFilterError('invalid contacts page');
  } catch (error) {
    if (!(error instanceof ClientFilterError)) throw error;
    return (
      <main className={styles.page}>
        <h1>{t.logos.title}</h1>
        <ClientAlert>
          <p>{t.clients.invalidFilters}</p>
          <Link className={styles.link} href={`/clients/${identity}/logo/manage`}>
            {t.clients.clear}
          </Link>
        </ClientAlert>
      </main>
    );
  }
  return (
    <LogoManager
      initial={state}
      role={session.user.role}
      back={`${clientDetailHref(identity, filters)}&contactsPage=${contactPage}`}
    />
  );
}
