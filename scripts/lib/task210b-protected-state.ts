import type { ClientBase } from 'pg';
import { billingCanonicalState } from './billing-baseline';
import { task210aProtectedState } from './task210a-protected-state';

/** Everything completed through Task 2.10A, protected while Attendance writes. */
export async function task210bProtectedState(db: ClientBase): Promise<string> {
  const prior = await task210aProtectedState(db);
  const canonical = await billingCanonicalState(db);
  const result = await db.query<{ digest: string }>(
    `SELECT encode(sha256(convert_to(
       $1||chr(10)||$2||chr(10)||$3||chr(10)||
       coalesce(string_agg(payload,chr(10) ORDER BY kind,identity),''),
       'UTF8')),'hex') digest
       FROM (
         SELECT 'I' kind,id::text identity,to_jsonb(i)::text payload FROM invoices i
         UNION ALL SELECT 'P',id::text,to_jsonb(p)::text FROM payments p
         UNION ALL SELECT 'A',id::text,to_jsonb(a)::text FROM invoice_allocations a
         UNION ALL SELECT 'QI',src_record_key,to_jsonb(q)::text FROM quarantine.invoice_transform q
         UNION ALL SELECT 'QP',src_record_key,to_jsonb(q)::text FROM quarantine.payment_transform q
         UNION ALL SELECT 'QA',src_record_key,to_jsonb(q)::text FROM quarantine.invoice_allocation_transform q
         UNION ALL SELECT 'PR',source_value,to_jsonb(r)::text FROM migration_billing_person_crosswalk r
         UNION ALL SELECT 'CR',field_kind||':'||source_value,to_jsonb(r)::text FROM migration_billing_currency_rule r
       ) protected`,
    [prior, canonical.completeRowDigest, canonical.identityTimestampDigest],
  );
  return result.rows[0]?.digest ?? '';
}
