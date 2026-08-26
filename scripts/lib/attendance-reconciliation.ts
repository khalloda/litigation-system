import type { ClientBase } from 'pg';
import { attendanceSourceBaselineFailures, attendanceSourceState } from './attendance-baseline';

type JsonObject = Record<string, unknown>;
type AttendanceSource = {
  src_file: string;
  src_row_num: number;
  src_record_key: string;
  src_extraction_sha256: string;
  legacy_id_raw: string | null;
  date_raw: string | null;
  situation_raw: string | null;
  person_raw: string | null;
  source_payload: JsonObject;
};

export type AttendanceReconciliation = {
  defects: string[];
  sourceCount: number;
  targetCount: number;
  quarantineCount: number;
  distinctPeople: number;
  resultDigest: string;
};

function safeInteger(value: string | null): number | null {
  if (value === null || !/^[0-9]+$/u.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= 2_147_483_647 ? number : null;
}

function safeDate(value: string | null): {
  value: string | null;
  reason: 'invalid_attendance_date' | 'meaningful_attendance_time' | null;
} {
  if (value === null) return { value: null, reason: 'invalid_attendance_date' };
  const parts = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u.exec(value);
  if (!parts) return { value: null, reason: 'invalid_attendance_date' };
  const expected = parts.slice(1).map(Number);
  const candidate = new Date(
    Date.UTC(
      expected[0]!,
      expected[1]! - 1,
      expected[2]!,
      expected[3]!,
      expected[4]!,
      expected[5]!,
    ),
  );
  const actual = [
    candidate.getUTCFullYear(),
    candidate.getUTCMonth() + 1,
    candidate.getUTCDate(),
    candidate.getUTCHours(),
    candidate.getUTCMinutes(),
    candidate.getUTCSeconds(),
  ];
  if (actual.some((item, index) => item !== expected[index]))
    return { value: null, reason: 'invalid_attendance_date' };
  if (expected[3] !== 0 || expected[4] !== 0 || expected[5] !== 0)
    return { value: null, reason: 'meaningful_attendance_time' };
  return { value: `${parts[1]}-${parts[2]}-${parts[3]}`, reason: null };
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
  const changed = [...new Set([...expectedByKey.keys(), ...actualByKey.keys()])]
    .filter((key) => expectedByKey.get(key) !== actualByKey.get(key))
    .sort();
  return changed.length === 0
    ? null
    : `${label}: ${changed.length} (${changed.slice(0, 5).join(', ')})`;
}

function ordered(reasons: Map<string, Record<string, unknown>>) {
  return [...reasons].sort(([left], [right]) => left.localeCompare(right, 'en'));
}

/** Stable migration-result digest. Trace filename/row, generated ids and timestamps are excluded. */
export async function attendanceResultDigest(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(
             kind||chr(9)||identity||chr(9)||payload,chr(10) ORDER BY kind,identity),
             ''),'UTF8')),'hex') digest
      FROM (
        SELECT 'A' kind,a.legacy_source_record_key identity,
               jsonb_build_object(
                 'extraction',a.legacy_source_extraction_sha256,
                 'legacy_id',a.legacy_id,'person_id',a.person_id,
                 'legacy_person_raw',a.legacy_person_raw,
                 'attendance_date',a.attendance_date,
                 'situation',a.situation,
                 'legacy_situation_raw',a.legacy_situation_raw,
                 'source_payload',a.legacy_source_payload)::text payload
          FROM attendance a WHERE a.legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'Q',q.src_record_key,
               jsonb_build_object(
                 'extraction',q.extraction_sha256,
                 'legacy_attendance_id_raw',q.legacy_attendance_id_raw,
                 'reason_codes',q.reason_codes,'reason_details',q.reason_details,
                 'source_payload',q.source_payload)::text
          FROM quarantine.attendance_transform q
      ) result`);
  return result.rows[0]?.digest ?? '';
}

export async function reconcileAttendance(
  db: ClientBase,
  enforceApprovedSourceBaseline = true,
): Promise<AttendanceReconciliation> {
  const defects: string[] = [];
  if (enforceApprovedSourceBaseline)
    defects.push(...attendanceSourceBaselineFailures(await attendanceSourceState(db)));

  const source = await db.query<AttendanceSource>(`
    SELECT src_file,src_row_num,src_record_key,src_extraction_sha256,
           "ID" legacy_id_raw,"AttDate" date_raw,"AttSituation" situation_raw,
           "المحامي" person_raw,
           jsonb_build_object('ID',"ID",'AttDate',"AttDate",
                              'AttSituation',"AttSituation",'المحامي',"المحامي") source_payload
      FROM staging."Attendance" ORDER BY src_record_key`);
  const aliases = await db.query<{ alias_ar: string; person_id: number }>(
    'SELECT alias_ar,person_id FROM person_name_alias ORDER BY alias_ar,person_id',
  );
  const aliasPeople = new Map<string, number[]>();
  for (const row of aliases.rows)
    aliasPeople.set(row.alias_ar, [...(aliasPeople.get(row.alias_ar) ?? []), row.person_id]);

  const idCounts = new Map<string | null, number>();
  for (const row of source.rows)
    idCounts.set(row.legacy_id_raw, (idCounts.get(row.legacy_id_raw) ?? 0) + 1);

  const expectedTargets: Record<string, unknown>[] = [];
  const expectedQuarantine: Record<string, unknown>[] = [];
  for (const row of source.rows) {
    const reasons = new Map<string, Record<string, unknown>>();
    const legacyId = safeInteger(row.legacy_id_raw);
    const occurrences = idCounts.get(row.legacy_id_raw) ?? 0;
    if (legacyId === null) reasons.set('invalid_attendance_id', { value: row.legacy_id_raw });
    if (occurrences !== 1)
      reasons.set('duplicate_attendance_id', { value: row.legacy_id_raw, occurrences });

    const parsedDate = safeDate(row.date_raw);
    if (parsedDate.reason !== null) reasons.set(parsedDate.reason, { value: row.date_raw });

    const personMatches =
      row.person_raw === null || row.person_raw.length === 0
        ? []
        : (aliasPeople.get(row.person_raw) ?? []);
    if (row.person_raw === null) reasons.set('missing_person_name', { value: null });
    else if (row.person_raw.length === 0) reasons.set('empty_person_name', { value: '' });
    else if (personMatches.length === 0)
      reasons.set('unresolved_person_alias', { value: row.person_raw });
    else if (personMatches.length > 1)
      reasons.set('ambiguous_person_alias', {
        value: row.person_raw,
        person_ids: personMatches,
      });

    if (
      reasons.size > 0 ||
      legacyId === null ||
      parsedDate.value === null ||
      row.person_raw === null ||
      personMatches.length !== 1
    ) {
      const reasonRows = ordered(reasons);
      expectedQuarantine.push({
        source_key: row.src_record_key,
        extraction_sha256: row.src_extraction_sha256,
        src_file: row.src_file,
        src_row_num: row.src_row_num,
        legacy_attendance_id_raw: row.legacy_id_raw,
        reason_codes: reasonRows.map(([code]) => code),
        reason_details: reasonRows.map(([, detail]) => detail),
        source_payload: row.source_payload,
      });
      continue;
    }
    expectedTargets.push({
      source_key: row.src_record_key,
      extraction_sha256: row.src_extraction_sha256,
      legacy_id: legacyId,
      person_id: personMatches[0],
      legacy_person_raw: row.person_raw,
      attendance_date: parsedDate.value,
      situation: row.situation_raw,
      legacy_situation_raw: row.situation_raw,
      source_payload: row.source_payload,
    });
  }

  const actualTargets = await db.query<Record<string, unknown>>(`
    SELECT legacy_source_record_key source_key,
           legacy_source_extraction_sha256 extraction_sha256,legacy_id,person_id,
           legacy_person_raw,attendance_date::text attendance_date,situation,
           legacy_situation_raw,legacy_source_payload source_payload
      FROM attendance WHERE legacy_source_record_key IS NOT NULL ORDER BY source_key`);
  const actualQuarantine = await db.query<Record<string, unknown>>(`
    SELECT src_record_key source_key,extraction_sha256,src_file,src_row_num,
           legacy_attendance_id_raw,reason_codes,reason_details,source_payload
      FROM quarantine.attendance_transform ORDER BY source_key`);
  for (const comparison of [
    compareRows('Attendance target/source mismatch', expectedTargets, actualTargets.rows),
    compareRows('Attendance quarantine/source mismatch', expectedQuarantine, actualQuarantine.rows),
  ])
    if (comparison) defects.push(comparison);

  const partial = Number(
    (
      await db.query<{ count: string }>(`
        SELECT count(*) FROM attendance WHERE NOT ((
          (legacy_id IS NULL AND legacy_person_raw IS NULL AND
           legacy_situation_raw IS NULL AND legacy_source_record_key IS NULL AND
           legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL)
          OR
          (legacy_source_record_key IS NOT NULL AND
           legacy_source_extraction_sha256 IS NOT NULL AND
           legacy_source_payload IS NOT NULL AND
           legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$' AND
           legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$' AND
           jsonb_typeof(legacy_source_payload)='object' AND
           legacy_id IS NOT NULL AND person_id IS NOT NULL AND
           legacy_person_raw IS NOT NULL AND attendance_date IS NOT NULL AND
           situation IS NOT DISTINCT FROM legacy_situation_raw)
        ) IS TRUE)`)
    ).rows[0]!.count,
  );
  if (partial !== 0) defects.push(`partial Attendance provenance: ${partial}`);

  const people = new Set(actualTargets.rows.map((row) => Number(row['person_id']))).size;
  return {
    defects,
    sourceCount: source.rows.length,
    targetCount: actualTargets.rows.length,
    quarantineCount: actualQuarantine.rows.length,
    distinctPeople: people,
    resultDigest: await attendanceResultDigest(db),
  };
}
