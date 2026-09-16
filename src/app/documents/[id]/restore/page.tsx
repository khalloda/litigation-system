import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { DocumentManagementPage } from '../../document-management-page';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'documents', action: 'restore' });
  return (
    <DocumentManagementPage
      session={session}
      operation="restore"
      rawId={(await params).id}
      searchParams={await searchParams}
    />
  );
}
