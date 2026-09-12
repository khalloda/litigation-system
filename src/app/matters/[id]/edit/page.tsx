import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { clientId, type ClientSearchParams } from '@/lib/client-query';
import { MatterManagementPage } from '../../matter-management-page';
import { t } from '@/strings';
export const metadata: Metadata = { title: t.matters.manage.edit };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'matters', action: 'update' });
  const id = clientId((await params).id);
  if (id === null) notFound();
  return <MatterManagementPage session={session} id={id} params={await searchParams} />;
}
