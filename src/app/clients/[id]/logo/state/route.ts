import { withRoutePermission } from '@/lib/auth/authorization';
import { readLogoManagement } from '@/lib/client-logo-management';
import { LogoError } from '@/lib/client-logo-upload';
import { logoFailureMessage } from '@/lib/client-logo-request';
export const GET = withRoutePermission(
  { area: 'clientLogoUpload', action: 'view' },
  async (session, request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    try {
      const state = await readLogoManagement(
        session,
        Number(id),
        Number(new URL(request.url).searchParams.get('page') ?? 1),
      );
      return Response.json(state, {
        headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    } catch (error) {
      const code = error instanceof LogoError ? error.code : 'uncertain';
      return Response.json(
        { code, message: logoFailureMessage(code) },
        {
          status:
            code === 'missing' ? 404 : code === 'session' ? 403 : code === 'invalid' ? 400 : 503,
          headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
        },
      );
    }
  },
);
