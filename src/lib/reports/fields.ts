import { t } from '@/strings';
import type { ReportDescriptor, ReportOptions, ReportParameters } from './types';
export type ReferenceField = 'client' | 'branch' | 'lawyer' | 'matter';
export function referenceRule(descriptor: ReportDescriptor, key: ReferenceField) {
  return key === 'client'
    ? descriptor.parameters.client
    : key === 'branch'
      ? descriptor.parameters.branch
      : key === 'lawyer'
        ? descriptor.parameters.lawyer
        : descriptor.parameters.matter;
}
export function referenceChoice(parameters: ReportParameters, key: ReferenceField) {
  return key === 'client'
    ? parameters.client
    : key === 'branch'
      ? parameters.branch
      : key === 'lawyer'
        ? parameters.lawyer
        : (parameters.matter ?? { kind: 'all' as const });
}
export function referenceOptions(options: ReportOptions, key: ReferenceField) {
  return key === 'client'
    ? options.client
    : key === 'branch'
      ? options.branch
      : key === 'lawyer'
        ? options.lawyer
        : (options.matter ?? []);
}
export function reportFieldLabel(key: string) {
  return (
    Object.entries(t.reports.fields)
      .find(([name]) => name === key)
      ?.at(1) ?? t.reports.validation
  );
}
