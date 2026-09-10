import { withRoutePermission } from '@/lib/auth/authorization';
import { handleLogoRequest } from '@/lib/client-logo-request';
export const POST = withRoutePermission(
  { area: 'clientLogoUpload', action: 'restore' },
  async (session, request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    return handleLogoRequest(session, request, Number(id), 'restore');
  },
);
