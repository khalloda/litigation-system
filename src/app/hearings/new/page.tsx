import { requirePagePermission } from '@/lib/auth/authorization';
import { HearingManagementPage } from '../hearing-management-page';
export default async function Page() {
  const session = await requirePagePermission({ area: 'hearings', action: 'create' });
  return <HearingManagementPage session={session} id={null} />;
}
