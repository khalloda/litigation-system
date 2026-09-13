import type { Metadata } from 'next';
import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { HearingLifecyclePage } from '@/app/hearings/hearing-lifecycle-page';
import { t } from '@/strings';
export const metadata: Metadata = { title: t.hearings.lifecycle.archive };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'hearings', action: 'archive' });
  return (
    <HearingLifecyclePage
      session={session}
      action="archive"
      id={(await params).id}
      params={await searchParams}
    />
  );
}
