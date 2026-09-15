import type { Metadata } from 'next';
import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { AdminLifecyclePage } from '@/app/admin-works/admin-lifecycle-page';
import { t } from '@/strings';
export const metadata: Metadata = { title: t.adminWorks.lifecycle.restore };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; stepId?: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'administrativeWorks', action: 'restore' });
  const p = await params;
  return (
    <AdminLifecyclePage
      session={session}
      operation="task-restore"
      id={p.id}
      stepId={null}
      params={await searchParams}
    />
  );
}
