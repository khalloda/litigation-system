import type { Prisma } from '@/generated/prisma/client';
import type { PermissionRequest } from '@/lib/auth/authorization-core';
import type { LogoMetadata } from '@/lib/client-query';

/** These descriptors are code, never request payloads or stored user templates. */
export type ReportField = 'from' | 'to' | 'client' | 'branch' | 'lawyer';
export type Selection = { kind: 'all' } | { kind: 'unassigned' } | { kind: 'id'; id: number };
export type ReportParameters = Readonly<{
  from: string | null;
  to: string | null;
  client: Selection;
  branch: Selection;
  lawyer: Selection;
  extra: Readonly<Record<string, string>>;
}>;
export type ParameterRule = Readonly<{ required: boolean; unassigned?: boolean; help: string }>;
export type DateRule = Readonly<{
  required: boolean;
  allowOpen: boolean;
  fieldMeaning: string;
  source: 'date' | 'cairo-timestamp';
}>;
export type ReportOption = Readonly<{ id: number; label: string }>;
export type ReportOptions = Readonly<
  Record<'client' | 'branch' | 'lawyer', readonly ReportOption[]>
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
}>;
export type ReportLayout = 'grouped' | 'date-grouped' | 'flat' | 'card';
export type ReportDescriptor = Readonly<{
  id: string;
  version: string;
  title: string;
  description: string;
  date?: DateRule;
  parameters: Readonly<Partial<Record<'client' | 'branch' | 'lawyer', ParameterRule>>>;
  /** Narrow enum extension; no arbitrary filter/query language. */
  extra?: readonly Readonly<{
    key: string;
    label: string;
    required: boolean;
    choices: readonly Readonly<{ value: string; label: string }>[];
  }>[];
  columns: readonly ReportColumn[];
  layout: ReportLayout;
  clientFacing: boolean;
  manual?: Readonly<{ heading: string; labels: readonly string[]; lines: number }>;
  permissions: readonly PermissionRequest[];
}>;
export type ReportDefinition = Readonly<{
  descriptor: ReportDescriptor;
  /** Same read-only repeatable-read snapshot as parameter validation/labels. */
  query: (tx: Prisma.TransactionClient, parameters: ReportParameters) => Promise<ReportData>;
}>;
export type ReportResult = Readonly<{
  descriptor: ReportDescriptor;
  parameters: ReportParameters;
  filterLabels: readonly Readonly<{ label: string; value: string }>[];
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
  'invalid' | 'unknown' | 'too-large' | 'busy' | 'generation' | 'cancelled';
export class ReportError extends Error {
  constructor(
    readonly code: ReportErrorCode,
    readonly fields: readonly string[] = [],
  ) {
    super(code);
    this.name = 'ReportError';
  }
}
