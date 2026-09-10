import type { Metadata } from 'next';
import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { ClientManagementPage } from '@/app/clients/client-management-page';
import { t } from '@/strings';
export const metadata: Metadata = { title: t.clients.manage.titles['client-restore'] };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string; contactId?: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'clients', action: 'restore' });
  const route = await params;
  return (
    <ClientManagementPage
      session={session}
      operation="client-restore"
      id={route.id!}
      parentId={null}
      searchParams={await searchParams}
    />
  );
}
