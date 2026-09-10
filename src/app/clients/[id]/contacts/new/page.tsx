import type { Metadata } from 'next';
import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { ClientManagementPage } from '@/app/clients/client-management-page';
import { t } from '@/strings';
export const metadata: Metadata = { title: t.clients.manage.titles['contact-create'] };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string; contactId?: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'contacts', action: 'create' });
  const route = await params;
  return (
    <ClientManagementPage
      session={session}
      operation="contact-create"
      id={null}
      parentId={route.id!}
      searchParams={await searchParams}
    />
  );
}
