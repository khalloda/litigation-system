import type { ClientBase } from 'pg';

/**
 * Approved Task 2.10B source inventory from the fixed Stage 2 extraction.
 * The digest orders rows by durable src_record_key and hashes a JSON array of
 * durable key, extraction fingerprint and all four exact Access values. It
 * excludes src_file and src_row_num because those are trace, not identity.
 * JSON keeps NULL distinct from the empty string and escapes embedded line
 * breaks without changing them.
 */
export const ATTENDANCE_SOURCE_BASELINE = {
  rows: 4_022,
  extractionSha256: '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979',
  digest: '7357fd7df5f9076228a0f07e1bed97ca3f184928010a40f6c524bd75ef72de38',
  distinctPeople: 10,
  distinctSituations: 873,
} as const;

/**
 * Approved Task 2.10B semantic result after the live serializable transform.
 * The digest includes every transformed/quarantined legacy value, person link,
 * durable source identity, extraction fingerprint and complete source payload.
 * It deliberately excludes generated ids, timestamps, filenames and CSV row
 * positions so a clean rebuild produces the same result.
 */
export const ATTENDANCE_RESULT_BASELINE = {
  targetRows: 4_022,
  quarantineRows: 0,
  distinctPeople: 10,
  digest: 'f6971cca7139e191d1fc192d290d496436d8bbc0c6153dd27d00c295e6b10ab5',
} as const;

export type AttendanceSourceState = {
  rows: number;
  extractionCount: number;
  extractionSha256: string | null;
  distinctPeople: number;
  distinctSituations: number;
  digest: string;
};

export async function attendanceSourceState(db: ClientBase): Promise<AttendanceSourceState> {
  const result = await db.query<{
    rows: number;
    extraction_count: number;
    extraction_sha256: string | null;
    distinct_people: number;
    distinct_situations: number;
    digest: string;
  }>(`
    SELECT count(*)::int rows,
           count(DISTINCT src_extraction_sha256)::int extraction_count,
           min(src_extraction_sha256) extraction_sha256,
           count(DISTINCT "المحامي")::int distinct_people,
           count(DISTINCT "AttSituation")::int distinct_situations,
           encode(sha256(convert_to(coalesce(string_agg(
             jsonb_build_array(src_record_key,src_extraction_sha256,
                               "ID","AttDate","AttSituation","المحامي")::text,
             chr(10) ORDER BY src_record_key),''),'UTF8')),'hex') digest
      FROM staging."Attendance"`);
  const row = result.rows[0];
  return {
    rows: row?.rows ?? 0,
    extractionCount: row?.extraction_count ?? 0,
    extractionSha256: row?.extraction_sha256 ?? null,
    distinctPeople: row?.distinct_people ?? 0,
    distinctSituations: row?.distinct_situations ?? 0,
    digest: row?.digest ?? '',
  };
}

export function attendanceSourceBaselineFailures(state: AttendanceSourceState): string[] {
  const failures: string[] = [];
  if (state.rows !== ATTENDANCE_SOURCE_BASELINE.rows)
    failures.push(`Attendance source rows are ${state.rows}`);
  if (state.extractionCount !== 1)
    failures.push(`Attendance has ${state.extractionCount} extraction fingerprints`);
  if (state.extractionSha256 !== ATTENDANCE_SOURCE_BASELINE.extractionSha256)
    failures.push(`Attendance extraction fingerprint is ${state.extractionSha256 ?? 'NULL'}`);
  if (state.distinctPeople !== ATTENDANCE_SOURCE_BASELINE.distinctPeople)
    failures.push(`Attendance person values are ${state.distinctPeople}`);
  if (state.distinctSituations !== ATTENDANCE_SOURCE_BASELINE.distinctSituations)
    failures.push(`Attendance situation values are ${state.distinctSituations}`);
  if (state.digest !== ATTENDANCE_SOURCE_BASELINE.digest)
    failures.push(`Attendance source digest is ${state.digest}`);
  return failures;
}
