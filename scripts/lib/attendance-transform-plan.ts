import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';

type JsonObject = Record<string, unknown>;
type Detail = Record<string, unknown>;

type AttendanceSource = {
  src_file: string;
  src_row_num: number;
  src_record_key: string;
  src_extraction_sha256: string;
  legacy_id_raw: string | null;
  attendance_date_raw: string | null;
  situation_raw: string | null;
  person_raw: string | null;
  source_payload: JsonObject;
};

export type AttendanceTarget = {
  srcRecordKey: string;
  extractionSha256: string;
  legacyId: number;
  personId: number;
  legacyPersonRaw: string;
  attendanceDate: string;
  situation: string | null;
  legacySituationRaw: string | null;
  sourcePayload: JsonObject;
};

export type AttendanceQuarantine = {
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  legacyAttendanceIdRaw: string | null;
  reasonCodes: string[];
  reasonDetails: Detail[];
  sourcePayload: JsonObject;
};

export type AttendancePlan = {
  sourceCount: number;
  targets: AttendanceTarget[];
  quarantine: AttendanceQuarantine[];
};

function integer(value: string | null): number | null {
  if (value === null || !/^[0-9]+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

type ParsedDate = {
  date: string | null;
  reason: 'invalid_attendance_date' | 'meaningful_attendance_time' | null;
};

function date(value: string | null): ParsedDate {
  if (value === null) return { date: null, reason: 'invalid_attendance_date' };
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return { date: null, reason: 'invalid_attendance_date' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  )
    return { date: null, reason: 'invalid_attendance_date' };
  if (hour !== 0 || minute !== 0 || second !== 0)
    return { date: null, reason: 'meaningful_attendance_time' };
  return { date: `${match[1]}-${match[2]}-${match[3]}`, reason: null };
}

function orderedReasons(reasons: Map<string, Detail>): [string, Detail][] {
  return [...reasons].sort(([left], [right]) => left.localeCompare(right, 'en'));
}

export async function buildAttendancePlan(db: ClientBase): Promise<AttendancePlan> {
  const source = await db.query<AttendanceSource>(`
    SELECT src_file,src_row_num,src_record_key,src_extraction_sha256,
           "ID" legacy_id_raw,"AttDate" attendance_date_raw,
           "AttSituation" situation_raw,"المحامي" person_raw,
           jsonb_build_object('ID',"ID",'AttDate',"AttDate",
                              'AttSituation',"AttSituation",'المحامي',"المحامي") source_payload
      FROM staging."Attendance" ORDER BY src_record_key`);
  const aliases = await db.query<{ alias_ar: string; person_id: number }>(
    'SELECT alias_ar,person_id FROM person_name_alias ORDER BY alias_ar,person_id',
  );
  const peopleByAlias = new Map<string, number[]>();
  for (const alias of aliases.rows)
    peopleByAlias.set(alias.alias_ar, [
      ...(peopleByAlias.get(alias.alias_ar) ?? []),
      alias.person_id,
    ]);

  const idCounts = new Map<string | null, number>();
  for (const row of source.rows)
    idCounts.set(row.legacy_id_raw, (idCounts.get(row.legacy_id_raw) ?? 0) + 1);

  const targets: AttendanceTarget[] = [];
  const quarantine: AttendanceQuarantine[] = [];
  const sourceKeys = new Set<string>();
  for (const row of source.rows) {
    assert.match(row.src_record_key, /^[0-9a-f]{64}:[0-9]{6}$/u);
    assert.match(row.src_extraction_sha256, /^[0-9A-F]{64}$/u);
    assert.ok(
      !sourceKeys.has(row.src_record_key),
      `duplicate Attendance source key ${row.src_record_key}`,
    );
    sourceKeys.add(row.src_record_key);

    const reasons = new Map<string, Detail>();
    const legacyId = integer(row.legacy_id_raw);
    const idOccurrences = idCounts.get(row.legacy_id_raw) ?? 0;
    if (legacyId === null) reasons.set('invalid_attendance_id', { value: row.legacy_id_raw });
    if (idOccurrences !== 1)
      reasons.set('duplicate_attendance_id', {
        value: row.legacy_id_raw,
        occurrences: idOccurrences,
      });

    const parsedDate = date(row.attendance_date_raw);
    if (parsedDate.reason !== null)
      reasons.set(parsedDate.reason, { value: row.attendance_date_raw });

    const personMatches =
      row.person_raw === null || row.person_raw.length === 0
        ? []
        : (peopleByAlias.get(row.person_raw) ?? []);
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
      parsedDate.date === null ||
      personMatches.length !== 1 ||
      row.person_raw === null
    ) {
      const ordered = orderedReasons(reasons);
      quarantine.push({
        srcRecordKey: row.src_record_key,
        extractionSha256: row.src_extraction_sha256,
        srcFile: row.src_file,
        srcRowNum: row.src_row_num,
        legacyAttendanceIdRaw: row.legacy_id_raw,
        reasonCodes: ordered.map(([code]) => code),
        reasonDetails: ordered.map(([, detail]) => detail),
        sourcePayload: row.source_payload,
      });
      continue;
    }

    targets.push({
      srcRecordKey: row.src_record_key,
      extractionSha256: row.src_extraction_sha256,
      legacyId,
      personId: personMatches[0]!,
      legacyPersonRaw: row.person_raw,
      attendanceDate: parsedDate.date,
      situation: row.situation_raw,
      legacySituationRaw: row.situation_raw,
      sourcePayload: row.source_payload,
    });
  }
  assert.equal(targets.length + quarantine.length, source.rows.length);
  return { sourceCount: source.rows.length, targets, quarantine };
}
