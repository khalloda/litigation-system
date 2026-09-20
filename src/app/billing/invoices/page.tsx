import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { BillingList } from '../billing-list';
import { t } from '@/strings';
export const metadata = { title: t.billing.invoices };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'billing', action: 'view' });
  return <BillingList session={session} kind="invoices" params={await searchParams} />;
}
