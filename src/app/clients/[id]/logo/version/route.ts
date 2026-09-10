import { withRoutePermission } from '@/lib/auth/authorization';
import { readLogoManagement, logoMetadata } from '@/lib/client-logo-management';
import { readClientLogoFile } from '@/lib/client-logo-file';
import { LogoError } from '@/lib/client-logo-upload';
export const GET = withRoutePermission(
  { area: 'clientLogoUpload', action: 'restore' },
  async (session, request: Request, context: { params: Promise<{ id: string }> }) => {
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    try {
      const { id } = await context.params;
      const target = new URL(request.url).searchParams.get('id');
      const state = await readLogoManagement(session, Number(id), 1, target);
      const logo = state.selected
        ? await readClientLogoFile(
            session,
            process.env['CLIENT_LOGO_ROOT'],
            logoMetadata(state.selected),
          )
        : null;
      return logo
        ? new Response(new Uint8Array(logo.data), {
            headers: {
              ...headers,
              'Content-Type': logo.contentType,
              'Content-Length': String(logo.data.length),
            },
          })
        : new Response(null, { status: 404, headers });
    } catch (error) {
      return new Response(null, {
        status:
          error instanceof LogoError
            ? error.code === 'session'
              ? 403
              : error.code === 'uncertain'
                ? 503
                : 404
            : 503,
        headers,
      });
    }
  },
);
