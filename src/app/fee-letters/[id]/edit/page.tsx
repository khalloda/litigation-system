import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { FeeLetterManagementPage } from '../../fee-letter-management-page';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'feeLetters', action: 'update' });
  return (
    <FeeLetterManagementPage
      session={session}
      operation="update"
      rawId={(await params).id}
      searchParams={await searchParams}
    />
  );
}
