import type { Prisma } from '@/generated/prisma/client';
import type { PermissionRequest } from '@/lib/auth/authorization-core';
import type { LogoMetadata } from '@/lib/client-query';

/** These descriptors are code, never request payloads or stored user templates. */
export type ReportReferenceField =
  'client' | 'branch' | 'lawyer' | 'matter' | 'team' | 'destination' | 'poa' | 'document';
export type ReportField = 'from' | 'to' | ReportReferenceField;
export type Selection = { kind: 'all' } | { kind: 'unassigned' } | { kind: 'id'; id: number };
export type ReportParameters = Readonly<{
  from: string | null;
  to: string | null;
  client: Selection;
  branch: Selection;
  lawyer: Selection;
  matter?: Selection;
  team?: Selection;
  destination?: Selection;
  poa?: Selection;
  document?: Selection;
  extra: Readonly<Record<string, string>>;
}>;
export type ParameterRule = Readonly<{ required: boolean; unassigned?: boolean; help: string }>;
export type DateRule = Readonly<{
  required: boolean;
  allowOpen: boolean;
  fieldMeaning: string;
  source: 'date' | 'cairo-timestamp';
}>;
/** Canonical pieces remain separate; presentation isolation never enters business values. */
export type ReportLabelPart = Readonly<{ label: string; value: string }>;
export type ReportOption = Readonly<{
  id: number;
  label: string;
  parts?: readonly ReportLabelPart[];
}>;
export type ReportOptions = Readonly<
  Record<'client' | 'branch' | 'lawyer', readonly ReportOption[]> & {
    matter?: readonly ReportOption[];
    team?: readonly ReportOption[];
    destination?: readonly ReportOption[];
    poa?: readonly ReportOption[];
    document?: readonly ReportOption[];
  }
>;
export type ReportCell =
  | Readonly<{ type: 'null' }>
  | Readonly<{ type: 'text' | 'identifier' | 'integer' | 'decimal' | 'date'; value: string }>
  | Readonly<{ type: 'boolean'; value: boolean }>;
export type ReportColumn = Readonly<{ key: string; label: string; width: number }>;
export type ReportRow = Readonly<{
  id: string;
  cells: readonly ReportCell[];
  /** Decided by the trusted adapter, never interpreted as a CSS/HTML fragment. */
  highlight?: 'attention';
}>;
export type ReportGroup = Readonly<{
  id: string;
  title: string;
  date?: string;
  rows: readonly ReportRow[];
}>;
export type ReportSection = Readonly<{ id: string; title: string; groups: readonly ReportGroup[] }>;
export type ReportData = Readonly<{
  subtitle: string;
  sections: readonly ReportSection[];
  totals: readonly Readonly<{ label: string; value: ReportCell }>[];
  clientBrand?: Readonly<{ name: string; logo: LogoMetadata | null }>;
  /** Ordered, typed record header values, bound to descriptor.details. */
  details?: readonly ReportCell[];
  /** Complete exact-outcome counts, independent of the detail preview budget. */
  outcomeCounts?: readonly Readonly<{ outcome: string; count: number }>[];
}>;
export type ReportLayout = 'grouped' | 'date-grouped' | 'flat' | 'card' | 'cover';
export type ReportDescriptor = Readonly<{
  id: string;
  version: string;
  title: string;
  description: string;
  date?: DateRule;
  parameters: Readonly<Partial<Record<ReportReferenceField, ParameterRule>>>;
  /** Narrow enum extension; no arbitrary filter/query language. */
  extra?: readonly Readonly<{
    key: string;
    label: string;
    required: boolean;
    defaultValue?: string;
    choices: readonly Readonly<{ value: string; label: string }>[];
  }>[];
  columns: readonly ReportColumn[];
  /** Trusted per-section layouts for a report with different row grains. */
  sectionColumns?: Readonly<Record<string, readonly ReportColumn[]>>;
  details?: readonly ReportColumn[];
  /** Trusted section IDs whose favourable/against integer columns are charted. */
  charts?: readonly string[];
  outcomeChart?: boolean;
  layout: ReportLayout;
  clientFacing: boolean;
  /** Trusted label for this definition's logical row grain. */
  countLabel?: string;
  manual?: Readonly<{ heading: string; labels: readonly string[]; lines: number }>;
  permissions: readonly PermissionRequest[];
}>;
export type ReportDefinition = Readonly<{
  descriptor: ReportDescriptor;
  /** Same read-only repeatable-read snapshot as parameter validation/labels. */
  query: (
    tx: Prisma.TransactionClient,
    parameters: ReportParameters,
    context?: Readonly<{ generatedAt: string }>,
  ) => Promise<ReportData>;
}>;
export type ReportResult = Readonly<{
  descriptor: ReportDescriptor;
  parameters: ReportParameters;
  filterLabels: readonly Readonly<{
    label: string;
    value: string;
    parts?: readonly ReportLabelPart[];
  }>[];
  data: ReportData;
  generatedAt: string;
  operationId: string;
  rowCount: number;
}>;
export type ReportFormat = 'preview' | 'xlsx' | 'pdf';
export const REPORT_LIMITS = Object.freeze({
  requestBytes: 8192,
  rows: 100000,
  columns: 32,
  cellUnits: 1000000,
  resultBytes: 64 * 1024 * 1024,
  artifactBytes: 64 * 1024 * 1024,
  previewRows: 50,
  concurrent: 2,
  milliseconds: 120000,
});
export type ReportErrorCode =
  | 'invalid'
  | 'unknown'
  | 'too-large'
  | 'busy'
  | 'generation'
  | 'cancelled'
  | 'selection-incomplete';
export class ReportError extends Error {
  constructor(
    readonly code: ReportErrorCode,
    readonly fields: readonly string[] = [],
  ) {
    super(code);
    this.name = 'ReportError';
  }
}
