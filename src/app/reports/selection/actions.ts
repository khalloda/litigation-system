'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { ReportSelectionError, saveReportSelection } from '@/lib/reports/selection';
import { t } from '@/strings';

export const saveSelectionAction = withActionPermission(
  { area: 'matters', action: 'update' },
  async (session, value: unknown) => {
    try {
      const result = await saveReportSelection(session, value, {
        auditMetadata: createServerActionAuditMetadata(
          await headers(),
          session.user.auditSessionId,
        ),
      });
      revalidatePath('/reports/selection');
      return {
        ok: true as const,
        ...result,
        message: result.changed ? t.reportSelection.saved : t.reportSelection.unchanged,
      };
    } catch (error) {
      const code = error instanceof ReportSelectionError ? error.code : 'generic';
      return {
        ok: false as const,
        message:
          code === 'invalid'
            ? t.reportSelection.errors.invalid
            : code === 'stale'
              ? t.reportSelection.errors.stale
              : code === 'archived'
                ? t.reportSelection.errors.archived
                : code === 'submission'
                  ? t.reportSelection.errors.submission
                  : code === 'missing'
                    ? t.reportSelection.errors.missing
                    : t.reportSelection.errors.generic,
      };
    }
  },
);
