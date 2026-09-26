import 'server-only';
import type { ReportDefinition } from './types';
import { activeClientContacts } from './client-contacts';
import { clientJudgments } from './client-judgments';

/** Production definitions only. Task 6.2 candidate; remaining source decisions
 * are recorded in task-6-2-report-semantics.md before completing the family. */
export const reportDefinitions: readonly ReportDefinition[] = Object.freeze([
  activeClientContacts,
  clientJudgments,
]);
