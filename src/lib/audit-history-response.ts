import { AuthorizationError } from './auth/authorization-core';
import { AuditHistoryError } from './audit-history-types';
import { auditErrorText } from './audit-history-projection';
export const auditResponseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie',
};
export function auditErrorResponse(error: unknown) {
  const code =
    error instanceof AuthorizationError
      ? 'forbidden'
      : error instanceof AuditHistoryError
        ? error.code
        : 'generic';
  return Response.json(
    { error: code, message: auditErrorText(code) },
    {
      status:
        error instanceof AuthorizationError
          ? error.status
          : code === 'duplicate'
            ? 409
            : code === 'too-large'
              ? 413
              : code === 'generic' || code === 'generation'
                ? 500
                : 400,
      headers: auditResponseHeaders,
    },
  );
}
