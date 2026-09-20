import { withRoutePermission } from '@/lib/auth/authorization';
import { readAuditHistory } from '@/lib/audit-history-query';
import { auditParamsObject } from '@/lib/audit-history-input';
import { auditErrorResponse, auditResponseHeaders } from '@/lib/audit-history-response';
export const GET = withRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async (session, request: Request) => {
    try {
      return Response.json(
        await readAuditHistory(session, auditParamsObject(new URL(request.url).searchParams)),
        { headers: auditResponseHeaders },
      );
    } catch (error) {
      return auditErrorResponse(error);
    }
  },
);
export const HEAD = withRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async () => new Response(null, { status: 405, headers: auditResponseHeaders }),
);
export const OPTIONS = withRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async () => new Response(null, { status: 405, headers: auditResponseHeaders }),
);
