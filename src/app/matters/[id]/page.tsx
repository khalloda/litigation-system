import type { Metadata } from 'next';
import { requirePagePermission } from '@/lib/auth/authorization';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { MatterDetail } from '../matter-detail';
export const metadata: Metadata = { title: t.matters.details };
export default async function MatterPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'matters', action: 'view' });
  return <MatterDetail {...props} session={session} />;
}
