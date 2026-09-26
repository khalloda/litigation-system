import { Prisma } from '@/generated/prisma/client';
import { referenceRule, referenceChoice, referenceOptions, reportFieldLabel } from './fields';
import { t } from '@/strings';
import {
  ReportError,
  type ReportDescriptor,
  type ReportOption,
  type ReportOptions,
  type ReportParameters,
} from './types';

/** Report reference universe deliberately includes archives, inactive and external people. */
export async function reportOptions(
  tx: Prisma.TransactionClient,
  descriptor: ReportDescriptor,
): Promise<ReportOptions> {
  const options: { client: ReportOption[]; branch: ReportOption[]; lawyer: ReportOption[] } = {
    client: [],
    branch: [],
    lawyer: [],
  };
  if (descriptor.parameters.client)
    options.client = await tx.$queryRaw<ReportOption[]>(
      Prisma.sql`SELECT id, name_ar AS label FROM public.clients ORDER BY name_ar COLLATE "C",id`,
    );
  if (descriptor.parameters.branch)
    options.branch = await tx.$queryRaw<ReportOption[]>(
      Prisma.sql`SELECT id, label_ar AS label FROM public.lookup_client_branch ORDER BY sort_order,id`,
    );
  if (descriptor.parameters.lawyer)
    options.lawyer = await tx.$queryRaw<ReportOption[]>(
      Prisma.sql`SELECT id, name_ar AS label FROM public.people ORDER BY name_ar COLLATE "C",id`,
    );
  const labelled = (rows: ReportOption[]) => {
    if (rows.length > 20000) throw new ReportError('too-large');
    return rows.map((x) => ({ id: x.id, label: `${x.label} [${x.id}]` }));
  };
  return {
    client: labelled(options.client),
    branch: labelled(options.branch),
    lawyer: labelled(options.lawyer),
  };
}
export function validateReportOptions(parameters: ReportParameters, options: ReportOptions) {
  for (const key of ['client', 'branch', 'lawyer'] as const) {
    const selected = referenceChoice(parameters, key);
    if (selected.kind === 'id' && !referenceOptions(options, key).some((x) => x.id === selected.id))
      throw new ReportError('invalid', [key]);
  }
}
export function reportFilterLabels(
  descriptor: ReportDescriptor,
  parameters: ReportParameters,
  options: ReportOptions,
) {
  const labels: { label: string; value: string }[] = [];
  if (descriptor.date) {
    labels.push({
      label: descriptor.date.fieldMeaning,
      value: `${parameters.from ?? t.reports.all} — ${parameters.to ?? t.reports.all}`,
    });
  }
  for (const key of ['client', 'branch', 'lawyer'] as const)
    if (referenceRule(descriptor, key)) {
      const selected = referenceChoice(parameters, key);
      labels.push({
        label: reportFieldLabel(key),
        value:
          selected.kind === 'all'
            ? t.reports.all
            : selected.kind === 'unassigned'
              ? t.reports.unassigned
              : referenceOptions(options, key).find((x) => x.id === selected.id)!.label,
      });
    }
  for (const extra of descriptor.extra ?? [])
    labels.push({
      label: extra.label,
      value:
        extra.choices.find(
          (x) =>
            x.value ===
            Object.entries(parameters.extra)
              .find(([key]) => key === extra.key)
              ?.at(1),
        )?.label ?? t.reports.all,
    });
  return labels;
}
