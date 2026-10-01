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
  return descriptor.parameters[key];
}
export function referenceChoice(parameters: ReportParameters, key: ReferenceField) {
  return parameters[key] ?? { kind: 'all' as const };
}
export function referenceOptions(options: ReportOptions, key: ReferenceField) {
  return options[key] ?? [];
}
export function reportFieldLabel(key: string) {
  return (
    Object.entries(t.reports.fields)
      .find(([name]) => name === key)
      ?.at(1) ?? t.reports.validation
  );
}
