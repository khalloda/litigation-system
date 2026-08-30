import {
  formatExactDecimal,
  gate4CodePoint,
  gate4Date,
  parseExactDecimal,
  type Gate4Dataset,
  type Gate4Row,
  type Gate4Scalar,
} from './gate4-contract';
import { extractionTable, type Gate4ExtractedRow, type Gate4Extraction } from './gate4-extraction';
import {
  GATE4_CLIENT_LEGACY_ID,
  GATE4_FROM_DATE,
  GATE4_LAWYER_PARAMETER,
  GATE4_REPORT_FIELDS,
  GATE4_TO_DATE,
  type Gate4CurrencyRule,
  type Gate4QuarantineKeys,
} from './gate4-report-contract';

export type { Gate4CurrencyRule, Gate4QuarantineKeys } from './gate4-report-contract';

export type Gate4SourceReports = Readonly<{
  datasets: readonly Gate4Dataset[];
  matterStatus: ReadonlyMap<string, number>;
  quarantinedMatterStatus: ReadonlyMap<string, number>;
  hearingYears: ReadonlyMap<string, number>;
  quarantinedHearingYears: ReadonlyMap<string, number>;
  invoiceTotals: ReadonlyMap<string, Readonly<{ rows: number; amount: string }>>;
  paymentTotals: ReadonlyMap<string, Readonly<{ rows: number; amount: string }>>;
}>;

function exact(row: Gate4ExtractedRow, field: string): Gate4Scalar {
  const value = row.values[field];
  if (value === undefined) throw new Error(`${field} is absent from ${row.sourceKey}`);
  return value;
}

function boolean(value: Gate4Scalar): Gate4Scalar {
  if (value === null) return null;
  if (value !== 'true' && value !== 'false') throw new Error(`invalid Access boolean: ${value}`);
  return value;
}

function decimal(value: Gate4Scalar, scale = 2): Gate4Scalar {
  const parsed = parseExactDecimal(value);
  if (parsed === null) return null;
  if (parsed.scale > scale) throw new Error(`decimal ${value} has more than ${scale} places`);
  return formatExactDecimal(parsed.units * 10n ** BigInt(scale - parsed.scale), scale);
}

function sorted(rows: readonly Gate4Row[]): Gate4Row[] {
  return [...rows].sort((left, right) => gate4CodePoint(left.identity, right.identity));
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

function dataset(
  name: string,
  fields: readonly string[],
  parameters: Readonly<Record<string, Gate4Scalar>>,
  rows: readonly Gate4Row[],
): Gate4Dataset {
  return { name, fields, parameters, rows: sorted(rows), ordering: ['identity'] };
}

function eligible(
  rows: readonly Gate4ExtractedRow[],
  quarantined: ReadonlySet<string>,
): Gate4ExtractedRow[] {
  return rows.filter((row) => !quarantined.has(row.sourceKey));
}

function inDateRange(value: Gate4Scalar): boolean {
  const date = gate4Date(value);
  return date !== null && date >= GATE4_FROM_DATE && date <= GATE4_TO_DATE;
}

function hearingYear(value: Gate4Scalar): string {
  if (value === null) return '<NULL>';
  try {
    return gate4Date(value)?.slice(0, 4) ?? '<NULL>';
  } catch {
    return '<INVALID DATE>';
  }
}

function addCount(map: Map<string, number>, key: Gate4Scalar): void {
  const label = key ?? '<NULL>';
  map.set(label, (map.get(label) ?? 0) + 1);
}

function applyCurrencyRule(
  raw: Gate4Scalar,
  fieldKind: string,
  amount: Gate4Scalar,
  rules: readonly Gate4CurrencyRule[],
): Gate4Scalar {
  if (raw === null) return null;
  const matching = rules.filter((rule) => rule.fieldKind === fieldKind && rule.sourceValue === raw);
  if (matching.length > 1) throw new Error(`${fieldKind}/${raw} has ${matching.length} rules`);
  const rule = matching[0];
  if (rule === undefined) return raw;
  if (!rule.requireZeroAmount) return rule.targetValue;
  const parsed = parseExactDecimal(amount);
  if (parsed === null || parsed.units !== 0n) return raw;
  return rule.targetValue;
}

function totals(
  rows: readonly Gate4Row[],
  currencyIndex: number,
  amountIndex: number,
): ReadonlyMap<string, Readonly<{ rows: number; amount: string }>> {
  const grouped = new Map<string, { rows: number; amounts: Gate4Scalar[] }>();
  for (const row of rows) {
    const key = row.values[currencyIndex] ?? '<NULL>';
    const entry = grouped.get(key) ?? { rows: 0, amounts: [] };
    entry.rows += 1;
    entry.amounts.push(row.values[amountIndex] ?? null);
    grouped.set(key, entry);
  }
  return new Map(
    [...grouped.entries()].map(([key, value]) => [
      key,
      { rows: value.rows, amount: sumScale2(value.amounts) },
    ]),
  );
}

function sumScale2(values: readonly Gate4Scalar[]): string {
  let units = 0n;
  for (const value of values) {
    const parsed = parseExactDecimal(value);
    if (parsed === null) continue;
    if (parsed.scale > 2) throw new Error(`decimal ${value} has more than two places`);
    units += parsed.units * 10n ** BigInt(2 - parsed.scale);
  }
  return formatExactDecimal(units, 2);
}

function billingIdentity(
  kind: 'invoice' | 'payment',
  raw: Gate4Scalar,
  occurrences: ReadonlyMap<Gate4Scalar, number>,
): string {
  if (raw === null || (occurrences.get(raw) ?? 0) !== 1)
    throw new Error(`${kind} Gate 4 identity is not a unique source value: ${String(raw)}`);
  const digest = createHash('sha256').update(`billing:${kind}:${raw}`, 'utf8').digest('hex');
  return `${digest}:000001`;
}

function occurrenceCounts(
  rows: readonly Gate4ExtractedRow[],
  field: string,
): ReadonlyMap<Gate4Scalar, number> {
  const counts = new Map<Gate4Scalar, number>();
  for (const row of rows) {
    const value = exact(row, field);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function buildGate4SourceReports(
  extraction: Gate4Extraction,
  quarantine: Gate4QuarantineKeys,
  currencyRules: readonly Gate4CurrencyRule[],
): Gate4SourceReports {
  const matters = extractionTable(extraction, 'الدعاوى').rows;
  const hearings = extractionTable(extraction, 'الجلسات').rows;
  const adminTasks = extractionTable(extraction, 'admin work table').rows;
  const invoices = extractionTable(extraction, 'الفواتير').rows;
  const payments = extractionTable(extraction, 'السداد').rows;

  const cleanMatters = eligible(matters, quarantine.matter);
  const cleanHearings = eligible(hearings, quarantine.hearing);
  const cleanAdminTasks = eligible(adminTasks, quarantine.adminTask);

  const clientRows: Gate4Row[] = cleanMatters
    .filter((row) => exact(row, 'clientID') === GATE4_CLIENT_LEGACY_ID)
    .map((row) => ({
      identity: row.sourceKey,
      values: [
        exact(row, 'matterID'),
        exact(row, 'matterAR'),
        exact(row, 'matterSubject'),
        exact(row, 'matterStatus'),
        exact(row, 'clientID'),
        exact(row, 'clientBranch'),
        exact(row, 'matterCategory'),
        exact(row, 'matterCourt'),
      ],
    }));

  const forAgainstRows: Gate4Row[] = cleanHearings
    .filter((row) => exact(row, 'صالح/ضد') !== null && inDateRange(exact(row, 'التاريخ')))
    .map((row) => ({
      identity: row.sourceKey,
      values: [
        exact(row, 'ID_hearings'),
        gate4Date(exact(row, 'التاريخ')),
        exact(row, 'matterID'),
        exact(row, 'صالح/ضد'),
        exact(row, 'القرار'),
      ],
    }));

  const lawyerRows: Gate4Row[] = cleanMatters
    .filter(
      (row) =>
        exact(row, 'matterStatus') === 'سارية' &&
        (exact(row, 'lawyerA') ?? '').includes(GATE4_LAWYER_PARAMETER),
    )
    .map((row) => ({
      identity: row.sourceKey,
      values: [
        exact(row, 'matterID'),
        exact(row, 'matterAR'),
        exact(row, 'matterStatus'),
        exact(row, 'lawyerA'),
      ],
    }));

  const hearingRows: Gate4Row[] = cleanHearings
    .filter((row) => inDateRange(exact(row, 'التاريخ')))
    .map((row) => ({
      identity: row.sourceKey,
      values: [
        exact(row, 'ID_hearings'),
        gate4Date(exact(row, 'التاريخ')),
        gate4Date(exact(row, 'nextHearing')),
        exact(row, 'matterID'),
        exact(row, 'القرار'),
        exact(row, 'lastDecision'),
        exact(row, 'صالح/ضد'),
        exact(row, 'الإجراء'),
        exact(row, 'المحكمة'),
        exact(row, 'الدائرة'),
        exact(row, 'الجهة'),
        exact(row, 'ملاحظات'),
        boolean(exact(row, 'إخطار العميل بالقرار')),
      ],
    }));

  const adminRows: Gate4Row[] = cleanAdminTasks.map((row) => ({
    identity: row.sourceKey,
    values: [
      exact(row, 'ID_Task'),
      exact(row, 'matterID'),
      exact(row, 'العمل المطلوب'),
      exact(row, 'القائم بالعمل'),
      gate4Date(exact(row, 'تاريخ الإنشاء')),
      gate4Date(exact(row, 'تاريخ التنفيذ')),
      exact(row, 'النتيجة'),
      exact(row, 'القرار السابق'),
      exact(row, 'آخر متابعة'),
      gate4Date(exact(row, 'آخر موعد')),
      exact(row, 'المحكمة'),
      exact(row, 'الدائرة'),
      exact(row, 'الجهة'),
      exact(row, 'الحالة'),
      exact(row, 'تنبيه'),
    ],
  }));

  const invoiceOccurrences = occurrenceCounts(invoices, 'Inv-No');
  const paymentOccurrences = occurrenceCounts(payments, 'ID');
  const invoiceRows: Gate4Row[] = invoices
    .map((row) => {
      const identity = billingIdentity('invoice', exact(row, 'Inv-No'), invoiceOccurrences);
      if (quarantine.invoice.has(identity)) return null;
      const amount = decimal(exact(row, 'Amount'));
      const receiptAmount = decimal(exact(row, 'R-#'));
      const currencyRaw = exact(row, 'Currency');
      return {
        identity: `invoice:${identity}`,
        values: [
          'invoice',
          exact(row, 'Inv-No'),
          exact(row, 'contractID'),
          gate4Date(exact(row, 'Inv-Date')),
          amount,
          decimal(exact(row, 'USD$')),
          applyCurrencyRule(currencyRaw, 'transaction_currency', amount, currencyRules),
          currencyRaw,
          exact(row, 'Inv-Details'),
          exact(row, 'Inv-Status'),
          exact(row, 'Inv-Type'),
          boolean(exact(row, 'VAT?')),
          boolean(exact(row, 'report')),
          receiptAmount,
          exact(row, 'R-$'),
        ],
      };
    })
    .filter(notNull);
  const paymentRows: Gate4Row[] = payments
    .map((row) => {
      const identity = billingIdentity('payment', exact(row, 'ID'), paymentOccurrences);
      if (quarantine.payment.has(identity)) return null;
      const credit = decimal(exact(row, 'Credit'));
      const currencyRaw = exact(row, 'العملة');
      return {
        identity: `payment:${identity}`,
        values: [
          'payment',
          exact(row, 'ID'),
          exact(row, 'رقم الفاتورة'),
          gate4Date(exact(row, 'التاريخ')),
          credit,
          decimal(exact(row, 'Debit')),
          applyCurrencyRule(currencyRaw, 'transaction_currency', credit, currencyRules),
          currencyRaw,
          exact(row, 'بيان السداد'),
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      };
    })
    .filter(notNull);

  const matterStatus = new Map<string, number>();
  const quarantinedMatterStatus = new Map<string, number>();
  for (const row of matters)
    addCount(
      quarantine.matter.has(row.sourceKey) ? quarantinedMatterStatus : matterStatus,
      exact(row, 'matterStatus'),
    );
  const hearingYears = new Map<string, number>();
  const quarantinedHearingYears = new Map<string, number>();
  for (const row of hearings) {
    const year = hearingYear(exact(row, 'التاريخ'));
    if (quarantine.hearing.has(row.sourceKey)) addCount(quarantinedHearingYears, year);
    else if (/^[0-9]{4}$/u.test(year)) addCount(hearingYears, year);
  }

  const financialRows = [...invoiceRows, ...paymentRows];
  return {
    datasets: [
      dataset(
        'client matters',
        GATE4_REPORT_FIELDS.clientMatters,
        { client_legacy_id: GATE4_CLIENT_LEGACY_ID },
        clientRows,
      ),
      dataset(
        'judgments for/against',
        GATE4_REPORT_FIELDS.forAgainst,
        { from: GATE4_FROM_DATE, to: GATE4_TO_DATE },
        forAgainstRows,
      ),
      dataset(
        'lawyer workload',
        GATE4_REPORT_FIELDS.lawyerWorkload,
        { lawyer: GATE4_LAWYER_PARAMETER, status: 'سارية', source_field: 'lawyerA' },
        lawyerRows,
      ),
      dataset(
        'hearings by date',
        GATE4_REPORT_FIELDS.hearingsByDate,
        { from: GATE4_FROM_DATE, to: GATE4_TO_DATE },
        hearingRows,
      ),
      dataset(
        'administrative works',
        GATE4_REPORT_FIELDS.adminWorks,
        { population: 'transformed legacy rows', business_date: 'task_created_date' },
        adminRows,
      ),
      dataset(
        'financial history',
        GATE4_REPORT_FIELDS.financial,
        { population: 'transformed legacy invoices and payments' },
        financialRows,
      ),
    ],
    matterStatus,
    quarantinedMatterStatus,
    hearingYears,
    quarantinedHearingYears,
    invoiceTotals: totals(invoiceRows, 6, 4),
    paymentTotals: totals(paymentRows, 6, 4),
  };
}
import { createHash } from 'node:crypto';
