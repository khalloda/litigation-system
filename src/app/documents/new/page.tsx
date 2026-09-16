import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { DocumentManagementPage } from '../document-management-page';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'documents', action: 'create' });
  return (
    <DocumentManagementPage
      session={session}
      operation="create"
      rawId={null}
      searchParams={await searchParams}
    />
  );
}
