import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { FeeLetterManagementPage } from '../fee-letter-management-page';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'feeLetters', action: 'create' });
  return (
    <FeeLetterManagementPage
      session={session}
      operation="create"
      rawId={null}
      searchParams={await searchParams}
    />
  );
}
