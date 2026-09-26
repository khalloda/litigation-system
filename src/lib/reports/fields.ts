import { t } from '@/strings';
import type { ReportDescriptor, ReportOptions, ReportParameters } from './types';
export type ReferenceField = 'client' | 'branch' | 'lawyer';
export function referenceRule(descriptor: ReportDescriptor, key: ReferenceField) {
  return key === 'client'
    ? descriptor.parameters.client
    : key === 'branch'
      ? descriptor.parameters.branch
      : descriptor.parameters.lawyer;
}
export function referenceChoice(parameters: ReportParameters, key: ReferenceField) {
  return key === 'client'
    ? parameters.client
    : key === 'branch'
      ? parameters.branch
      : parameters.lawyer;
}
export function referenceOptions(options: ReportOptions, key: ReferenceField) {
  return key === 'client' ? options.client : key === 'branch' ? options.branch : options.lawyer;
}
export function reportFieldLabel(key: string) {
  return (
    Object.entries(t.reports.fields)
      .find(([name]) => name === key)
      ?.at(1) ?? t.reports.validation
  );
}
