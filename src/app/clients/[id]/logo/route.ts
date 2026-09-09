import { withRoutePermission } from '@/lib/auth/authorization';
import { getClientLogo } from '@/lib/client-logo';
export const GET = withRoutePermission(
  { area: 'clientLogoUpload', action: 'view' },
  async (session, _request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const logo = await getClientLogo(session, id);
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    return logo
      ? new Response(new Uint8Array(logo.data), {
          headers: {
            ...headers,
            'Content-Type': logo.contentType,
            'Content-Length': String(logo.data.length),
          },
        })
      : new Response(null, { status: 404, headers });
  },
);
export const HEAD = withRoutePermission(
  { area: 'clientLogoUpload', action: 'view' },
  async (session, _request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const logo = await getClientLogo(session, id);
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    return new Response(null, {
      status: logo ? 200 : 404,
      headers: logo
        ? {
            ...headers,
            'Content-Type': logo.contentType,
            'Content-Length': String(logo.data.length),
          }
        : headers,
    });
  },
);
