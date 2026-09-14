import type { ClientSearchParams } from '@/lib/client-query';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { AdminManagementPage } from '../../admin-management-page';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string; stepId?: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'administrativeWorks', action: 'update' });
  const { id, stepId } = await params;
  if (
    [id, stepId].some(
      (v) => v !== undefined && (!/^[1-9][0-9]*$/u.test(v) || Number(v) > 2147483647),
    )
  )
    notFound();
  return (
    <AdminManagementPage
      session={session}
      operation="task-update"
      taskId={Number(id)}
      stepId={null}
      params={await searchParams}
    />
  );
}
