import { withAuditExportRoutePermission } from '@/lib/auth/authorization';
import { handleAuditExport } from '@/lib/audit-history-export';
import { auditResponseHeaders } from '@/lib/audit-history-response';
export const runtime = 'nodejs';
export const POST = withAuditExportRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async (session, request: Request) => handleAuditExport(session, request),
);
export const GET = withAuditExportRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async () => new Response(null, { status: 405, headers: auditResponseHeaders }),
);
export const HEAD = withAuditExportRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async () => new Response(null, { status: 405, headers: auditResponseHeaders }),
);
export const OPTIONS = withAuditExportRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async () => new Response(null, { status: 405, headers: auditResponseHeaders }),
);
export const PUT = withAuditExportRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async () => new Response(null, { status: 405, headers: auditResponseHeaders }),
);
export const PATCH = withAuditExportRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async () => new Response(null, { status: 405, headers: auditResponseHeaders }),
);
export const DELETE = withAuditExportRoutePermission(
  { area: 'auditHistory', action: 'view' },
  async () => new Response(null, { status: 405, headers: auditResponseHeaders }),
);
