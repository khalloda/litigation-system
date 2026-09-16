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
  const session = await requirePagePermission({ area: 'feeLetters', action: 'restore' });
  return (
    <FeeLetterManagementPage
      session={session}
      operation="restore"
      rawId={(await params).id}
      searchParams={await searchParams}
    />
  );
}
