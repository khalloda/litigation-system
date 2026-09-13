import type { ClientSearchParams } from '@/lib/client-query';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { HearingManagementPage } from '../../hearing-management-page';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'hearings', action: 'update' });
  const { id } = await params;
  if (!/^[1-9][0-9]*$/u.test(id) || Number(id) > 2147483647) notFound();
  return <HearingManagementPage session={session} id={Number(id)} params={await searchParams} />;
}
