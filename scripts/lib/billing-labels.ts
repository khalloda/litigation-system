/** D67 exact approved map. Codes and Unicode are intentionally not normalized. */
export const BILLING_LABELS = [
  ['invoice_status', 'Paid', 'مسددة'],
  ['invoice_status', 'Unpaid', 'غير مسددة'],
  ['invoice_status', 'Partially Paid', 'مسددة جزئيًا'],
  ['invoice_status', 'Later', 'مؤجلة'],
  ['invoice_status', 'Canceled', 'ملغاة'],
  ['invoice_type', 'Service', 'خدمات'],
  ['invoice_type', 'Expenses', 'مصروفات'],
  ['lawyer_share_role', 'Reviewer', 'الشريك المراجع'],
  ['lawyer_share_role', 'LawyerA', 'المحامي الرئيسي'],
  ['lawyer_share_role', 'LawyerB', 'محامٍ مساعد'],
  ['lawyer_share_role', 'LawyerA+', 'محامٍ رئيسي مشارك'],
] as const;
export function billingLabelsMatch(rows: { list: string; code: string; label: string | null }[]) {
  const actual = rows.map((r) => JSON.stringify([r.list, r.code, r.label])).sort();
  const expected = BILLING_LABELS.map((r) => JSON.stringify(r)).sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}
