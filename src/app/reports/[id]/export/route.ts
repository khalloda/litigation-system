import { withRoutePermission } from '@/lib/auth/authorization';
import { reporting } from '@/lib/reports/production';
export const dynamic = 'force-dynamic';
export const POST = withRoutePermission(
  { area: 'reports', action: 'export' },
  async (session, request: Request, context: { params: Promise<{ id: string }> }) =>
    reporting.handle(session, request, (await context.params).id, 'export'),
);
