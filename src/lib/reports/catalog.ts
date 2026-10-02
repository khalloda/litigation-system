import 'server-only';
import { t } from '@/strings';
import type { ReportDescriptor } from './types';

/** Navigation only. Call with the freshly authorized catalog, never the registry. */
export const REPORT_CATEGORIES = {
  clients: [
    'client-status',
    'client-matters',
    'client-branches',
    'client-branch-matters',
    'client-branch-finance',
    'client-evaluation',
    'client-branch-evaluation-finance',
    'client-active-contacts',
  ],
  matters: ['matter-hearing-history', 'matter-file-cover', 'matter-closed'],
  outcomes: [
    'client-judgments',
    'matter-judgments',
    'matter-lawyer-judgments',
    'matter-outcome-summary',
    'matter-judgments-by-lawyer',
  ],
  lawyers: [
    'lawyer-upcoming-hearings',
    'lawyer-principal-matters',
    'lawyer-supporting-matters',
    'lawyer-all-matters',
    'lawyer-current-position',
    'lawyer-new-matters',
  ],
  hearings: [
    'hearings-by-next-date',
    'hearing-decisions-by-date',
    'hearing-distribution-preliminary',
    'hearing-distribution-final',
    'team-hearings',
  ],
  administrative: [
    'administrative-by-destination',
    'administrative-all-destinations',
    'administrative-by-client',
    'open-decisions-by-destination',
    'open-decisions-all-destinations',
    'unnotified-decisions',
  ],
  documents: [
    'poa-inventory',
    'client-poas',
    'poa-movement-card',
    'document-inventory',
    'client-documents',
    'document-movement-card',
  ],
} as const;

export type CatalogLink = Readonly<{ title: string; href: string }>;
export type CatalogCategory = Readonly<{
  id: string;
  title: string;
  description: string;
  reports: readonly Readonly<CatalogLink & { id: string; description: string }>[];
  tools: readonly CatalogLink[];
}>;

export function categorizeReports(
  catalog: readonly ReportDescriptor[],
  client: number | null,
): CatalogCategory[] {
  const byId = new Map(catalog.map((d) => [d.id, d]));
  const categoryText = new Map(Object.entries(t.reportCatalog.categories));
  const suffix = client ? `?client=${client}` : '';
  const groups = Object.entries(REPORT_CATEGORIES).map(([key, ids]) => {
    const id = key as keyof typeof REPORT_CATEGORIES;
    const reports = ids.flatMap((reportId) => {
      const d = byId.get(reportId);
      return d
        ? [
            {
              id: d.id,
              title: d.title,
              description: d.description,
              href: `/reports/${d.id}${d.parameters.client ? suffix : ''}`,
            },
          ]
        : [];
    });
    const tools: CatalogLink[] = [];
    if (id === 'clients' && client && byId.has('client-status'))
      tools.push({ title: t.reportSelection.title, href: `/reports/selection${suffix}` });
    if (id === 'matters' && client && byId.has('matter-closed'))
      tools.push({ title: t.closedSelection.title, href: `/reports/closed-selection${suffix}` });
    if (id === 'lawyers' && byId.has('lawyer-principal-matters'))
      tools.push({ title: t.lawyerSelection.title, href: `/reports/lawyer-selection${suffix}` });
    if (id === 'administrative' && byId.has('administrative-by-destination'))
      tools.push({
        title: t.administrativeSelection.title,
        href: `/reports/administrative-selection${suffix}`,
      });
    return { id, ...categoryText.get(id)!, reports, tools };
  });
  // Fail closed on an unplaced new definition instead of silently losing its route.
  const placed = groups.flatMap((g) => g.reports.map((r) => r.id));
  if (placed.length !== catalog.length || new Set(placed).size !== catalog.length)
    throw new Error('Report catalog category coverage');
  return groups.filter((g) => g.reports.length > 0);
}
