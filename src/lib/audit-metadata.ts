import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const auditMetadataBrand: unique symbol = Symbol('server-audit-metadata');

export type AuditDeviceClass = 'system' | 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

/**
 * Opaque server-created request evidence. The brand keeps route and action
 * code from constructing authoritative IDs or addresses as ordinary input.
 */
export type AuditRequestMetadata = Readonly<{
  requestId: string;
  correlationId: string;
  auditSessionId: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceClass: AuditDeviceClass;
  [auditMetadataBrand]: true;
}>;

type HeaderReader = Pick<Headers, 'get'>;

function classifyDevice(userAgent: string | null): AuditDeviceClass {
  if (!userAgent) return 'unknown';
  if (/\b(bot|crawler|spider|headless)\b/iu.test(userAgent)) return 'bot';
  if (/\b(ipad|tablet)\b/iu.test(userAgent)) return 'tablet';
  if (/\b(android|iphone|mobile)\b/iu.test(userAgent)) return 'mobile';
  return 'desktop';
}

function trustedForwardedAddress(headers: HeaderReader | undefined): string | null {
  if (process.env['AUDIT_TRUST_PROXY'] !== 'true' || !headers) return null;
  const candidate = headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return isIP(candidate) === 0 ? null : candidate;
}

function boundedUserAgent(headers: HeaderReader | undefined): string | null {
  const value = headers?.get('user-agent')?.trim() ?? '';
  if (!value) return null;
  // PostgreSQL records a 512-character value plus a truncation flag. Keep at
  // most 513 characters in application memory so even hostile headers remain
  // bounded while the database can still prove truncation occurred.
  return value.slice(0, 513);
}

function createMetadata(
  headers: HeaderReader | undefined,
  auditSessionId: string,
  deviceOverride?: AuditDeviceClass,
): AuditRequestMetadata {
  const userAgent = boundedUserAgent(headers);
  return {
    requestId: randomUUID(),
    correlationId: randomUUID(),
    auditSessionId,
    ipAddress: trustedForwardedAddress(headers),
    userAgent,
    deviceClass: deviceOverride ?? classifyDevice(userAgent),
    [auditMetadataBrand]: true,
  };
}

/**
 * Build metadata from a server-owned Request. Next.js/Auth.js do not expose a
 * directly observed peer address here, so IP is NULL unless deployment has
 * explicitly enabled its trusted reverse proxy.
 */
export function createRequestAuditMetadata(
  request: Pick<Request, 'headers'>,
  auditSessionId = randomUUID(),
): AuditRequestMetadata {
  return createMetadata(request.headers, auditSessionId);
}

/** Server-action variant; `headers()` remains untrusted descriptive input. */
export function createServerActionAuditMetadata(
  headers: HeaderReader,
  auditSessionId: string,
): AuditRequestMetadata {
  return createMetadata(headers, auditSessionId);
}

/** Non-request tools state the absence of network evidence explicitly. */
export function createMaintenanceAuditMetadata(): AuditRequestMetadata {
  return createMetadata(undefined, randomUUID(), 'system');
}
