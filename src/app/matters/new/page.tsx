import type { Metadata } from 'next';
import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { MatterManagementPage } from '../matter-management-page';
import { t } from '@/strings';
export const metadata: Metadata = { title: t.matters.manage.create };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'matters', action: 'create' });
  return <MatterManagementPage session={session} id={null} params={await searchParams} />;
}
