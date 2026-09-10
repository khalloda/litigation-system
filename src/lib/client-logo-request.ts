import 'server-only';
import type { Session } from 'next-auth';
import { requireAuthorizedDecision, decideAuthorization } from './auth/authorization-core';
import { createRequestAuditMetadata } from './audit-metadata';
import { mutateLogo, readLogoManagement, type LogoAction } from './client-logo-management';
import { LogoError, LOGO_UPLOAD_LIMIT, prepareLogo, type LogoFailure } from './client-logo-upload';
import { t } from '@/strings';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export function logoFailureMessage(code: LogoFailure) {
  switch (code) {
    case 'invalid':
      return t.logos.errors.invalid;
    case 'size':
      return t.logos.errors.size;
    case 'storage':
      return t.logos.errors.storage;
    case 'stale':
      return t.logos.errors.stale;
    case 'session':
      return t.logos.errors.session;
    case 'archived':
      return t.logos.errors.archived;
    case 'missing':
      return t.logos.errors.missing;
    case 'submission':
      return t.logos.errors.submission;
    case 'uncertain':
      return t.logos.errors.uncertain;
  }
}
async function boundedForm(request: Request) {
  // Route Handlers have no Server Action 1 MB default. Bound the stream before
  // multipart parsing, allowing 64 KiB overhead for the legitimate 2 MiB file.
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    !request.headers.get('content-type')?.startsWith('multipart/form-data;')
  )
    throw new LogoError('invalid');
  const max = LOGO_UPLOAD_LIMIT + 64 * 1024;
  const length = Number(request.headers.get('content-length'));
  if (length > max) throw new LogoError('size');
  const reader = request.body?.getReader();
  if (!reader) throw new LogoError('invalid');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > max) {
        await reader.cancel();
        throw new LogoError('size');
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { 'Content-Type': request.headers.get('content-type')! },
    }).formData();
  } catch {
    throw new LogoError('invalid');
  }
}
export async function handleLogoRequest(
  session: Session,
  request: Request,
  clientId: number,
  action: LogoAction | 'preview',
) {
  requireAuthorizedDecision(
    decideAuthorization(session, 'clientLogoUpload', action === 'preview' ? 'create' : action),
  );
  try {
    const form = await boundedForm(request);
    const allowed =
      action === 'preview'
        ? ['file']
        : ['file', 'version', 'clientVersion', 'submission', 'target'];
    for (const key of form.keys())
      if (!allowed.includes(key) || form.getAll(key).length !== 1) throw new LogoError('invalid');
    const file = form.get('file');
    const upload =
      file instanceof File
        ? { bytes: Buffer.from(await file.arrayBuffer()), name: file.name, mime: file.type }
        : undefined;
    if (action === 'preview') {
      const state = await readLogoManagement(session, clientId);
      if (state.clientArchived || state.archived) throw new LogoError('archived');
      if (!upload) throw new LogoError('invalid');
      const image = await prepareLogo(upload.bytes, upload.name, upload.mime);
      return new Response(new Uint8Array(image.bytes), {
        headers: {
          ...headers,
          'Content-Type': image.contentType,
          'Content-Length': String(image.bytes.length),
        },
      });
    }
    if (file !== null && !upload) throw new LogoError('invalid');
    const result = await mutateLogo(
      session,
      action,
      {
        clientId,
        version: String(form.get('version') ?? ''),
        clientVersion: String(form.get('clientVersion') ?? ''),
        submission: String(form.get('submission') ?? ''),
        target: form.get('target') === null ? null : String(form.get('target')),
        upload,
      },
      {
        auditMetadata: createRequestAuditMetadata(
          request,
          session.user.auditSessionId as `${string}-${string}-${string}-${string}-${string}`,
        ),
      },
    );
    return Response.json(result, { headers });
  } catch (error) {
    const code = error instanceof LogoError ? error.code : 'uncertain';
    return Response.json(
      { code, message: logoFailureMessage(code) },
      {
        status:
          code === 'session'
            ? 403
            : code === 'stale' || code === 'submission'
              ? 409
              : code === 'size'
                ? 413
                : code === 'uncertain' || code === 'storage'
                  ? 503
                  : 400,
        headers,
      },
    );
  }
}
