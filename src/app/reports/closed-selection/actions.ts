'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { ReportSelectionError } from '@/lib/reports/selection';
import { saveClosedReportSelection } from '@/lib/reports/closed-selection';
import { t } from '@/strings';

export const saveClosedSelectionAction = withActionPermission(
  { area: 'matters', action: 'update' },
  async (session, value: unknown) => {
    try {
      const result = await saveClosedReportSelection(session, value, {
        auditMetadata: createServerActionAuditMetadata(
          await headers(),
          session.user.auditSessionId,
        ),
      });
      revalidatePath('/reports/closed-selection');
      return {
        ok: true as const,
        ...result,
        message: result.changed ? t.closedSelection.saved : t.reportSelection.unchanged,
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
