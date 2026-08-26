import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';

type Json = Record<string, unknown>;
type SourceTrace = {
  src_file: string;
  src_row_num: number;
  src_extraction_sha256: string;
  source_payload: Json;
};
type InvoiceSource = SourceTrace & {
  invoice_no: string | null;
  contract_id: string | null;
  invoice_date: string | null;
  amount: string | null;
  amount_usd: string | null;
  currency: string | null;
  details: string | null;
  status: string | null;
  invoice_type: string | null;
  vat: string | null;
  report: string | null;
  receipt_amount: string | null;
  receipt_currency: string | null;
};
type PaymentSource = SourceTrace & {
  payment_id: string | null;
  invoice_no: string | null;
  payment_date: string | null;
  credit: string | null;
  debit: string | null;
  currency: string | null;
  details: string | null;
};
type AllocationSource = SourceTrace & {
  allocation_id: string | null;
  invoice_no: string | null;
  lawyer: string | null;
  percent: string | null;
  lawyer_as: string | null;
};
type ParsedDecimal = { text: string; units: bigint };
type Reason = [string, Record<string, unknown>];

export type BillingReconciliation = {
  defects: string[];
  invoiceSourceCount: number;
  invoiceTargetCount: number;
  invoiceQuarantineCount: number;
  paymentSourceCount: number;
  paymentTargetCount: number;
  paymentQuarantineCount: number;
  allocationSourceCount: number;
  allocationTargetCount: number;
  allocationQuarantineCount: number;
  allocationGroupCount: number;
  distinctAllocationPeople: number;
  referenceOnlyCount: number;
};

function parsedInteger(value: string | null): number | null {
  if (value === null || !/^[0-9]+$/u.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result <= 2_147_483_647 ? result : null;
}

function parsedDecimal(
  value: string | null,
  maximumIntegerDigits: number,
  scale: number,
): ParsedDecimal | null {
  if (value === null) return null;
  const match = /^([0-9]*)(?:\.([0-9]+))?$/u.exec(value);
  if (
    !match ||
    (match[1] === '' && match[2] === undefined) ||
    match[1]!.length > maximumIntegerDigits ||
    (match[2]?.length ?? 0) > scale
  )
    return null;
  const whole = match[1] === '' ? '0' : match[1]!;
  const fraction = (match[2] ?? '').padEnd(scale, '0');
  return {
    text: `${whole}.${fraction}`,
    units: BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction || '0'),
  };
}

function parsedDate(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) 00:00:00$/u.exec(value);
  if (!match) return null;
  const candidate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return candidate.getUTCFullYear() === Number(match[1]) &&
    candidate.getUTCMonth() === Number(match[2]) - 1 &&
    candidate.getUTCDate() === Number(match[3])
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

function parsedBoolean(value: string | null): boolean | null {
  return value === 'true' ? true : value === 'false' ? false : null;
}

function sourceIdentity(
  kind: 'invoice' | 'payment' | 'allocation',
  raw: string | null,
  parsed: number | null,
  occurrences: number,
  payload: Json,
): string {
  const identity =
    parsed !== null && occurrences === 1 ? raw! : `payload:${JSON.stringify(payload)}`;
  return `${createHash('sha256').update(`billing:${kind}:${identity}`, 'utf8').digest('hex')}:000001`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function compareRows(
  label: string,
  expected: readonly Record<string, unknown>[],
  actual: readonly Record<string, unknown>[],
): string | null {
  const expectedByKey = new Map(expected.map((row) => [String(row['source_key']), canonical(row)]));
  const actualByKey = new Map(actual.map((row) => [String(row['source_key']), canonical(row)]));
  const bad = [...new Set([...expectedByKey.keys(), ...actualByKey.keys()])]
    .filter((key) => expectedByKey.get(key) !== actualByKey.get(key))
    .sort();
  return bad.length === 0 ? null : `${label}: ${bad.length} (${bad.slice(0, 5).join(', ')})`;
}

function orderedReasons(reasons: Map<string, Record<string, unknown>>): Reason[] {
  return [...reasons].sort(([left], [right]) => left.localeCompare(right, 'en'));
}

function countBy<T>(
  rows: readonly T[],
  value: (row: T) => string | null,
): Map<string | null, number> {
  const result = new Map<string | null, number>();
  for (const row of rows) {
    const key = value(row);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

export async function reconcileBillingHistory(
  db: ClientBase,
  enforceApprovedLiveBaselines = true,
): Promise<BillingReconciliation> {
  const defects: string[] = [];
  const invoiceSource = await db.query<InvoiceSource>(`
    SELECT src_file,src_row_num,src_extraction_sha256,
           "Inv-No" invoice_no,"contractID" contract_id,"Inv-Date" invoice_date,
           "Amount" amount,"USD$" amount_usd,"Currency" currency,
           "Inv-Details" details,"Inv-Status" status,"Inv-Type" invoice_type,
           "VAT?" vat,report,"R-#" receipt_amount,"R-$" receipt_currency,
           jsonb_build_object(
             'Inv-No',"Inv-No",'contractID',"contractID",'Inv-Date',"Inv-Date",
             'Amount',"Amount",'USD$',"USD$",'Currency',"Currency",
             'Inv-Details',"Inv-Details",'Inv-Status',"Inv-Status",
             'Inv-Type',"Inv-Type",'VAT?',"VAT?",'report',report,
             'R-#',"R-#",'R-$',"R-$") source_payload
      FROM staging."الفواتير" ORDER BY "Inv-No" NULLS FIRST,src_record_key`);
  const paymentSource = await db.query<PaymentSource>(`
    SELECT src_file,src_row_num,src_extraction_sha256,"ID" payment_id,
           "رقم الفاتورة" invoice_no,"التاريخ" payment_date,"Credit" credit,
           "Debit" debit,"العملة" currency,"بيان السداد" details,
           jsonb_build_object('رقم الفاتورة',"رقم الفاتورة",'التاريخ',"التاريخ",
             'ID',"ID",'Credit',"Credit",'Debit',"Debit",'العملة',"العملة",
             'بيان السداد',"بيان السداد") source_payload
      FROM staging."السداد" ORDER BY "ID" NULLS FIRST,src_record_key`);
  const allocationSource = await db.query<AllocationSource>(`
    SELECT src_file,src_row_num,src_extraction_sha256,"ID" allocation_id,
           "InvNo" invoice_no,"Lawyer" lawyer,"Percent" percent,"LawyerAs" lawyer_as,
           jsonb_build_object('ID',"ID",'InvNo',"InvNo",'Lawyer',"Lawyer",
             'Percent',"Percent",'LawyerAs',"LawyerAs") source_payload
      FROM staging."تقسيم التحصيلات" ORDER BY "ID" NULLS FIRST,src_record_key`);

  const feeRows = await db.query<{ id: number; contract_id: number }>(
    'SELECT id,contract_id FROM fee_letters WHERE legacy_source_record_key IS NOT NULL ORDER BY id',
  );
  const lookupRows = await db.query<{ kind: string; id: number; code: string }>(`
    SELECT 'status' kind,id,code FROM lookup_invoice_status
    UNION ALL SELECT 'type',id,code FROM lookup_invoice_type
    UNION ALL SELECT 'role',id,code FROM lookup_lawyer_share_role ORDER BY kind,id`);
  const people = await db.query<{ id: number; name_en: string | null }>(
    'SELECT id,name_en FROM people ORDER BY id',
  );
  const personRules = await db.query<Record<string, unknown>>(
    `SELECT source_value,person_id,legacy_only,reviewed_by,reviewed_at::text,reviewer_note
       FROM migration_billing_person_crosswalk ORDER BY source_value`,
  );
  const currencyRules = await db.query<Record<string, unknown>>(
    `SELECT field_kind,source_value,target_value,require_zero_amount,reviewed_by,
            reviewed_at::text,reviewer_note
       FROM migration_billing_currency_rule ORDER BY field_kind,source_value`,
  );
  if (
    personRules.rows.length !== 1 ||
    personRules.rows[0]?.['source_value'] !== 'Ahmed Abdullah' ||
    personRules.rows[0]?.['person_id'] !== 25 ||
    personRules.rows[0]?.['legacy_only'] !== true ||
    personRules.rows[0]?.['reviewed_by'] !== 'Khaled Helmy' ||
    personRules.rows[0]?.['reviewed_at'] !== '2026-08-25' ||
    personRules.rows[0]?.['reviewer_note'] !==
      'Owner-reviewed Task 2.10A legacy-only English allocation name; preserve canonical Dr. Ahmed Abdullah / أحمد عبد الله and never infer through Arabic aliases.'
  )
    defects.push('reviewed billing person crosswalk changed');
  if (
    currencyRules.rows.length !== 2 ||
    currencyRules.rows[0]?.['field_kind'] !== 'receipt_currency' ||
    currencyRules.rows[0]?.['source_value'] !== '0' ||
    currencyRules.rows[0]?.['target_value'] !== null ||
    currencyRules.rows[0]?.['require_zero_amount'] !== true ||
    currencyRules.rows[0]?.['reviewed_by'] !== 'Khaled Helmy' ||
    currencyRules.rows[0]?.['reviewed_at'] !== '2026-08-25' ||
    currencyRules.rows[0]?.['reviewer_note'] !==
      'Raw receipt currency 0 becomes NULL only when the receipt amount is zero; non-zero must fail safely.' ||
    currencyRules.rows[1]?.['field_kind'] !== 'transaction_currency' ||
    currencyRules.rows[1]?.['source_value'] !== ' USD' ||
    currencyRules.rows[1]?.['target_value'] !== 'USD' ||
    currencyRules.rows[1]?.['require_zero_amount'] !== false ||
    currencyRules.rows[1]?.['reviewed_by'] !== 'Khaled Helmy' ||
    currencyRules.rows[1]?.['reviewed_at'] !== '2026-08-25' ||
    currencyRules.rows[1]?.['reviewer_note'] !==
      'Exact leading-space normalization for invoice 21352 and its two payments; never trim or case-fold another value.'
  )
    defects.push('reviewed billing currency rules changed');

  const fees = new Map<string, number[]>();
  for (const row of feeRows.rows)
    fees.set(String(row.contract_id), [...(fees.get(String(row.contract_id)) ?? []), row.id]);
  const lookups = new Map<string, number[]>();
  for (const row of lookupRows.rows)
    lookups.set(`${row.kind}:${row.code}`, [
      ...(lookups.get(`${row.kind}:${row.code}`) ?? []),
      row.id,
    ]);
  const peopleByName = new Map<string, number[]>();
  for (const row of people.rows)
    if (row.name_en !== null)
      peopleByName.set(row.name_en, [...(peopleByName.get(row.name_en) ?? []), row.id]);

  const invoiceCounts = countBy(invoiceSource.rows, (row) => row.invoice_no);
  const expectedInvoices: Record<string, unknown>[] = [];
  const expectedInvoiceQ: Record<string, unknown>[] = [];
  const safeInvoiceKey = new Map<string, string>();
  const usedInvoiceKeys = new Set<string>();
  for (const row of invoiceSource.rows) {
    const id = parsedInteger(row.invoice_no);
    const occurrences = invoiceCounts.get(row.invoice_no) ?? 0;
    const sourceKey = sourceIdentity(
      'invoice',
      row.invoice_no,
      id,
      occurrences,
      row.source_payload,
    );
    if (usedInvoiceKeys.has(sourceKey))
      defects.push(`invoice source identity collision: ${sourceKey}`);
    usedInvoiceKeys.add(sourceKey);
    const reasons = new Map<string, Record<string, unknown>>();
    if (id === null) reasons.set('invalid_invoice_number', { value: row.invoice_no });
    if (occurrences !== 1)
      reasons.set('duplicate_invoice_number', { value: row.invoice_no, occurrences });
    const feeMatches = row.contract_id === null ? [] : (fees.get(row.contract_id) ?? []);
    if (feeMatches.length === 0)
      reasons.set('unresolved_fee_letter', { contractID: row.contract_id });
    else if (feeMatches.length > 1)
      reasons.set('ambiguous_fee_letter', {
        contractID: row.contract_id,
        fee_letter_ids: feeMatches,
      });
    const invoiceDate = parsedDate(row.invoice_date);
    if (invoiceDate === null) reasons.set('invalid_invoice_date', { value: row.invoice_date });
    const amount = parsedDecimal(row.amount, 12, 2);
    if (amount === null) reasons.set('invalid_invoice_amount', { value: row.amount });
    const amountUsd = row.amount_usd === null ? null : parsedDecimal(row.amount_usd, 12, 2);
    if (row.amount_usd !== null && amountUsd === null)
      reasons.set('invalid_invoice_usd_amount', { value: row.amount_usd });
    const receiptAmount =
      row.receipt_amount === null ? null : parsedDecimal(row.receipt_amount, 12, 2);
    if (row.receipt_amount !== null && receiptAmount === null)
      reasons.set('invalid_receipt_amount', { value: row.receipt_amount });
    let currency: string | null = null;
    if (row.currency === 'EGP' || row.currency === 'USD') currency = row.currency;
    else if (row.currency === ' USD') currency = 'USD';
    else reasons.set('unsupported_invoice_currency', { value: row.currency });
    const status = row.status === null ? [] : (lookups.get(`status:${row.status}`) ?? []);
    if (status.length !== 1) reasons.set('unsupported_invoice_status', { value: row.status });
    const type = row.invoice_type === null ? [] : (lookups.get(`type:${row.invoice_type}`) ?? []);
    if (row.invoice_type !== null && type.length !== 1)
      reasons.set('unsupported_invoice_type', { value: row.invoice_type });
    const vat = parsedBoolean(row.vat);
    if (vat === null) reasons.set('invalid_vat_boolean', { value: row.vat });
    const report = parsedBoolean(row.report);
    if (report === null) reasons.set('invalid_report_boolean', { value: row.report });
    let receiptCurrency: string | null = null;
    if (row.receipt_currency === null) {
      if (receiptAmount !== null && receiptAmount.units !== 0n)
        reasons.set('receipt_amount_without_currency', { amount: row.receipt_amount });
    } else if (row.receipt_currency === 'EGP') {
      receiptCurrency = 'EGP';
      if (receiptAmount === null)
        reasons.set('receipt_currency_without_amount', { currency: row.receipt_currency });
    } else if (row.receipt_currency === '0') {
      if (receiptAmount === null || receiptAmount.units !== 0n)
        reasons.set('zero_receipt_currency_with_nonzero_amount', {
          currency: row.receipt_currency,
          amount: row.receipt_amount,
        });
    } else reasons.set('unsupported_receipt_currency', { value: row.receipt_currency });

    if (
      reasons.size > 0 ||
      id === null ||
      feeMatches.length !== 1 ||
      invoiceDate === null ||
      amount === null ||
      currency === null ||
      status.length !== 1 ||
      vat === null ||
      report === null
    ) {
      const ordered = orderedReasons(reasons);
      expectedInvoiceQ.push({
        source_key: sourceKey,
        extraction_sha256: row.src_extraction_sha256,
        src_file: row.src_file,
        src_row_num: row.src_row_num,
        legacy_invoice_no_raw: row.invoice_no,
        reason_codes: ordered.map(([code]) => code),
        reason_details: ordered.map(([, detail]) => detail),
        source_payload: row.source_payload,
      });
      continue;
    }
    safeInvoiceKey.set(row.invoice_no!, sourceKey);
    expectedInvoices.push({
      source_key: sourceKey,
      extraction_sha256: row.src_extraction_sha256,
      legacy_id: id,
      invoice_no: row.invoice_no,
      fee_letter_id: feeMatches[0],
      legacy_contract_id: row.contract_id,
      invoice_date: invoiceDate,
      amount: amount.text,
      amount_usd: amountUsd?.text ?? null,
      currency,
      legacy_currency_raw: row.currency,
      details: row.details,
      status_id: status[0],
      legacy_status_raw: row.status,
      type_id: type[0] ?? null,
      legacy_type_raw: row.invoice_type,
      vat,
      report,
      receipt_amount: receiptAmount?.text ?? null,
      receipt_currency: receiptCurrency,
      legacy_receipt_currency_raw: row.receipt_currency,
      source_payload: row.source_payload,
    });
  }

  const paymentCounts = countBy(paymentSource.rows, (row) => row.payment_id);
  const expectedPayments: Record<string, unknown>[] = [];
  const expectedPaymentQ: Record<string, unknown>[] = [];
  const usedPaymentKeys = new Set<string>();
  for (const row of paymentSource.rows) {
    const id = parsedInteger(row.payment_id);
    const occurrences = paymentCounts.get(row.payment_id) ?? 0;
    const sourceKey = sourceIdentity(
      'payment',
      row.payment_id,
      id,
      occurrences,
      row.source_payload,
    );
    if (usedPaymentKeys.has(sourceKey))
      defects.push(`payment source identity collision: ${sourceKey}`);
    usedPaymentKeys.add(sourceKey);
    const reasons = new Map<string, Record<string, unknown>>();
    if (id === null) reasons.set('invalid_payment_id', { value: row.payment_id });
    if (occurrences !== 1)
      reasons.set('duplicate_payment_id', { value: row.payment_id, occurrences });
    const invoiceKey = row.invoice_no === null ? undefined : safeInvoiceKey.get(row.invoice_no);
    if (!invoiceKey) reasons.set('unresolved_invoice_reference', { invoice_no: row.invoice_no });
    const paymentDate = parsedDate(row.payment_date);
    if (row.payment_date !== null && paymentDate === null)
      reasons.set('invalid_payment_date', { value: row.payment_date });
    const credit = row.credit === null ? null : parsedDecimal(row.credit, 12, 2);
    const debit = row.debit === null ? null : parsedDecimal(row.debit, 12, 2);
    if (row.credit !== null && credit === null)
      reasons.set('invalid_payment_credit', { value: row.credit });
    if (row.debit !== null && debit === null)
      reasons.set('invalid_payment_debit', { value: row.debit });
    if (row.credit === null && row.debit === null)
      reasons.set('missing_payment_amounts', { credit: null, debit: null });
    let currency: string | null = null;
    if (row.currency === null) {
      if ((credit?.units ?? 0n) !== 0n || (debit?.units ?? 0n) !== 0n)
        reasons.set('nonzero_payment_without_currency', { credit: row.credit, debit: row.debit });
    } else if (row.currency === 'EGP' || row.currency === 'USD') currency = row.currency;
    else if (row.currency === ' USD') currency = 'USD';
    else reasons.set('unsupported_payment_currency', { value: row.currency });
    if (
      reasons.size > 0 ||
      id === null ||
      !invoiceKey ||
      (row.payment_date !== null && paymentDate === null) ||
      (row.credit !== null && credit === null) ||
      (row.debit !== null && debit === null)
    ) {
      const ordered = orderedReasons(reasons);
      expectedPaymentQ.push({
        source_key: sourceKey,
        extraction_sha256: row.src_extraction_sha256,
        src_file: row.src_file,
        src_row_num: row.src_row_num,
        legacy_payment_id_raw: row.payment_id,
        legacy_invoice_no_raw: row.invoice_no,
        reason_codes: ordered.map(([code]) => code),
        reason_details: ordered.map(([, detail]) => detail),
        source_payload: row.source_payload,
      });
      continue;
    }
    expectedPayments.push({
      source_key: sourceKey,
      extraction_sha256: row.src_extraction_sha256,
      legacy_id: id,
      invoice_source_key: invoiceKey,
      legacy_invoice_no: row.invoice_no,
      payment_date: paymentDate,
      credit: credit?.text ?? null,
      debit: debit?.text ?? null,
      currency,
      legacy_currency_raw: row.currency,
      details: row.details,
      source_payload: row.source_payload,
    });
  }

  type AllocationDraft = {
    row: AllocationSource;
    key: string;
    id: number | null;
    invoiceKey?: string;
    personId?: number;
    roleId?: number;
    share: ParsedDecimal | null;
    reasons: Map<string, Record<string, unknown>>;
  };
  const allocationCounts = countBy(allocationSource.rows, (row) => row.allocation_id);
  const drafts: AllocationDraft[] = [];
  const usedAllocationKeys = new Set<string>();
  for (const row of allocationSource.rows) {
    const id = parsedInteger(row.allocation_id);
    const occurrences = allocationCounts.get(row.allocation_id) ?? 0;
    const key = sourceIdentity(
      'allocation',
      row.allocation_id,
      id,
      occurrences,
      row.source_payload,
    );
    if (usedAllocationKeys.has(key)) defects.push(`allocation source identity collision: ${key}`);
    usedAllocationKeys.add(key);
    const reasons = new Map<string, Record<string, unknown>>();
    if (id === null) reasons.set('invalid_allocation_id', { value: row.allocation_id });
    if (occurrences !== 1)
      reasons.set('duplicate_allocation_id', { value: row.allocation_id, occurrences });
    const invoiceKey = row.invoice_no === null ? undefined : safeInvoiceKey.get(row.invoice_no);
    if (!invoiceKey) reasons.set('unresolved_invoice_reference', { invoice_no: row.invoice_no });
    let personId: number | undefined;
    if (row.lawyer === 'Ahmed Abdullah') personId = 25;
    else {
      const matches = row.lawyer === null ? [] : (peopleByName.get(row.lawyer) ?? []);
      if (matches.length === 1) personId = matches[0];
      else if (matches.length > 1)
        reasons.set('ambiguous_english_person', { name: row.lawyer, person_ids: matches });
      else reasons.set('unresolved_english_person', { name: row.lawyer });
    }
    const roleMatches = row.lawyer_as === null ? [] : (lookups.get(`role:${row.lawyer_as}`) ?? []);
    if (roleMatches.length !== 1)
      reasons.set('unsupported_allocation_role', { value: row.lawyer_as });
    const share = parsedDecimal(row.percent, 1, 5);
    if (share === null || share.units < 0n || share.units > 100_000n)
      reasons.set('invalid_allocation_share', { value: row.percent });
    drafts.push({
      row,
      key,
      id,
      invoiceKey,
      personId,
      roleId: roleMatches[0],
      share,
      reasons,
    });
  }
  const natural = new Map<string, AllocationDraft[]>();
  for (const draft of drafts)
    if (draft.invoiceKey && draft.personId !== undefined && draft.roleId !== undefined) {
      const key = `${draft.invoiceKey}:${draft.personId}:${draft.roleId}`;
      natural.set(key, [...(natural.get(key) ?? []), draft]);
    }
  for (const rows of natural.values())
    if (rows.length > 1)
      for (const row of rows)
        row.reasons.set('duplicate_allocation', {
          invoice_no: row.row.invoice_no,
          person_id: row.personId,
          lawyer_role_id: row.roleId,
          legacy_ids: rows.map((item) => item.row.allocation_id).sort(),
        });
  const allocationGroups = new Map<string | null, AllocationDraft[]>();
  for (const draft of drafts)
    allocationGroups.set(draft.row.invoice_no, [
      ...(allocationGroups.get(draft.row.invoice_no) ?? []),
      draft,
    ]);
  for (const [invoiceNo, rows] of allocationGroups) {
    const unsafe = rows.filter((row) => row.reasons.size > 0);
    const units = rows.reduce((sum, row) => sum + (row.share?.units ?? 0n), 0n);
    if (unsafe.length > 0)
      for (const row of rows)
        row.reasons.set('unsafe_allocation_group', {
          invoice_no: invoiceNo,
          unsafe_legacy_ids: unsafe.map((item) => item.row.allocation_id).sort(),
        });
    if (rows.some((row) => row.share === null) || units !== 100_000n)
      for (const row of rows)
        row.reasons.set('invalid_allocation_total', {
          invoice_no: invoiceNo,
          total: `${units / 100_000n}.${String(units % 100_000n).padStart(5, '0')}`,
        });
  }
  const expectedAllocations: Record<string, unknown>[] = [];
  const expectedAllocationQ: Record<string, unknown>[] = [];
  for (const draft of drafts) {
    const row = draft.row;
    if (
      draft.reasons.size > 0 ||
      draft.id === null ||
      !draft.invoiceKey ||
      draft.personId === undefined ||
      draft.roleId === undefined ||
      draft.share === null
    ) {
      const ordered = orderedReasons(draft.reasons);
      expectedAllocationQ.push({
        source_key: draft.key,
        extraction_sha256: row.src_extraction_sha256,
        src_file: row.src_file,
        src_row_num: row.src_row_num,
        legacy_allocation_id_raw: row.allocation_id,
        legacy_invoice_no_raw: row.invoice_no,
        reason_codes: ordered.map(([code]) => code),
        reason_details: ordered.map(([, detail]) => detail),
        source_payload: row.source_payload,
      });
      continue;
    }
    expectedAllocations.push({
      source_key: draft.key,
      extraction_sha256: row.src_extraction_sha256,
      legacy_id: draft.id,
      invoice_source_key: draft.invoiceKey,
      legacy_invoice_no: row.invoice_no,
      person_id: draft.personId,
      legacy_lawyer_raw: row.lawyer,
      share: draft.share.text,
      legacy_percent_raw: row.percent,
      lawyer_role_id: draft.roleId,
      legacy_lawyer_as_raw: row.lawyer_as,
      source_payload: row.source_payload,
    });
  }

  const actualInvoices = await db.query<Record<string, unknown>>(`
    SELECT legacy_source_record_key source_key,
           legacy_source_extraction_sha256 extraction_sha256,legacy_id,invoice_no,
           fee_letter_id,legacy_contract_id,invoice_date::text invoice_date,
           amount::text amount,amount_usd::text amount_usd,currency,
           legacy_currency_raw,details,status_id,legacy_status_raw,type_id,
           legacy_type_raw,vat,report,receipt_amount::text receipt_amount,
           receipt_currency,legacy_receipt_currency_raw,
           legacy_source_payload source_payload
      FROM invoices WHERE legacy_source_record_key IS NOT NULL ORDER BY source_key`);
  const actualInvoiceQ = await db.query<Record<string, unknown>>(`
    SELECT src_record_key source_key,extraction_sha256,src_file,src_row_num,
           legacy_invoice_no_raw,reason_codes,reason_details,source_payload
      FROM quarantine.invoice_transform ORDER BY source_key`);
  const actualPayments = await db.query<Record<string, unknown>>(`
    SELECT p.legacy_source_record_key source_key,
           p.legacy_source_extraction_sha256 extraction_sha256,p.legacy_id,
           i.legacy_source_record_key invoice_source_key,p.legacy_invoice_no,
           p.payment_date::text payment_date,p.credit::text credit,p.debit::text debit,
           p.currency,p.legacy_currency_raw,p.details,p.legacy_source_payload source_payload
      FROM payments p JOIN invoices i ON i.id=p.invoice_id
     WHERE p.legacy_source_record_key IS NOT NULL ORDER BY source_key`);
  const actualPaymentQ = await db.query<Record<string, unknown>>(`
    SELECT src_record_key source_key,extraction_sha256,src_file,src_row_num,
           legacy_payment_id_raw,legacy_invoice_no_raw,reason_codes,reason_details,source_payload
      FROM quarantine.payment_transform ORDER BY source_key`);
  const actualAllocations = await db.query<Record<string, unknown>>(`
    SELECT a.legacy_source_record_key source_key,
           a.legacy_source_extraction_sha256 extraction_sha256,a.legacy_id,
           i.legacy_source_record_key invoice_source_key,a.legacy_invoice_no,a.person_id,
           a.legacy_lawyer_raw,a.share::text share,a.legacy_percent_raw,
           a.lawyer_role_id,a.legacy_lawyer_as_raw,a.legacy_source_payload source_payload
      FROM invoice_allocations a JOIN invoices i ON i.id=a.invoice_id
     WHERE a.legacy_source_record_key IS NOT NULL ORDER BY source_key`);
  const actualAllocationQ = await db.query<Record<string, unknown>>(`
    SELECT src_record_key source_key,extraction_sha256,src_file,src_row_num,
           legacy_allocation_id_raw,legacy_invoice_no_raw,reason_codes,reason_details,source_payload
      FROM quarantine.invoice_allocation_transform ORDER BY source_key`);
  for (const result of [
    compareRows('invoice target/source mismatch', expectedInvoices, actualInvoices.rows),
    compareRows('invoice quarantine/source mismatch', expectedInvoiceQ, actualInvoiceQ.rows),
    compareRows('payment target/source mismatch', expectedPayments, actualPayments.rows),
    compareRows('payment quarantine/source mismatch', expectedPaymentQ, actualPaymentQ.rows),
    compareRows('allocation target/source mismatch', expectedAllocations, actualAllocations.rows),
    compareRows(
      'allocation quarantine/source mismatch',
      expectedAllocationQ,
      actualAllocationQ.rows,
    ),
  ])
    if (result) defects.push(result);

  const structural = await db.query<{
    partial: number;
    pay_date_columns: number;
    reference_only: number;
  }>(`
    SELECT
      (SELECT count(*)::int FROM invoices WHERE
         legacy_source_record_key IS NULL AND
         (legacy_id IS NOT NULL OR legacy_contract_id IS NOT NULL OR
          legacy_currency_raw IS NOT NULL OR legacy_status_raw IS NOT NULL OR
          legacy_type_raw IS NOT NULL OR legacy_receipt_currency_raw IS NOT NULL OR
          legacy_source_extraction_sha256 IS NOT NULL OR legacy_source_payload IS NOT NULL))+
      (SELECT count(*)::int FROM payments WHERE
         legacy_source_record_key IS NULL AND
         (legacy_id IS NOT NULL OR legacy_invoice_no IS NOT NULL OR
          legacy_currency_raw IS NOT NULL OR legacy_source_extraction_sha256 IS NOT NULL OR
          legacy_source_payload IS NOT NULL))+
      (SELECT count(*)::int FROM invoice_allocations WHERE
         legacy_source_record_key IS NULL AND
         (legacy_id IS NOT NULL OR legacy_invoice_no IS NOT NULL OR
          legacy_lawyer_raw IS NOT NULL OR legacy_percent_raw IS NOT NULL OR
          legacy_lawyer_as_raw IS NOT NULL OR
          legacy_source_extraction_sha256 IS NOT NULL OR
          legacy_source_payload IS NOT NULL)) partial,
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema IN ('public','quarantine')
          AND lower(replace(column_name,'_',''))='paydate') pay_date_columns,
      (SELECT count(*)::int FROM staging."LawyerShare4Invoices") reference_only`);
  const state = structural.rows[0]!;
  if (state.partial !== 0) defects.push(`partial billing provenance: ${state.partial}`);
  if (state.pay_date_columns !== 0)
    defects.push(`D4 Pay-Date target/audit column exists: ${state.pay_date_columns}`);
  if (state.reference_only !== 0)
    defects.push(`LawyerShare4Invoices is no longer empty: ${state.reference_only}`);

  if (enforceApprovedLiveBaselines) {
    const approved = (
      await db.query<{
        ahmed_source_rows: number;
        ahmed_source_groups: number;
        ahmed_target_rows: number;
        ahmed_target_groups: number;
        ahmed_wrong_people: number;
        reviewed_person_identity: number;
        invoice_21819_source: string[];
        invoice_21819_raw: string[];
        invoice_21819_interpreted: string[];
        invoice_21819_total: string;
        null_type_source: string[];
        null_type_target: string[];
        invoice_21772_source_payments: number;
        invoice_21772_target_payments: number;
        zero_receipt_source: string[];
        zero_receipt_target: string[];
        leading_usd_invoice_source: string[];
        leading_usd_invoice_target: string[];
        leading_usd_payment_source: number;
        leading_usd_payment_target: number;
      }>(`
      SELECT
        (SELECT count(*)::int FROM staging."تقسيم التحصيلات"
          WHERE "Lawyer"='Ahmed Abdullah') ahmed_source_rows,
        (SELECT count(DISTINCT "InvNo")::int FROM staging."تقسيم التحصيلات"
          WHERE "Lawyer"='Ahmed Abdullah') ahmed_source_groups,
        (SELECT count(*)::int FROM invoice_allocations
          WHERE legacy_lawyer_raw='Ahmed Abdullah' AND legacy_source_record_key IS NOT NULL)
          ahmed_target_rows,
        (SELECT count(DISTINCT legacy_invoice_no)::int FROM invoice_allocations
          WHERE legacy_lawyer_raw='Ahmed Abdullah' AND legacy_source_record_key IS NOT NULL)
          ahmed_target_groups,
        (SELECT count(*)::int FROM invoice_allocations
          WHERE legacy_lawyer_raw='Ahmed Abdullah' AND legacy_source_record_key IS NOT NULL
            AND person_id<>25) ahmed_wrong_people,
        (SELECT count(*)::int FROM people
          WHERE id=25 AND name_en='Dr. Ahmed Abdullah' AND name_ar='أحمد عبد الله')
          reviewed_person_identity,
        (SELECT array_agg("Percent" ORDER BY "ID"::int)
           FROM staging."تقسيم التحصيلات" WHERE "InvNo"='21819') invoice_21819_source,
        (SELECT array_agg(legacy_percent_raw ORDER BY legacy_id)
           FROM invoice_allocations WHERE legacy_invoice_no='21819'
             AND legacy_source_record_key IS NOT NULL) invoice_21819_raw,
        (SELECT array_agg(share::text ORDER BY legacy_id)
           FROM invoice_allocations WHERE legacy_invoice_no='21819'
             AND legacy_source_record_key IS NOT NULL) invoice_21819_interpreted,
        (SELECT coalesce(sum(share),0)::text FROM invoice_allocations
          WHERE legacy_invoice_no='21819' AND legacy_source_record_key IS NOT NULL)
          invoice_21819_total,
        (SELECT array_agg("Inv-No" ORDER BY "Inv-No") FROM staging."الفواتير"
          WHERE "Inv-Type" IS NULL) null_type_source,
        (SELECT array_agg(invoice_no ORDER BY invoice_no) FROM invoices
          WHERE legacy_type_raw IS NULL AND type_id IS NULL
            AND legacy_source_record_key IS NOT NULL) null_type_target,
        (SELECT count(*)::int FROM staging."السداد"
          WHERE "رقم الفاتورة"='21772') invoice_21772_source_payments,
        (SELECT count(*)::int FROM payments
          WHERE legacy_invoice_no='21772' AND invoice_id IS NOT NULL
            AND legacy_source_record_key IS NOT NULL) invoice_21772_target_payments,
        (SELECT array_agg("Inv-No" ORDER BY "Inv-No") FROM staging."الفواتير"
          WHERE "R-$"='0' AND "R-#"='0') zero_receipt_source,
        (SELECT array_agg(invoice_no ORDER BY invoice_no) FROM invoices
          WHERE legacy_receipt_currency_raw='0' AND receipt_amount=0
            AND receipt_currency IS NULL AND legacy_source_record_key IS NOT NULL)
          zero_receipt_target,
        (SELECT array_agg("Inv-No" ORDER BY "Inv-No") FROM staging."الفواتير"
          WHERE "Currency"=' USD') leading_usd_invoice_source,
        (SELECT array_agg(invoice_no ORDER BY invoice_no) FROM invoices
          WHERE legacy_currency_raw=' USD' AND currency='USD'
            AND legacy_source_record_key IS NOT NULL) leading_usd_invoice_target,
        (SELECT count(*)::int FROM staging."السداد"
          WHERE "العملة"=' USD') leading_usd_payment_source,
        (SELECT count(*)::int FROM payments
          WHERE legacy_currency_raw=' USD' AND currency='USD'
            AND legacy_source_record_key IS NOT NULL) leading_usd_payment_target`)
    ).rows[0]!;
    const sevenShares = ['0.060', '0.110', '0.100', '0.100', '0.240', '0.315', '0.075'];
    const sevenInterpreted = sevenShares.map((value) => `${value}00`);
    if (
      approved.ahmed_source_rows !== 11 ||
      approved.ahmed_source_groups !== 9 ||
      approved.ahmed_target_rows !== 11 ||
      approved.ahmed_target_groups !== 9 ||
      approved.ahmed_wrong_people !== 0 ||
      approved.reviewed_person_identity !== 1
    )
      defects.push(
        'Ahmed Abdullah reviewed crosswalk is not exactly 11 rows across nine groups to person 25',
      );
    if (
      canonical(approved.invoice_21819_source) !== canonical(sevenShares) ||
      canonical(approved.invoice_21819_raw) !== canonical(sevenShares) ||
      canonical(approved.invoice_21819_interpreted) !== canonical(sevenInterpreted) ||
      approved.invoice_21819_total !== '1.00000'
    )
      defects.push(
        'invoice 21819 does not preserve the seven approved shares totaling exactly one',
      );
    if (
      canonical(approved.null_type_source) !== canonical(['21269', '21772']) ||
      canonical(approved.null_type_target) !== canonical(['21269', '21772']) ||
      approved.invoice_21772_source_payments !== 1 ||
      approved.invoice_21772_target_payments !== 1
    )
      defects.push('the two reviewed NULL invoice types or invoice 21772 payment changed');
    if (
      canonical(approved.zero_receipt_source) !== canonical(['21225', '21226']) ||
      canonical(approved.zero_receipt_target) !== canonical(['21225', '21226'])
    )
      defects.push('the two reviewed zero receipt-currency interpretations changed');
    if (
      canonical(approved.leading_usd_invoice_source) !== canonical(['21352']) ||
      canonical(approved.leading_usd_invoice_target) !== canonical(['21352']) ||
      approved.leading_usd_payment_source !== 2 ||
      approved.leading_usd_payment_target !== 2
    )
      defects.push('the exact leading-space USD invoice/payment interpretation changed');
  }

  const actualGroups = new Set(
    actualAllocations.rows.map((row) => String(row['legacy_invoice_no'])),
  ).size;
  const actualPeople = new Set(actualAllocations.rows.map((row) => Number(row['person_id']))).size;
  return {
    defects,
    invoiceSourceCount: invoiceSource.rows.length,
    invoiceTargetCount: actualInvoices.rows.length,
    invoiceQuarantineCount: actualInvoiceQ.rows.length,
    paymentSourceCount: paymentSource.rows.length,
    paymentTargetCount: actualPayments.rows.length,
    paymentQuarantineCount: actualPaymentQ.rows.length,
    allocationSourceCount: allocationSource.rows.length,
    allocationTargetCount: actualAllocations.rows.length,
    allocationQuarantineCount: actualAllocationQ.rows.length,
    allocationGroupCount: actualGroups,
    distinctAllocationPeople: actualPeople,
    referenceOnlyCount: state.reference_only,
  };
}
