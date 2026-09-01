import type { ClientBase } from 'pg';

/**
 * The single reviewed Task 2.10A snapshot definition.
 *
 * The complete-row digest includes every legacy-derived billing column,
 * generated database id and both timestamps. Timestamps are rendered in UTC
 * with exactly six fractional digits before hashing, so the session timezone
 * and the PostgreSQL driver's Date serialization cannot change the result.
 * Rows are tagged by table and ordered by that tag plus database id.
 *
 * The identity/timestamp digest uses the same tags, ordering and UTC timestamp
 * representation but includes only id, created_at and updated_at.
 */
export const BILLING_CANONICAL_BASELINE = {
  semanticDigest: '421b935e10b9e45a9bb9718b947825817b09ac60b7529d95491378f6e0737498',
  completeRowDigest: '81f1d4176828d109f5af1bd90a397408c32dc967751254e172312de74c330925',
  identityTimestampDigest: 'a4e35c491255067d824aff6085a095d92d02bcf0946490c72c081632d4b200f2',
} as const;

export type BillingCanonicalState = {
  completeRowDigest: string;
  identityTimestampDigest: string;
};

export async function billingCanonicalState(db: ClientBase): Promise<BillingCanonicalState> {
  const result = await db.query<{
    complete_row_digest: string;
    identity_timestamp_digest: string;
  }>(`
    WITH canonical AS (
      SELECT 'invoice'::text kind,i.id,
             (to_jsonb(i)-'created_at'-'updated_at'-'created_by'-'updated_by') || jsonb_build_object(
               'created_by',NULL,
               'updated_by',NULL,
               'created_at',to_char(i.created_at AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
               'updated_at',to_char(i.updated_at AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) payload,
             to_char(i.created_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_utc,
             to_char(i.updated_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') updated_utc
        FROM invoices i WHERE i.legacy_source_record_key IS NOT NULL
      UNION ALL
      SELECT 'payment',p.id,
             (to_jsonb(p)-'created_at'-'updated_at'-'created_by'-'updated_by') || jsonb_build_object(
               'created_by',NULL,
               'updated_by',NULL,
               'created_at',to_char(p.created_at AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
               'updated_at',to_char(p.updated_at AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
             to_char(p.created_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
             to_char(p.updated_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        FROM payments p WHERE p.legacy_source_record_key IS NOT NULL
      UNION ALL
      SELECT 'allocation',a.id,
             (to_jsonb(a)-'created_at'-'updated_at'-'created_by'-'updated_by') || jsonb_build_object(
               'created_by',NULL,
               'updated_by',NULL,
               'created_at',to_char(a.created_at AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
               'updated_at',to_char(a.updated_at AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
             to_char(a.created_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
             to_char(a.updated_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        FROM invoice_allocations a WHERE a.legacy_source_record_key IS NOT NULL
    )
    SELECT encode(sha256(convert_to(coalesce(string_agg(
             jsonb_build_array(kind,id,payload)::text,chr(10)
             ORDER BY kind,id),''),'UTF8')),'hex') complete_row_digest,
           encode(sha256(convert_to(coalesce(string_agg(
             jsonb_build_array(kind,id,created_utc,updated_utc)::text,chr(10)
             ORDER BY kind,id),''),'UTF8')),'hex') identity_timestamp_digest
      FROM canonical`);
  return {
    completeRowDigest: result.rows[0]?.complete_row_digest ?? '',
    identityTimestampDigest: result.rows[0]?.identity_timestamp_digest ?? '',
  };
}
