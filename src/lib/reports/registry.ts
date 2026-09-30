import 'server-only';
import type { ReportDefinition } from './types';
import { activeClientContacts } from './client-contacts';
import { clientJudgments } from './client-judgments';
import { clientMatterReports } from './client-matter-reports';
import { matterJudgmentReports } from './matter-judgments';
import { matterRecordReports } from './matter-record';

/** The nine accepted client definitions retain their IDs and semantics.
 * New matter definitions follow the Task 6.3 source map; no test probes. */
export const reportDefinitions: readonly ReportDefinition[] = Object.freeze([
  activeClientContacts,
  ...clientMatterReports.slice(0, 6),
  clientJudgments,
  ...clientMatterReports.slice(6),
  ...matterJudgmentReports,
  ...matterRecordReports,
]);
