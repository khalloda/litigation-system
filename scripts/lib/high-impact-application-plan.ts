import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';
import { MATTER_RECONCILIATION_SQL } from './matter-reconciliation';
import { buildMatterRelationshipPlan } from './matter-relationship-plan';
import { buildHearingTransformPlan, type ReviewedHearingRelease } from './hearing-transform-plan';
import {
  APPROVED_NEW_COURT,
  D40_NO_BRANCH,
  readHighImpactReviewSnapshotInTransaction,
  type HighImpactReviewSnapshot,
} from './high-impact-review-workbook';
import {
  assertD41Destinations,
  D39_BRANCHES,
  D41_COURT,
  D41_DESTINATIONS,
  D41_NOTE,
  readApprovedDispositions,
  type ApprovedDisposition,
} from './high-impact-application-contract';

export type Fields = Record<string, unknown>;
export type PlannedRow = { table: string; key: string; fields: Fields };
export type HighImpactApplicationPlan = {
  dispositions: ApprovedDisposition[];
  rows: PlannedRow[];
  lookupCreations: { table: string; label: string }[];
  digest: string;
  counts: Record<string, number>;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function applicationDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function numberOrNull(value: string | null): number | null {
  if (value === null) return null;
  assert.match(value, /^[0-9]+$/, 'invalid source integer');
  const result = Number(value);
  assert.ok(Number.isSafeInteger(result) && result > 0, 'invalid source integer range');
  return result;
}
function dateOrNull(value: string | null): string | null {
  if (value === null) return null;
  assert.match(value, /^\d{4}-\d{2}-\d{2} 00:00:00$/, 'invalid source date');
  assert.equal(new Date(value.slice(0, 10)).toISOString().slice(0, 10), value.slice(0, 10));
  return value.slice(0, 10);
}

/** SQL mapping interpretation is shared with the permanent matter oracle;
 * all scalar/source preservation below is separately checked by that oracle.
 * Selecting the named CTE is read-only, and fails closed if its boundary changes. */
export function matterMappingQuery(): string {
  const marker = '), conflicts AS MATERIALIZED (';
  assert.equal(
    MATTER_RECONCILIATION_SQL.split(marker).length,
    2,
    'matter oracle CTE boundary changed',
  );
  return (
    MATTER_RECONCILIATION_SQL.split(marker)[0]! +
    ') SELECT * FROM expected_mapping ORDER BY src_record_key'
  );
}

export async function buildHighImpactApplicationPlan(
  db: ClientBase,
  path: string,
  bytes: Buffer,
  snapshot?: HighImpactReviewSnapshot,
): Promise<HighImpactApplicationPlan> {
  const review = snapshot ?? (await readHighImpactReviewSnapshotInTransaction(db));
  const dispositions = await readApprovedDispositions(path, bytes, review);
  const matterDecisions = dispositions.filter((row) => row.kind === 'matter');
  const hearingDecisions = dispositions.filter((row) => row.kind === 'hearing');
  assert.equal(matterDecisions.length, 55);
  assert.equal(hearingDecisions.length, 327);
  const qMatters = (
    await db.query<{
      src_record_key: string;
      legacy_matter_id: string;
      source_payload: Record<string, string | null>;
    }>('SELECT src_record_key,legacy_matter_id,source_payload FROM quarantine.matter_transform')
  ).rows;
  const qHearings = (
    await db.query<{
      src_record_key: string;
      legacy_hearing_id: string;
      source_payload: Record<string, string | null>;
    }>('SELECT src_record_key,legacy_hearing_id,source_payload FROM quarantine.hearing_transform')
  ).rows;
  for (const [quarantine, staging] of [
    ['matter_transform', 'الدعاوى'],
    ['hearing_transform', 'الجلسات'],
  ]) {
    const stale = (
      await db.query<{ count: number }>(`
      SELECT count(*)::integer count FROM quarantine.${quarantine} q
      LEFT JOIN staging."${staging}" s ON s.src_record_key=q.src_record_key
      WHERE s.src_record_key IS NULL OR s.src_extraction_sha256 IS DISTINCT FROM q.extraction_sha256
        OR q.source_payload IS DISTINCT FROM
          (to_jsonb(s)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'])`)
    ).rows[0]!.count;
    assert.equal(stale, 0, 'stale quarantine/source evidence');
  }
  const mappings = new Map(
    (
      await db.query<{
        src_record_key: string;
        [field: string]: string | null;
      }>(matterMappingQuery())
    ).rows.map((row) => [row.src_record_key, row]),
  );
  const lookupTables = [
    'lookup_client_branch',
    'lookup_matter_type',
    'lookup_matter_category',
    'lookup_degree',
    'lookup_venue',
    'lookup_importance',
    'lookup_matter_destination',
    'lookup_court',
  ] as const;
  const lookups = new Map<string, Map<string, number>>();
  for (const table of lookupTables) {
    const result = (
      await db.query<{ id: number; label_ar: string }>(`SELECT id,label_ar FROM ${table}`)
    ).rows;
    assert.equal(
      new Set(result.map((row) => row.label_ar)).size,
      result.length,
      'duplicate lookup label',
    );
    lookups.set(table, new Map(result.map((row) => [row.label_ar, row.id])));
  }
  const lookup = (table: string, label: string | null): number | null => {
    if (label === null) return null;
    const id = lookups.get(table)!.get(label);
    assert.notEqual(id, undefined, `approved lookup is missing: ${table}`);
    return id!;
  };
  const defaultType = (
    await db.query<{ id: number }>('SELECT id FROM lookup_matter_type WHERE is_default')
  ).rows;
  assert.equal(defaultType.length, 1);
  const clients = (
    await db.query<{ id: number; legacy_id: number | null }>('SELECT id,legacy_id FROM clients')
  ).rows;
  const byLegacyClient = new Map(clients.map((row) => [row.legacy_id, row.id]));
  const lookupCreations = [
    ...D39_BRANCHES.map((row) => ({ table: 'lookup_client_branch', label: row.label })),
    { table: 'lookup_court', label: APPROVED_NEW_COURT },
  ];
  for (const row of lookupCreations)
    assert.ok(!lookups.get(row.table)!.has(row.label), 'partial lookup application');
  for (const branch of D39_BRANCHES)
    assert.equal(byLegacyClient.get(branch.legacyClientId), branch.clientId);
  assert.equal(byLegacyClient.get(133), 142, 'Masters identity changed');
  const rows: PlannedRow[] = [];
  const symbolicMatters = new Map<string, number>();
  const matterSourceFields = {
    case_number_ar: 'matterAR',
    case_number_en: 'matterEN',
    subject: 'matterSubject',
    legacy_category_raw: 'matterCategory',
    legacy_degree_raw: 'matterDegree',
    legacy_branch_raw: 'clientBranch',
    status: 'matterStatus',
    notes_1: 'matterNotes1',
    notes_2: 'matterNotes2',
    evaluation: 'matteEvaluation',
    current_status: 'الموقف الحالي',
    legacy_client_type_raw: 'نوع العميل',
    legacy_financial_allocation_raw: 'المخصص المالي',
    legal_opinion: 'الرأي القانوني',
    legacy_contract_id_raw: 'contractID',
    legacy_partner_raw: 'matterPartner',
    legacy_court_raw: 'matterCourt',
    circuit_secretary: 'circutSecretary',
    court_floor: 'courtFloor',
    court_hall: 'courtHall',
    court_shelf: 'matterShelf',
    court_secretary_room: 'secretaryRoom',
    fee_letter_ref: 'خطاب الأتعاب',
  };
  for (const decision of matterDecisions) {
    const matches = qMatters.filter((row) => row.src_record_key === decision.sourceRecordKey);
    assert.equal(matches.length, 1, 'stale matter quarantine identity');
    const source = matches[0]!.source_payload;
    assert.equal(matches[0]!.legacy_matter_id, decision.legacyId);
    const legacyId = numberOrNull(decision.legacyId)!;
    symbolicMatters.set(decision.legacyId!, -legacyId); // plan-only source reference, never an inserted ID
    const mapped = { ...mappings.get(decision.sourceRecordKey) };
    let clientId = byLegacyClient.get(numberOrNull(source.clientID!)) ?? null;
    let branch: number | string | null = lookup('lookup_client_branch', mapped.branch ?? null);
    if (decision.reasonCodes[0] === 'separate_client') {
      const approved = D39_BRANCHES.find((item) => item.label === source.clientBranch);
      assert.ok(approved, 'unapproved branch or party-derived branch');
      assert.equal(clientId, approved.clientId, 'incorrect Sigma or Alpha parent');
      assert.equal(decision.currentClientId, String(clientId));
      branch = `new:${approved.label}`;
    } else if (D40_NO_BRANCH.has(decision.reviewId)) {
      assert.equal(decision.target, '', 'synthetic branch in intentional NULL decision');
      branch = null;
    } else if (decision.targetKind === 'client') {
      assert.equal(decision.reviewId, 'M-000111');
      clientId = 142;
    } else if (['importance', 'category', 'type'].includes(decision.targetKind)) {
      const chosen = review.lookups.filter(
        (item) =>
          item.kind === decision.targetKind && decision.target === `${item.id} — ${item.label}`,
      );
      assert.equal(chosen.length, 1, 'approved classification identity does not resolve');
      mapped[
        decision.targetKind === 'category'
          ? 'matter_category'
          : decision.targetKind === 'type'
            ? 'matter_type'
            : 'importance'
      ] = chosen[0]!.label;
    } else {
      assert.ok(
        ['M-000064', 'M-000065', 'M-000067'].includes(decision.reviewId),
        'unhandled matter decision',
      );
      assert.equal(decision.target, D41_NOTE);
      assert.equal(mapped.court, D41_COURT);
    }
    assert.notEqual(clientId, null, 'missing approved matter client');
    const fields: Fields = {
      legacy_id: legacyId,
      legacy_source_record_key: decision.sourceRecordKey,
      legacy_source_extraction_sha256: decision.extractionSha256,
      legacy_source_payload: source,
      client_id: clientId,
      branch_id: branch,
      matter_type_id: mapped.matter_type
        ? lookup('lookup_matter_type', mapped.matter_type)
        : defaultType[0]!.id,
      matter_category_id: lookup('lookup_matter_category', mapped.matter_category ?? null),
      degree_id: lookup('lookup_degree', mapped.degree ?? null),
      venue_id: lookup('lookup_venue', mapped.venue ?? null),
      importance_id: lookup('lookup_importance', mapped.importance ?? null),
      destination_id: lookup('lookup_matter_destination', mapped.destination ?? null),
      court_id: lookup('lookup_court', mapped.court ?? null),
      circuit: mapped.circuit ?? null,
      start_date: dateOrNull(source.matterStartDate!),
      end_date: dateOrNull(source.matterEndDate!),
      asked_amount: source.matterAskedAmount,
      judged_amount: source.matterJudgedAmount,
      legacy_selected: source.matterSelect === null ? null : source.matterSelect === 'true',
    };
    for (const [target, raw] of Object.entries(matterSourceFields)) fields[target] = source[raw];
    rows.push({ table: 'matters', key: decision.sourceRecordKey, fields });
  }
  const existingMatters = new Map(
    (
      await db.query<{ id: number; legacy_id: number }>(
        'SELECT id,legacy_id FROM matters WHERE legacy_source_record_key IS NOT NULL',
      )
    ).rows.map((row) => [String(row.legacy_id), row.id]),
  );
  assert.ok(
    [...symbolicMatters.keys()].every((key) => !existingMatters.has(key)),
    'partial matter application',
  );
  const releases = new Map<string, ReviewedHearingRelease>();
  const d41 = new Map<number, number>(D41_DESTINATIONS);
  for (const decision of hearingDecisions) {
    const source = qHearings.find((row) => row.src_record_key === decision.sourceRecordKey);
    assert.ok(
      source && source.legacy_hearing_id === decision.legacyId,
      'stale hearing quarantine identity',
    );
    const legacyMatter = source.source_payload.matterID!;
    const parent = symbolicMatters.get(legacyMatter) ?? existingMatters.get(legacyMatter);
    assert.notEqual(parent, undefined, 'missing approved hearing parent');
    const release: ReviewedHearingRelease = {
      expectedReasons: decision.reasonCodes,
      matterId: parent!,
    };
    if (decision.reasonCodes[0] === 'unmapped_court') {
      if (decision.target === APPROVED_NEW_COURT)
        release.courtId = null; // resolved only after INSERT RETURNING
      else {
        const chosen = review.lookups.filter(
          (item) => item.kind === 'court' && decision.target === `${item.id} — ${item.label}`,
        );
        assert.equal(chosen.length, 1, 'unapproved hearing court');
        release.courtId = Number(chosen[0]!.id);
      }
    } else if (decision.reasonCodes[0] === 'court_circuit_conflict')
      release.circuit = decision.target;
    else {
      assert.equal(decision.targetKind, 'parent');
      assert.equal(
        decision.parentMatterReviewId,
        matterDecisions.find((item) => item.legacyId === legacyMatter)?.reviewId,
        'incorrect dependent-hearing inheritance',
      );
    }
    if (d41.has(Number(decision.legacyId))) {
      assert.equal(Number(legacyMatter), d41.get(Number(decision.legacyId)), 'D41 wrong matter');
      assert.equal(source.source_payload['المحكمة'], D41_COURT, 'D41 source court changed');
      release.note = D41_NOTE;
    }
    releases.set(decision.sourceRecordKey, release);
  }
  const hearingPlan = await buildHearingTransformPlan(db, releases);
  assert.equal(hearingPlan.quarantine.length, 0, 'remaining high-impact hearing defect');
  const selectedHearings = hearingPlan.targets.filter((row) => releases.has(row.srcRecordKey));
  assert.equal(selectedHearings.length, 327);
  assertD41Destinations(
    selectedHearings.map((row) => ({
      legacyId: row.legacyId,
      legacyMatterId: Number(
        qHearings.find((q) => q.src_record_key === row.srcRecordKey)!.source_payload.matterID,
      ),
      note: row.notes,
      court: [...lookups.get('lookup_court')!].find(([, id]) => id === row.courtId)?.[0] ?? null,
    })),
  );
  const snake = (value: string) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  for (const hearing of selectedHearings) {
    const { srcRecordKey, extractionSha256, sourcePayload, ...values } = hearing;
    const decision = hearingDecisions.find((row) => row.sourceRecordKey === srcRecordKey)!;
    const fields = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [snake(key), value]),
    );
    if (decision.target === APPROVED_NEW_COURT) fields.court_id = `new:${APPROVED_NEW_COURT}`;
    rows.push({
      table: 'hearings',
      key: srcRecordKey,
      fields: {
        ...fields,
        legacy_source_record_key: srcRecordKey,
        legacy_source_extraction_sha256: extractionSha256,
        legacy_source_payload: sourcePayload,
      },
    });
  }
  const relationships = await buildMatterRelationshipPlan(
    db,
    matterDecisions.map((row) => ({
      id: symbolicMatters.get(row.legacyId!)!,
      legacy_source_record_key: row.sourceRecordKey,
    })),
  );
  assert.deepEqual(relationships.ruleFailures, []);
  assert.equal(relationships.sourceCellCount, 158);
  for (const lawyer of relationships.lawyers)
    rows.push({
      table: 'matter_lawyers',
      key: `${lawyer.legacySourceRecordKey}:${lawyer.sourceField}:${lawyer.sourceMemberOrdinal}`,
      fields: Object.fromEntries(Object.entries(lawyer).map(([key, value]) => [snake(key), value])),
    });
  for (const party of relationships.parties) {
    const { roles, ...values } = party;
    const key = `${party.legacySourceRecordKey}:${party.sourceField}:${party.sourceFragmentOrdinal}`;
    rows.push({
      table: 'matter_parties',
      key,
      fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [snake(key), value])),
    });
    for (const role of roles)
      rows.push({
        table: 'matter_party_roles',
        key: `${key}:${role.roleId}`,
        fields: {
          party_id: key,
          role_id: role.roleId,
          ordinal: role.ordinal,
          legacy_role_raw: role.legacyRoleRaw,
        },
      });
  }
  for (const evidence of relationships.evidence)
    rows.push({
      table: 'quarantine.matter_relationship_transform',
      key: `${evidence.srcRecordKey}:${evidence.sourceField}`,
      fields: Object.fromEntries(
        Object.entries(evidence).map(([key, value]) => [snake(key), value]),
      ),
    });
  for (const attendee of hearingPlan.attendees.filter((row) =>
    releases.has(row.hearingSourceRecordKey),
  )) {
    const { hearingSourceRecordKey, ...values } = attendee;
    rows.push({
      table: 'hearing_attendees',
      key: attendee.sourceSpanId,
      fields: {
        hearing_id: hearingSourceRecordKey,
        ...Object.fromEntries(Object.entries(values).map(([key, value]) => [snake(key), value])),
      },
    });
  }
  const counts = Object.fromEntries(
    [...new Set(rows.map((row) => row.table))].map((table) => [
      table,
      rows.filter((row) => row.table === table).length,
    ]),
  );
  assert.deepEqual(counts, {
    matters: 55,
    hearings: 327,
    matter_lawyers: 41,
    matter_parties: 80,
    matter_party_roles: 68,
    'quarantine.matter_relationship_transform': 37,
    hearing_attendees: 229,
  });
  const digest = applicationDigest({
    dispositions: dispositions.map(
      ({ reviewId, sourceRecordKey, extractionSha256, reasonCodes, status, target }) => ({
        reviewId,
        sourceRecordKey,
        extractionSha256,
        reasonCodes,
        status,
        target,
      }),
    ),
    rows,
    lookupCreations,
    d41: D41_DESTINATIONS,
  });
  return { dispositions, rows, lookupCreations, digest, counts };
}
