import type { Metadata } from 'next';
import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { MatterLifecyclePage } from '@/app/matters/matter-lifecycle-page';
import { t } from '@/strings';
export const metadata: Metadata = { title: t.matters.lifecycle.archive };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'matters', action: 'archive' });
  return (
    <MatterLifecyclePage
      session={session}
      action="archive"
      id={(await params).id}
      params={await searchParams}
    />
  );
}
