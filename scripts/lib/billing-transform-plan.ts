import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';

type JsonObject = Record<string, unknown>;
type Detail = Record<string, unknown>;

type Trace = {
  src_file: string;
  src_row_num: number;
  src_extraction_sha256: string;
  source_payload: JsonObject;
};

type InvoiceSource = Trace & {
  invoice_no_raw: string | null;
  contract_id_raw: string | null;
  invoice_date_raw: string | null;
  amount_raw: string | null;
  amount_usd_raw: string | null;
  currency_raw: string | null;
  details_raw: string | null;
  status_raw: string | null;
  type_raw: string | null;
  vat_raw: string | null;
  report_raw: string | null;
  receipt_amount_raw: string | null;
  receipt_currency_raw: string | null;
};

type PaymentSource = Trace & {
  payment_id_raw: string | null;
  invoice_no_raw: string | null;
  payment_date_raw: string | null;
  credit_raw: string | null;
  debit_raw: string | null;
  currency_raw: string | null;
  details_raw: string | null;
};

type AllocationSource = Trace & {
  allocation_id_raw: string | null;
  invoice_no_raw: string | null;
  lawyer_raw: string | null;
  percent_raw: string | null;
  role_raw: string | null;
};

export type BillingQuarantine = {
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  reasonCodes: string[];
  reasonDetails: Detail[];
  sourcePayload: JsonObject;
  legacyInvoiceNoRaw?: string | null;
  legacyPaymentIdRaw?: string | null;
  legacyAllocationIdRaw?: string | null;
};

export type InvoiceTarget = {
  srcRecordKey: string;
  extractionSha256: string;
  legacyId: number;
  invoiceNo: string;
  feeLetterId: number;
  legacyContractId: string;
  invoiceDate: string;
  amount: string;
  amountUsd: string | null;
  currency: string;
  legacyCurrencyRaw: string;
  details: string | null;
  statusId: number;
  legacyStatusRaw: string;
  typeId: number | null;
  legacyTypeRaw: string | null;
  vat: boolean;
  report: boolean;
  receiptAmount: string | null;
  receiptCurrency: string | null;
  legacyReceiptCurrencyRaw: string | null;
  sourcePayload: JsonObject;
};

export type PaymentTarget = {
  srcRecordKey: string;
  extractionSha256: string;
  legacyId: number;
  invoiceSourceKey: string;
  legacyInvoiceNo: string;
  paymentDate: string | null;
  credit: string | null;
  debit: string | null;
  currency: string | null;
  legacyCurrencyRaw: string | null;
  details: string | null;
  sourcePayload: JsonObject;
};

export type AllocationTarget = {
  srcRecordKey: string;
  extractionSha256: string;
  legacyId: number;
  invoiceSourceKey: string;
  legacyInvoiceNo: string;
  personId: number;
  legacyLawyerRaw: string;
  share: string;
  legacyPercentRaw: string;
  lawyerRoleId: number;
  legacyLawyerAsRaw: string;
  sourcePayload: JsonObject;
};

export type BillingPlan = {
  invoiceSourceCount: number;
  paymentSourceCount: number;
  allocationSourceCount: number;
  referenceOnlyCount: number;
  invoices: InvoiceTarget[];
  invoiceQuarantine: BillingQuarantine[];
  payments: PaymentTarget[];
  paymentQuarantine: BillingQuarantine[];
  allocations: AllocationTarget[];
  allocationQuarantine: BillingQuarantine[];
};

type DecimalValue = { value: string; units: bigint };

function integer(value: string | null): number | null {
  if (value === null || !/^[0-9]+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

function decimal(value: string | null, integerDigits: number, scale: number): DecimalValue | null {
  if (value === null) return null;
  const match = value.match(/^([0-9]*)(?:\.([0-9]+))?$/u);
  if (
    !match ||
    (match[1] === '' && match[2] === undefined) ||
    match[1]!.length > integerDigits ||
    (match[2]?.length ?? 0) > scale
  )
    return null;
  const whole = match[1] === '' ? '0' : match[1]!;
  const fraction = (match[2] ?? '').padEnd(scale, '0');
  const units = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction || '0');
  return { value: `${whole}.${fraction}`, units };
}

function date(value: string | null): string | null {
  if (value === null) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) 00:00:00$/u);
  if (!match) return null;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() !== Number(match[2]) - 1 ||
    parsed.getUTCDate() !== Number(match[3])
  )
    return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function bool(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function key(kind: 'invoice' | 'payment' | 'allocation', identity: string): string {
  return `${createHash('sha256').update(`billing:${kind}:${identity}`, 'utf8').digest('hex')}:000001`;
}

function stableIdentity(
  kind: 'invoice' | 'payment' | 'allocation',
  rawId: string | null,
  id: number | null,
  count: number,
  payload: JsonObject,
): string {
  if (id !== null && count === 1) return key(kind, rawId!);
  return key(kind, `payload:${JSON.stringify(payload)}`);
}

function makeQuarantine(
  row: Trace,
  srcRecordKey: string,
  reasons: Map<string, Detail>,
): BillingQuarantine {
  const ordered = [...reasons].sort(([left], [right]) => left.localeCompare(right, 'en'));
  return {
    srcRecordKey,
    extractionSha256: row.src_extraction_sha256,
    srcFile: row.src_file,
    srcRowNum: row.src_row_num,
    reasonCodes: ordered.map(([code]) => code),
    reasonDetails: ordered.map(([, detail]) => detail),
    sourcePayload: row.source_payload,
  };
}

function add<T>(map: Map<T, number>, value: T): void {
  map.set(value, (map.get(value) ?? 0) + 1);
}

function uniqueMap<T>(
  rows: readonly T[],
  value: (row: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const name = value(row);
    assert.ok(!result.has(name), `${label} ${JSON.stringify(name)} is not unique`);
    result.set(name, row);
  }
  return result;
}

export async function buildBillingPlan(db: ClientBase): Promise<BillingPlan> {
  const invoices = await db.query<InvoiceSource>(`
    SELECT src_file,src_row_num,src_extraction_sha256,
           "Inv-No" invoice_no_raw,"contractID" contract_id_raw,
           "Inv-Date" invoice_date_raw,"Amount" amount_raw,"USD$" amount_usd_raw,
           "Currency" currency_raw,"Inv-Details" details_raw,
           "Inv-Status" status_raw,"Inv-Type" type_raw,"VAT?" vat_raw,
           report report_raw,"R-#" receipt_amount_raw,"R-$" receipt_currency_raw,
           jsonb_build_object(
             'Inv-No',"Inv-No",'contractID',"contractID",'Inv-Date',"Inv-Date",
             'Amount',"Amount",'USD$',"USD$",'Currency',"Currency",
             'Inv-Details',"Inv-Details",'Inv-Status',"Inv-Status",
             'Inv-Type',"Inv-Type",'VAT?',"VAT?",'report',report,
             'R-#',"R-#",'R-$',"R-$") source_payload
      FROM staging."الفواتير"
     ORDER BY "Inv-No" NULLS FIRST,src_record_key`);
  const payments = await db.query<PaymentSource>(`
    SELECT src_file,src_row_num,src_extraction_sha256,
           "ID" payment_id_raw,"رقم الفاتورة" invoice_no_raw,
           "التاريخ" payment_date_raw,"Credit" credit_raw,"Debit" debit_raw,
           "العملة" currency_raw,"بيان السداد" details_raw,
           jsonb_build_object(
             'رقم الفاتورة',"رقم الفاتورة",'التاريخ',"التاريخ",'ID',"ID",
             'Credit',"Credit",'Debit',"Debit",'العملة',"العملة",
             'بيان السداد',"بيان السداد") source_payload
      FROM staging."السداد"
     ORDER BY "ID" NULLS FIRST,src_record_key`);
  const allocations = await db.query<AllocationSource>(`
    SELECT src_file,src_row_num,src_extraction_sha256,
           "ID" allocation_id_raw,"InvNo" invoice_no_raw,"Lawyer" lawyer_raw,
           "Percent" percent_raw,"LawyerAs" role_raw,
           jsonb_build_object(
             'ID',"ID",'InvNo',"InvNo",'Lawyer',"Lawyer",
             'Percent',"Percent",'LawyerAs',"LawyerAs") source_payload
      FROM staging."تقسيم التحصيلات"
     ORDER BY "ID" NULLS FIRST,src_record_key`);
  const referenceOnly = Number(
    (await db.query<{ count: string }>('SELECT count(*) FROM staging."LawyerShare4Invoices"'))
      .rows[0]!.count,
  );
  assert.equal(referenceOnly, 0, 'LawyerShare4Invoices must remain exactly empty');

  const feeLetters = await db.query<{ id: number; contract_id: number }>(
    'SELECT id,contract_id FROM fee_letters WHERE legacy_source_record_key IS NOT NULL ORDER BY id',
  );
  const statuses = await db.query<{ id: number; code: string }>(
    'SELECT id,code FROM lookup_invoice_status ORDER BY id',
  );
  const types = await db.query<{ id: number; code: string }>(
    'SELECT id,code FROM lookup_invoice_type ORDER BY id',
  );
  const roles = await db.query<{ id: number; code: string }>(
    'SELECT id,code FROM lookup_lawyer_share_role ORDER BY id',
  );
  const people = await db.query<{ id: number; name_en: string | null }>(
    'SELECT id,name_en FROM people ORDER BY id',
  );
  const personRules = await db.query<{
    source_value: string;
    person_id: number;
    legacy_only: boolean;
    reviewed_by: string;
    reviewed_at: string;
    reviewer_note: string;
  }>(`SELECT source_value,person_id,legacy_only,reviewed_by,reviewed_at::text
              ,reviewer_note
        FROM migration_billing_person_crosswalk ORDER BY source_value`);
  assert.deepEqual(personRules.rows, [
    {
      source_value: 'Ahmed Abdullah',
      person_id: 25,
      legacy_only: true,
      reviewed_by: 'Khaled Helmy',
      reviewed_at: '2026-08-25',
      reviewer_note:
        'Owner-reviewed Task 2.10A legacy-only English allocation name; preserve canonical Dr. Ahmed Abdullah / أحمد عبد الله and never infer through Arabic aliases.',
    },
  ]);
  const currencyRules = await db.query<{
    field_kind: string;
    source_value: string;
    target_value: string | null;
    require_zero_amount: boolean;
    reviewed_by: string;
    reviewed_at: string;
    reviewer_note: string;
  }>(`SELECT field_kind,source_value,target_value,require_zero_amount,reviewed_by,reviewed_at::text
              ,reviewer_note
        FROM migration_billing_currency_rule ORDER BY field_kind,source_value`);
  assert.deepEqual(currencyRules.rows, [
    {
      field_kind: 'receipt_currency',
      source_value: '0',
      target_value: null,
      require_zero_amount: true,
      reviewed_by: 'Khaled Helmy',
      reviewed_at: '2026-08-25',
      reviewer_note:
        'Raw receipt currency 0 becomes NULL only when the receipt amount is zero; non-zero must fail safely.',
    },
    {
      field_kind: 'transaction_currency',
      source_value: ' USD',
      target_value: 'USD',
      require_zero_amount: false,
      reviewed_by: 'Khaled Helmy',
      reviewed_at: '2026-08-25',
      reviewer_note:
        'Exact leading-space normalization for invoice 21352 and its two payments; never trim or case-fold another value.',
    },
  ]);

  const feeByContract = new Map<string, number[]>();
  for (const row of feeLetters.rows)
    feeByContract.set(String(row.contract_id), [
      ...(feeByContract.get(String(row.contract_id)) ?? []),
      row.id,
    ]);
  const statusByCode = uniqueMap(statuses.rows, (row) => row.code, 'invoice status');
  const typeByCode = uniqueMap(types.rows, (row) => row.code, 'invoice type');
  const roleByCode = uniqueMap(roles.rows, (row) => row.code, 'allocation role');
  const peopleByEnglish = new Map<string, number[]>();
  for (const person of people.rows)
    if (person.name_en !== null)
      peopleByEnglish.set(person.name_en, [
        ...(peopleByEnglish.get(person.name_en) ?? []),
        person.id,
      ]);
  const personRuleBySource = uniqueMap(
    personRules.rows,
    (row) => row.source_value,
    'billing person crosswalk',
  );
  const regularCurrencyRule = currencyRules.rows.find(
    (row) => row.field_kind === 'transaction_currency' && row.source_value === ' USD',
  )!;

  const invoiceNumberCounts = new Map<string | null, number>();
  for (const row of invoices.rows) add(invoiceNumberCounts, row.invoice_no_raw);
  const invoiceTargets: InvoiceTarget[] = [];
  const invoiceQuarantine: BillingQuarantine[] = [];
  const sourceKeyByInvoiceNumber = new Map<string, string>();
  const identitySet = new Set<string>();

  for (const row of invoices.rows) {
    const reasons = new Map<string, Detail>();
    const legacyId = integer(row.invoice_no_raw);
    const count = invoiceNumberCounts.get(row.invoice_no_raw) ?? 0;
    const srcRecordKey = stableIdentity(
      'invoice',
      row.invoice_no_raw,
      legacyId,
      count,
      row.source_payload,
    );
    assert.ok(!identitySet.has(srcRecordKey), 'billing durable identity collision for invoices');
    identitySet.add(srcRecordKey);
    if (legacyId === null) reasons.set('invalid_invoice_number', { value: row.invoice_no_raw });
    if (count !== 1)
      reasons.set('duplicate_invoice_number', { value: row.invoice_no_raw, occurrences: count });
    const feeMatches =
      row.contract_id_raw === null ? [] : (feeByContract.get(row.contract_id_raw) ?? []);
    if (feeMatches.length === 0)
      reasons.set('unresolved_fee_letter', { contractID: row.contract_id_raw });
    else if (feeMatches.length > 1)
      reasons.set('ambiguous_fee_letter', {
        contractID: row.contract_id_raw,
        fee_letter_ids: feeMatches,
      });
    const invoiceDate = date(row.invoice_date_raw);
    if (invoiceDate === null) reasons.set('invalid_invoice_date', { value: row.invoice_date_raw });
    const amount = decimal(row.amount_raw, 12, 2);
    if (amount === null) reasons.set('invalid_invoice_amount', { value: row.amount_raw });
    const amountUsd = row.amount_usd_raw === null ? null : decimal(row.amount_usd_raw, 12, 2);
    if (row.amount_usd_raw !== null && amountUsd === null)
      reasons.set('invalid_invoice_usd_amount', { value: row.amount_usd_raw });
    const receiptAmount =
      row.receipt_amount_raw === null ? null : decimal(row.receipt_amount_raw, 12, 2);
    if (row.receipt_amount_raw !== null && receiptAmount === null)
      reasons.set('invalid_receipt_amount', { value: row.receipt_amount_raw });
    let currency: string | null = null;
    if (row.currency_raw === 'EGP' || row.currency_raw === 'USD') currency = row.currency_raw;
    else if (row.currency_raw === regularCurrencyRule.source_value)
      currency = regularCurrencyRule.target_value;
    else reasons.set('unsupported_invoice_currency', { value: row.currency_raw });
    const status = row.status_raw === null ? undefined : statusByCode.get(row.status_raw);
    if (!status) reasons.set('unsupported_invoice_status', { value: row.status_raw });
    const type = row.type_raw === null ? null : typeByCode.get(row.type_raw);
    if (row.type_raw !== null && !type)
      reasons.set('unsupported_invoice_type', { value: row.type_raw });
    const vat = bool(row.vat_raw);
    if (vat === null) reasons.set('invalid_vat_boolean', { value: row.vat_raw });
    const report = bool(row.report_raw);
    if (report === null) reasons.set('invalid_report_boolean', { value: row.report_raw });
    let receiptCurrency: string | null = null;
    if (row.receipt_currency_raw === null) {
      if (receiptAmount !== null && receiptAmount.units !== 0n)
        reasons.set('receipt_amount_without_currency', { amount: row.receipt_amount_raw });
    } else if (row.receipt_currency_raw === 'EGP') {
      receiptCurrency = 'EGP';
      if (receiptAmount === null)
        reasons.set('receipt_currency_without_amount', { currency: row.receipt_currency_raw });
    } else if (row.receipt_currency_raw === '0') {
      if (receiptAmount === null || receiptAmount.units !== 0n)
        reasons.set('zero_receipt_currency_with_nonzero_amount', {
          currency: row.receipt_currency_raw,
          amount: row.receipt_amount_raw,
        });
    } else reasons.set('unsupported_receipt_currency', { value: row.receipt_currency_raw });

    if (
      reasons.size > 0 ||
      legacyId === null ||
      feeMatches.length !== 1 ||
      invoiceDate === null ||
      amount === null ||
      currency === null ||
      !status ||
      vat === null ||
      report === null
    ) {
      invoiceQuarantine.push({
        ...makeQuarantine(row, srcRecordKey, reasons),
        legacyInvoiceNoRaw: row.invoice_no_raw,
      });
      continue;
    }
    sourceKeyByInvoiceNumber.set(row.invoice_no_raw!, srcRecordKey);
    invoiceTargets.push({
      srcRecordKey,
      extractionSha256: row.src_extraction_sha256,
      legacyId,
      invoiceNo: row.invoice_no_raw!,
      feeLetterId: feeMatches[0]!,
      legacyContractId: row.contract_id_raw!,
      invoiceDate,
      amount: amount.value,
      amountUsd: amountUsd?.value ?? null,
      currency,
      legacyCurrencyRaw: row.currency_raw!,
      details: row.details_raw,
      statusId: status.id,
      legacyStatusRaw: row.status_raw!,
      typeId: type?.id ?? null,
      legacyTypeRaw: row.type_raw,
      vat,
      report,
      receiptAmount: receiptAmount?.value ?? null,
      receiptCurrency,
      legacyReceiptCurrencyRaw: row.receipt_currency_raw,
      sourcePayload: row.source_payload,
    });
  }

  const paymentIdCounts = new Map<string | null, number>();
  for (const row of payments.rows) add(paymentIdCounts, row.payment_id_raw);
  const paymentTargets: PaymentTarget[] = [];
  const paymentQuarantine: BillingQuarantine[] = [];
  identitySet.clear();
  for (const row of payments.rows) {
    const reasons = new Map<string, Detail>();
    const legacyId = integer(row.payment_id_raw);
    const count = paymentIdCounts.get(row.payment_id_raw) ?? 0;
    const srcRecordKey = stableIdentity(
      'payment',
      row.payment_id_raw,
      legacyId,
      count,
      row.source_payload,
    );
    assert.ok(!identitySet.has(srcRecordKey), 'billing durable identity collision for payments');
    identitySet.add(srcRecordKey);
    if (legacyId === null) reasons.set('invalid_payment_id', { value: row.payment_id_raw });
    if (count !== 1)
      reasons.set('duplicate_payment_id', { value: row.payment_id_raw, occurrences: count });
    const invoiceSourceKey =
      row.invoice_no_raw === null ? undefined : sourceKeyByInvoiceNumber.get(row.invoice_no_raw);
    if (!invoiceSourceKey)
      reasons.set('unresolved_invoice_reference', { invoice_no: row.invoice_no_raw });
    const paymentDate = date(row.payment_date_raw);
    if (row.payment_date_raw !== null && paymentDate === null)
      reasons.set('invalid_payment_date', { value: row.payment_date_raw });
    const credit = row.credit_raw === null ? null : decimal(row.credit_raw, 12, 2);
    const debit = row.debit_raw === null ? null : decimal(row.debit_raw, 12, 2);
    if (row.credit_raw !== null && credit === null)
      reasons.set('invalid_payment_credit', { value: row.credit_raw });
    if (row.debit_raw !== null && debit === null)
      reasons.set('invalid_payment_debit', { value: row.debit_raw });
    if (row.credit_raw === null && row.debit_raw === null)
      reasons.set('missing_payment_amounts', { credit: null, debit: null });
    let currency: string | null = null;
    if (row.currency_raw === null) {
      if ((credit?.units ?? 0n) !== 0n || (debit?.units ?? 0n) !== 0n)
        reasons.set('nonzero_payment_without_currency', {
          credit: row.credit_raw,
          debit: row.debit_raw,
        });
    } else if (row.currency_raw === 'EGP' || row.currency_raw === 'USD')
      currency = row.currency_raw;
    else if (row.currency_raw === regularCurrencyRule.source_value)
      currency = regularCurrencyRule.target_value;
    else reasons.set('unsupported_payment_currency', { value: row.currency_raw });
    if (
      reasons.size > 0 ||
      legacyId === null ||
      !invoiceSourceKey ||
      (row.payment_date_raw !== null && paymentDate === null) ||
      (row.credit_raw !== null && credit === null) ||
      (row.debit_raw !== null && debit === null)
    ) {
      paymentQuarantine.push({
        ...makeQuarantine(row, srcRecordKey, reasons),
        legacyPaymentIdRaw: row.payment_id_raw,
        legacyInvoiceNoRaw: row.invoice_no_raw,
      });
      continue;
    }
    paymentTargets.push({
      srcRecordKey,
      extractionSha256: row.src_extraction_sha256,
      legacyId,
      invoiceSourceKey,
      legacyInvoiceNo: row.invoice_no_raw!,
      paymentDate,
      credit: credit?.value ?? null,
      debit: debit?.value ?? null,
      currency,
      legacyCurrencyRaw: row.currency_raw,
      details: row.details_raw,
      sourcePayload: row.source_payload,
    });
  }

  const allocationIdCounts = new Map<string | null, number>();
  for (const row of allocations.rows) add(allocationIdCounts, row.allocation_id_raw);
  type AllocationDraft = {
    row: AllocationSource;
    srcRecordKey: string;
    legacyId: number | null;
    invoiceSourceKey?: string;
    personId?: number;
    roleId?: number;
    share: DecimalValue | null;
    reasons: Map<string, Detail>;
  };
  const drafts: AllocationDraft[] = [];
  identitySet.clear();
  for (const row of allocations.rows) {
    const reasons = new Map<string, Detail>();
    const legacyId = integer(row.allocation_id_raw);
    const count = allocationIdCounts.get(row.allocation_id_raw) ?? 0;
    const srcRecordKey = stableIdentity(
      'allocation',
      row.allocation_id_raw,
      legacyId,
      count,
      row.source_payload,
    );
    assert.ok(!identitySet.has(srcRecordKey), 'billing durable identity collision for allocations');
    identitySet.add(srcRecordKey);
    if (legacyId === null) reasons.set('invalid_allocation_id', { value: row.allocation_id_raw });
    if (count !== 1)
      reasons.set('duplicate_allocation_id', { value: row.allocation_id_raw, occurrences: count });
    const invoiceSourceKey =
      row.invoice_no_raw === null ? undefined : sourceKeyByInvoiceNumber.get(row.invoice_no_raw);
    if (!invoiceSourceKey)
      reasons.set('unresolved_invoice_reference', { invoice_no: row.invoice_no_raw });
    let personId: number | undefined;
    const direct = row.lawyer_raw === null ? [] : (peopleByEnglish.get(row.lawyer_raw) ?? []);
    const reviewed = row.lawyer_raw === null ? undefined : personRuleBySource.get(row.lawyer_raw);
    if (reviewed) personId = reviewed.person_id;
    else if (direct.length === 1) personId = direct[0];
    else if (direct.length > 1)
      reasons.set('ambiguous_english_person', { name: row.lawyer_raw, person_ids: direct });
    else reasons.set('unresolved_english_person', { name: row.lawyer_raw });
    const role = row.role_raw === null ? undefined : roleByCode.get(row.role_raw);
    if (!role) reasons.set('unsupported_allocation_role', { value: row.role_raw });
    const share = decimal(row.percent_raw, 1, 5);
    if (share === null || share.units < 0n || share.units > 100_000n)
      reasons.set('invalid_allocation_share', { value: row.percent_raw });
    drafts.push({
      row,
      srcRecordKey,
      legacyId,
      invoiceSourceKey,
      personId,
      roleId: role?.id,
      share,
      reasons,
    });
  }
  const natural = new Map<string, AllocationDraft[]>();
  for (const draft of drafts)
    if (draft.invoiceSourceKey && draft.personId !== undefined && draft.roleId !== undefined)
      natural.set(`${draft.invoiceSourceKey}:${draft.personId}:${draft.roleId}`, [
        ...(natural.get(`${draft.invoiceSourceKey}:${draft.personId}:${draft.roleId}`) ?? []),
        draft,
      ]);
  for (const rows of natural.values())
    if (rows.length > 1)
      for (const draft of rows)
        draft.reasons.set('duplicate_allocation', {
          invoice_no: draft.row.invoice_no_raw,
          person_id: draft.personId,
          lawyer_role_id: draft.roleId,
          legacy_ids: rows.map((row) => row.row.allocation_id_raw).sort(),
        });
  const byInvoice = new Map<string | null, AllocationDraft[]>();
  for (const draft of drafts)
    byInvoice.set(draft.row.invoice_no_raw, [
      ...(byInvoice.get(draft.row.invoice_no_raw) ?? []),
      draft,
    ]);
  for (const [invoiceNo, rows] of byInvoice) {
    const unsafe = rows.filter((row) => row.reasons.size > 0);
    const total = rows.reduce((sum, row) => sum + (row.share?.units ?? 0n), 0n);
    if (unsafe.length > 0)
      for (const draft of rows)
        draft.reasons.set('unsafe_allocation_group', {
          invoice_no: invoiceNo,
          unsafe_legacy_ids: unsafe.map((row) => row.row.allocation_id_raw).sort(),
        });
    if (rows.some((row) => row.share === null) || total !== 100_000n)
      for (const draft of rows)
        draft.reasons.set('invalid_allocation_total', {
          invoice_no: invoiceNo,
          total: `${total / 100_000n}.${String(total % 100_000n).padStart(5, '0')}`,
        });
  }

  const allocationTargets: AllocationTarget[] = [];
  const allocationQuarantine: BillingQuarantine[] = [];
  for (const draft of drafts) {
    const { row } = draft;
    if (
      draft.reasons.size > 0 ||
      draft.legacyId === null ||
      !draft.invoiceSourceKey ||
      draft.personId === undefined ||
      draft.roleId === undefined ||
      draft.share === null
    ) {
      allocationQuarantine.push({
        ...makeQuarantine(row, draft.srcRecordKey, draft.reasons),
        legacyAllocationIdRaw: row.allocation_id_raw,
        legacyInvoiceNoRaw: row.invoice_no_raw,
      });
      continue;
    }
    allocationTargets.push({
      srcRecordKey: draft.srcRecordKey,
      extractionSha256: row.src_extraction_sha256,
      legacyId: draft.legacyId,
      invoiceSourceKey: draft.invoiceSourceKey,
      legacyInvoiceNo: row.invoice_no_raw!,
      personId: draft.personId,
      legacyLawyerRaw: row.lawyer_raw!,
      share: draft.share.value,
      legacyPercentRaw: row.percent_raw!,
      lawyerRoleId: draft.roleId,
      legacyLawyerAsRaw: row.role_raw!,
      sourcePayload: row.source_payload,
    });
  }

  assert.equal(invoiceTargets.length + invoiceQuarantine.length, invoices.rows.length);
  assert.equal(paymentTargets.length + paymentQuarantine.length, payments.rows.length);
  assert.equal(allocationTargets.length + allocationQuarantine.length, allocations.rows.length);
  return {
    invoiceSourceCount: invoices.rows.length,
    paymentSourceCount: payments.rows.length,
    allocationSourceCount: allocations.rows.length,
    referenceOnlyCount: referenceOnly,
    invoices: invoiceTargets,
    invoiceQuarantine,
    payments: paymentTargets,
    paymentQuarantine,
    allocations: allocationTargets,
    allocationQuarantine,
  };
}
