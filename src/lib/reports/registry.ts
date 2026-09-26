import 'server-only';
import type { ReportDefinition } from './types';
import { activeClientContacts } from './client-contacts';
import { clientJudgments } from './client-judgments';
import { clientMatterReports } from './client-matter-reports';

/** Nine production definitions; owner-adopted semantics are recorded in the
 * Task 6.2 semantics map. Test probes never enter this catalog. */
export const reportDefinitions: readonly ReportDefinition[] = Object.freeze([
  activeClientContacts,
  ...clientMatterReports.slice(0, 6),
  clientJudgments,
  ...clientMatterReports.slice(6),
]);
