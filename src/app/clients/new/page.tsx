import type { Metadata } from 'next';
import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { ClientManagementPage } from '@/app/clients/client-management-page';
import { t } from '@/strings';
export const metadata: Metadata = { title: t.clients.manage.titles['client-create'] };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'clients', action: 'create' });
  return (
    <ClientManagementPage
      session={session}
      operation="client-create"
      id={null}
      parentId={null}
      searchParams={await searchParams}
    />
  );
}
