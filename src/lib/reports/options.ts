import { Prisma } from '@/generated/prisma/client';
import {
  referenceRule,
  referenceChoice,
  referenceOptions,
  reportFieldLabel,
  REFERENCE_FIELDS,
} from './fields';
import { t } from '@/strings';
import {
  ReportError,
  type ReportDescriptor,
  type ReportOption,
  type ReportOptions,
  type ReportParameters,
  type ReportResult,
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
  const matters = descriptor.parameters.matter
    ? await tx.$queryRaw<
        { id: number; caseNumber: string | null; client: string | null }[]
      >(Prisma.sql`
        SELECT m.id,m.case_number_ar AS "caseNumber",c.name_ar AS client
        FROM public.matters m LEFT JOIN public.clients c ON c.id=m.client_id ORDER BY m.id`)
    : undefined;
  const labelled = (rows: ReportOption[]) => {
    if (rows.length > 20000) throw new ReportError('too-large');
    return rows.map((x) => ({ id: x.id, label: `${x.label} [${x.id}]` }));
  };
  const teams = descriptor.parameters.team
    ? await tx.$queryRaw<ReportOption[]>(
        Prisma.sql`SELECT id,label_ar AS label FROM public.lookup_team ORDER BY id`,
      )
    : undefined;
  const destinations = descriptor.parameters.destination
    ? await tx.$queryRaw<ReportOption[]>(
        Prisma.sql`SELECT id,label_ar AS label FROM public.lookup_matter_destination ORDER BY label_ar COLLATE "C",id`,
      )
    : undefined;
  const poas = descriptor.parameters.poa
    ? await tx.$queryRaw<
        {
          id: number;
          number: string | null;
          letter: string | null;
          year: string | null;
          principal: string | null;
          client: string | null;
        }[]
      >(Prisma.sql`
        SELECT p.id,p.poa_number AS number,p.poa_letter AS letter,p.poa_year AS year,p.principal_name AS principal,c.name_ar AS client
        FROM public.powers_of_attorney p LEFT JOIN public.clients c ON c.id=p.client_id ORDER BY p.id`)
    : undefined;
  const documents = descriptor.parameters.document
    ? await tx.$queryRaw<
        { id: number; serial: number | null; description: string | null; client: string | null }[]
      >(Prisma.sql`
        SELECT d.id,d.legacy_id AS serial,d.description,c.name_ar AS client
        FROM public.documents d LEFT JOIN public.clients c ON c.id=d.client_id ORDER BY d.id`)
    : undefined;
  const separate = (id: number, parts: NonNullable<ReportOption['parts']>): ReportOption => ({
    id,
    parts: [...parts, { label: t.reports.recordId, value: String(id) }],
    label: parts.map((p) => p.value).join(' — ') + ` [${id}]`,
  });
  if ((poas?.length ?? 0) > 20000 || (documents?.length ?? 0) > 20000)
    throw new ReportError('too-large');
  return {
    client: labelled(options.client),
    branch: labelled(options.branch),
    lawyer: labelled(options.lawyer),
    ...(teams ? { team: labelled(teams) } : {}),
    ...(destinations ? { destination: labelled(destinations) } : {}),
    ...(poas
      ? {
          poa: poas.map((p) =>
            separate(p.id, [
              { label: t.poa.number, value: p.number ?? t.common.notRecorded },
              { label: t.poa.letter, value: p.letter ?? t.common.notRecorded },
              { label: t.poa.year, value: p.year ?? t.common.notRecorded },
              { label: t.poa.principal, value: p.principal ?? t.common.notRecorded },
              { label: t.fields.client, value: p.client ?? t.common.notRecorded },
            ]),
          ),
        }
      : {}),
    ...(documents
      ? {
          document: documents.map((d) =>
            separate(d.id, [
              {
                label: t.reports.sourceSerial,
                value: d.serial === null ? t.common.notRecorded : String(d.serial),
              },
              { label: t.reports.fields.document, value: d.description ?? t.common.notRecorded },
              { label: t.fields.client, value: d.client ?? t.common.notRecorded },
            ]),
          ),
        }
      : {}),
    ...(matters
      ? {
          matter: labelled(
            matters.map((m) => ({
              id: m.id,
              label: `${m.caseNumber ?? t.common.notRecorded} — ${m.client ?? t.common.notRecorded}`,
            })),
          ).map((option, index) => ({
            ...option,
            parts: [
              {
                label: t.fields.caseNumber,
                value: matters.at(index)!.caseNumber ?? t.common.notRecorded,
              },
              { label: t.fields.client, value: matters.at(index)!.client ?? t.common.notRecorded },
              { label: t.reports.recordId, value: String(option.id) },
            ],
          })),
        }
      : {}),
  };
}
export function validateReportOptions(parameters: ReportParameters, options: ReportOptions) {
  for (const key of REFERENCE_FIELDS) {
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
  const labels: ReportResult['filterLabels'][number][] = [];
  if (descriptor.date) {
    labels.push({
      label: descriptor.date.fieldMeaning,
      value: `${parameters.from ?? t.reports.all} — ${parameters.to ?? t.reports.all}`,
    });
  }
  for (const key of REFERENCE_FIELDS)
    if (referenceRule(descriptor, key)) {
      const selected = referenceChoice(parameters, key);
      const option =
        selected.kind === 'id'
          ? referenceOptions(options, key).find((x) => x.id === selected.id)!
          : undefined;
      labels.push({
        label: reportFieldLabel(key),
        value:
          selected.kind === 'all'
            ? t.reports.all
            : selected.kind === 'unassigned'
              ? t.reports.unassigned
              : option!.label,
        ...(option?.parts ? { parts: option.parts } : {}),
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
