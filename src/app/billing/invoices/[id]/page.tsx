import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { BillingDetail } from '../../billing-detail';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'billing', action: 'view' });
  return (
    <BillingDetail
      session={session}
      kind="invoices"
      id={(await params).id}
      params={await searchParams}
    />
  );
}
