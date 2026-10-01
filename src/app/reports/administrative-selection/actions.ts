'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { ReportSelectionError } from '@/lib/reports/selection';
import { saveAdministrativeReportSelection } from '@/lib/reports/administrative-selection';
import { t } from '@/strings';

export const saveAdministrativeSelectionAction = withActionPermission(
  { area: 'reports', action: 'run' },
  async (session, value: unknown) => {
    try {
      // The service and database independently enforce the source-kind edit permission.
      const result = await saveAdministrativeReportSelection(session, value, {
        auditMetadata: createServerActionAuditMetadata(
          await headers(),
          session.user.auditSessionId,
        ),
      });
      revalidatePath('/reports/administrative-selection');
      return {
        ok: true as const,
        ...result,
        message: result.changed ? t.administrativeSelection.saved : t.reportSelection.unchanged,
      };
    } catch (error) {
      const code = error instanceof ReportSelectionError ? error.code : 'generic';
      return {
        ok: false as const,
        code,
        message:
          code === 'invalid'
            ? t.administrativeSelection.invalid
            : code === 'archived'
              ? t.administrativeSelection.archived
              : code === 'stale'
                ? t.reportSelection.errors.stale
                : code === 'submission'
                  ? t.reportSelection.errors.submission
                  : code === 'missing'
                    ? t.reportSelection.errors.missing
                    : t.reportSelection.errors.generic,
      };
    }
  },
);
