import { t } from '@/strings';
import type {
  ReportDescriptor,
  ReportOptions,
  ReportParameters,
  ReportReferenceField,
} from './types';
export type ReferenceField = ReportReferenceField;
export const REFERENCE_FIELDS = [
  'client',
  'branch',
  'lawyer',
  'matter',
  'team',
  'destination',
  'poa',
  'document',
] as const;
export function referenceRule(descriptor: ReportDescriptor, key: ReferenceField) {
  return Object.entries(descriptor.parameters).find(([name]) => name === key)?.[1];
}
export function referenceChoice(parameters: ReportParameters, key: ReferenceField) {
  // Explicit fields keep the reference contract distinct from dates and extras.
  switch (key) {
    case 'client':
      return parameters.client;
    case 'branch':
      return parameters.branch;
    case 'lawyer':
      return parameters.lawyer;
    case 'matter':
      return parameters.matter ?? { kind: 'all' as const };
    case 'team':
      return parameters.team ?? { kind: 'all' as const };
    case 'destination':
      return parameters.destination ?? { kind: 'all' as const };
    case 'poa':
      return parameters.poa ?? { kind: 'all' as const };
    case 'document':
      return parameters.document ?? { kind: 'all' as const };
  }
}
export function referenceOptions(options: ReportOptions, key: ReferenceField) {
  return Object.entries(options).find(([name]) => name === key)?.[1] ?? [];
}
export function reportFieldLabel(key: string) {
  return (
    Object.entries(t.reports.fields)
      .find(([name]) => name === key)
      ?.at(1) ?? t.reports.validation
  );
}
