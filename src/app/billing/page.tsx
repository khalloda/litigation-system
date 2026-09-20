import { requirePagePermission } from '@/lib/auth/authorization';
import { redirect } from 'next/navigation';
export default async function Page() {
  const session = await requirePagePermission({ area: 'billing', action: 'view' });
  void session;
  redirect('/billing/invoices');
}
