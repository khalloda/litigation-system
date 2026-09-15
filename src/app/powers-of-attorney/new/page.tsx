import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { PoaManagementPage } from '../poa-management-page';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'powersOfAttorney', action: 'create' });
  return (
    <PoaManagementPage
      session={session}
      operation="create"
      rawId={null}
      searchParams={await searchParams}
    />
  );
}
