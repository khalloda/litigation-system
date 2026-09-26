import type { Session } from 'next-auth';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { recordObservedExternalEvent } from '@/lib/audit';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { AuthorizationError } from '@/lib/auth/authorization-core';
import { t } from '@/strings';
import { requireReportAuthority, reportSnapshot } from './authority';
import { parseReportInput, readReportRequest } from './input';
import { reportOptions, validateReportOptions, reportFilterLabels } from './options';
import { validateDefinition, validateReportData } from './result';
import { renderReportExcel } from './excel';
import { renderReportPdf } from './pdf';
import { REPORT_LIMITS, ReportError, type ReportDefinition, type ReportResult } from './types';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
/** Composition root accepts trusted code only. Production passes its empty registry;
 * integration harnesses import this very factory with their own test adapters. */
export function createReportEngine(
  definitions: readonly ReportDefinition[],
  database: PrismaClient,
) {
  const registry = new Map<string, ReportDefinition>();
  for (const definition of definitions) {
    validateDefinition(definition);
    if (registry.has(definition.descriptor.id)) throw new ReportError('generation');
    // Detach descriptors from caller mutation. Query adapters stay code references.
    const descriptor = structuredClone(definition.descriptor);
    function freeze(value: object) {
      Object.values(value).forEach((v) => {
        if (v && typeof v === 'object') freeze(v);
      });
      Object.freeze(value);
    }
    freeze(descriptor);
    registry.set(descriptor.id, Object.freeze({ descriptor, query: definition.query }));
  }
  let active = 0;
  function definition(id: string) {
    const found = registry.get(id);
    if (!found) throw new ReportError('unknown');
    return found;
  }
  return Object.freeze({
    async catalog(session: Session | null) {
      await requireReportAuthority(session, database, 'run');
      return [...registry.values()].map((x) => x.descriptor);
    },
    async describe(session: Session | null, id: string) {
      await requireReportAuthority(session, database, 'run');
      const d = definition(id);
      return reportSnapshot(session, database, 'run', d.descriptor.permissions, async (tx) => ({
        descriptor: d.descriptor,
        options: await reportOptions(tx, d.descriptor),
      }));
    },
    async handle(session: Session, request: Request, id: string, action: 'run' | 'export') {
      let acquired = false;
      try {
        await requireReportAuthority(session, database, action);
        const d = definition(id);
        const { format, parameters } = parseReportInput(
          d.descriptor,
          await readReportRequest(request),
        );
        if ((action === 'run') !== (format === 'preview'))
          throw new ReportError('invalid', ['format']);
        if (active >= REPORT_LIMITS.concurrent) throw new ReportError('busy');
        active++;
        acquired = true;
        const signal = AbortSignal.any([
          request.signal,
          AbortSignal.timeout(REPORT_LIMITS.milliseconds),
        ]);
        signal.throwIfAborted();
        const metadata = createServerActionAuditMetadata(
          request.headers,
          session.user.auditSessionId,
        );
        const result = await reportSnapshot(
          session,
          database,
          action,
          d.descriptor.permissions,
          async (tx) => {
            const options = await reportOptions(tx, d.descriptor);
            validateReportOptions(parameters, options);
            const generatedAt = new Date().toISOString();
            const data = await d.query(tx, parameters);
            const rowCount = validateReportData(d.descriptor, data);
            return {
              descriptor: d.descriptor,
              parameters,
              filterLabels: reportFilterLabels(d.descriptor, parameters, options),
              data,
              generatedAt,
              operationId: metadata.correlationId,
              rowCount,
            } satisfies ReportResult;
          },
        );
        signal.throwIfAborted();
        await requireReportAuthority(session, database, action, d.descriptor.permissions);
        const parameterEvidence = {
          from: parameters.from,
          to: parameters.to,
          client: parameters.client.kind === 'id' ? parameters.client.id : parameters.client.kind,
          branch: parameters.branch.kind === 'id' ? parameters.branch.id : parameters.branch.kind,
          lawyer: parameters.lawyer.kind === 'id' ? parameters.lawyer.id : parameters.lawyer.kind,
          ...parameters.extra,
        };
        const evidence = {
          definition_version: d.descriptor.version,
          operation_id: metadata.correlationId,
          format,
          rows: result.rowCount,
          columns: d.descriptor.columns.length,
          generated_at: result.generatedAt,
        };
        const queryEvent = await recordObservedExternalEvent(
          database,
          Number(session.user.id),
          metadata,
          {
            action: 'report_executed',
            outcome: 'succeeded',
            resourceIdentifier: `report:${id}`,
            parameters: parameterEvidence,
            metadata: evidence,
          },
        );
        signal.throwIfAborted();
        if (format === 'preview') {
          await requireReportAuthority(session, database, action, d.descriptor.permissions);
          signal.throwIfAborted();
          let remaining = REPORT_LIMITS.previewRows;
          const preview = {
            ...result,
            data: {
              ...result.data,
              clientBrand: undefined,
              sections: result.data.sections.map((section) => ({
                ...section,
                groups: section.groups.map((group) => {
                  const rows = group.rows.slice(0, remaining);
                  remaining -= rows.length;
                  return { ...group, rows };
                }),
              })),
            },
          };
          return Response.json(preview, {
            headers: {
              ...headers,
              'X-Report-Operation': metadata.correlationId,
              'X-Audit-Event-Id': String(queryEvent),
            },
          });
        }
        const bytes =
          format === 'xlsx'
            ? await renderReportExcel(result, signal)
            : await renderReportPdf(result, session, signal);
        signal.throwIfAborted();
        await requireReportAuthority(session, database, action, d.descriptor.permissions);
        const digest = createHash('sha256').update(bytes).digest('hex');
        const exportEvent = await recordObservedExternalEvent(
          database,
          Number(session.user.id),
          metadata,
          {
            action: 'export_completed',
            outcome: 'succeeded',
            resourceIdentifier: `report:${id}`,
            parameters: parameterEvidence,
            metadata: { ...evidence, bytes: bytes.length, sha256: digest },
          },
        );
        signal.throwIfAborted();
        await requireReportAuthority(session, database, action, d.descriptor.permissions);
        signal.throwIfAborted();
        return new Response(new Uint8Array(bytes), {
          headers: {
            ...headers,
            'Content-Type':
              format === 'xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'application/pdf',
            'Content-Disposition': `attachment; filename="${id}.${format}"`,
            'Content-Length': String(bytes.length),
            'X-Artifact-SHA256': digest,
            'X-Report-Operation': metadata.correlationId,
            'X-Audit-Event-Id': String(exportEvent),
          },
        });
      } catch (error) {
        const denied = error instanceof AuthorizationError;
        const code =
          error instanceof ReportError
            ? error.code
            : error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
              ? 'cancelled'
              : 'generation';
        return Response.json(
          {
            error: denied ? 'denied' : code,
            message: denied
              ? t.reports.errors.denied
              : Object.entries(t.reports.errors)
                  .find(([key]) => key === code)!
                  .at(1),
            fields: error instanceof ReportError ? error.fields : [],
          },
          {
            status: denied
              ? error.status
              : code === 'unknown'
                ? 404
                : code === 'invalid'
                  ? 400
                  : code === 'too-large'
                    ? 413
                    : code === 'busy'
                      ? 429
                      : code === 'cancelled'
                        ? 409
                        : 500,
            headers,
          },
        );
      } finally {
        if (acquired) active--;
      }
    },
  });
}
