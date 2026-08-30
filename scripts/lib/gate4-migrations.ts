import { createHash } from 'node:crypto';

export type Gate4MigrationHistoryRow = Readonly<{
  migrationName: string;
  checksum: string;
  finishedAt: string | null;
  rolledBackAt: string | null;
  appliedStepsCount: number;
}>;

export type Gate4MigrationEvidence = Readonly<{
  requiredStage2Expected: number;
  requiredStage2Proved: number;
  requiredStage2Digest: string;
  finalStage2Migration: string;
  totalApplied: number;
  laterApplied: number;
  laterAppliedNames: readonly string[];
  cleanRollbacks: number;
  cleanRollbackNames: readonly string[];
  unfinishedOrFailed: number;
  defects: readonly string[];
}>;

type MigrationIdentity = Readonly<{ name: string; checksum: string }>;

/**
 * Exact identities recorded when Stage 2 closed. Checksums are the immutable
 * apply-time values held by Prisma's migration history, not a migration count.
 */
export const GATE4_REQUIRED_STAGE2_MIGRATIONS: readonly MigrationIdentity[] = (
  [
    [
      '20260820121223_extensions_and_arabic_collation',
      'f39a9a42ff79ec2c665e9ade5828366a6bf94f2b83a9207f5f01b8488c55e495',
    ],
    [
      '20260821064928_lookup_tables',
      '637eff709660696fc068d4381f264a306063e7cf349af02f5303b612b15f366b',
    ],
    [
      '20260821075618_lookup_corrections_and_crosswalk',
      '3be2d88d332fa68bd6490718f6c7318c4eca4c7daf651a2d18aaa517c7fab1f9',
    ],
    [
      '20260821082308_people_roster_and_teams',
      '2f708614353e5786d58c98c5658db77f5639196cf70e5c10ed96dbf3f03d4f1f',
    ],
    [
      '20260821114832_alias_completeness',
      'bbff7272c47241c933b3feb749cddf009112842e8e91e95d615f5ffc0885dec7',
    ],
    [
      '20260821121729_merge_name_variant_duplicates',
      'f8ff550483aa5601224a05338893032cc871d35c545f002547bcea91de26140b',
    ],
    [
      '20260821151740_client_branch_resolution',
      '7ef37109cf72b18ad5a86aa9452e25c6d0cd355a9fd7126ccb69ad82e63ade0e',
    ],
    [
      '20260821154211_confirm_legal_opinion_is_a_matter_type',
      'e6634744784b4b05fec0513a69088233d58c6fa8a849ab8043671342f343f22b',
    ],
    [
      '20260821202303_one_primary_alias_per_person',
      '187e7b9c89800c0bfb4b844116094c13f82f064fe305f20dcab4c7babee938d9',
    ],
    [
      '20260821203117_team_composition_postcondition',
      'efaf086b79e580ea6ab90c3e7c1dca3b3d8d5f97d09ae7c360c6abecbcd462ca',
    ],
    [
      '20260822065822_core_schema',
      '512836621c69efe48753fd6a40ab69ae5ae022f17eba06d586c15ec5e0db1dfc',
    ],
    [
      '20260822072541_complete_four_column_lists',
      '0ae455ed3193db8f9c38105cd08be7ffa9a65f01ca87f8da550750ffa2afa005',
    ],
    [
      '20260822073021_junction_tables',
      'aeb4345d0696b15fc9b8d9475ae0fc171646ba70d59b1f44a024f084465ff973',
    ],
    [
      '20260822082441_poa_capacity_and_inventory',
      'e48e13ac82917e0720b712e6805930274edf041711ab76cb1e58818ce00e8b8b',
    ],
    [
      '20260822082711_billing_and_deferred',
      '6e5ce7c45daf3799803f743d20973f00b03cf34f81c25895647047f9a00d883c',
    ],
    [
      '20260822083141_arabic_search',
      'b988b07a0d5a36f9b2eb552dc68c51b1e325708a1a82a0d01504c8ea79d62cde',
    ],
    [
      '20260822124335_billing_column_lists',
      'e5ae7b792cb3c40111cfae122d0b1c7f82159ba625ee153a77dc870ed331868a',
    ],
    [
      '20260822124637_restore_trigram_indexes',
      '9c2cd4ec3085ccfde7a210de2810109cf2c6d12f762ee8e5ebb934a0d4a79def',
    ],
    [
      '20260822144911_invoice_flag_types',
      'f789fa9ac7375f65e291794868f1d0f1ca4a5b04b4c576338359aaaa60c704dd',
    ],
    [
      '20260823073815_remove_j_to_qaf_fold',
      '247572a5717c9e675df28fa15706eaa999eae4aa201215db3f986fdbd1697ee5',
    ],
    [
      '20260823073907_financial_constraints',
      'c20bfd321a94c7b6b23ed0c1d079fb7cdfbb7b17aa1d93e44ad0970b92fa65ed',
    ],
    [
      '20260823080349_court_list_and_crosswalk',
      '3b8d0edbb5db1924f53304b55b4c31e02dfa1d919d5e819b71482aac5cfc1647',
    ],
    [
      '20260823095803_circuit_crosswalk_target',
      '1148b80206be99001c3b8b206b6b16184125053966aac776c26b10781202fe3f',
    ],
    [
      '20260823153000_staging_schema',
      '3bf2c3c105e475a1f2d65e20fb26e9564ca1e9b289422968dc25197612cd3d0e',
    ],
    [
      '20260823170000_quarantine_schema',
      '94a4de0a8049dea7379ba835b6c01bbb915a9289227a5f66053b944a843f7626',
    ],
    [
      '20260823175000_finding_answers',
      '4d3aa8de7775eecd09d1171a19d661ec229c56ce28dc7acbd5a5eb225dae8225',
    ],
    [
      '20260823190000_client_contact_lawyer_raw',
      '025df4c8bd70dad29f5e4a82171ac50be1511e66bdf16c379fcc81de1cf7ac7e',
    ],
    [
      '20260824090000_roster_repairs_and_answer_shapes',
      '3451178a9a3d49c2b49c578ba51547c7256de375cc820ed24aef298f4742b53b',
    ],
    [
      '20260824100000_finding_stable_identity',
      '35c2533be5674aa7dcc747ee7442ce1bd5121ec156eb20b0cb5e1f2fb53a0358',
    ],
    [
      '20260824113000_durable_source_identity',
      '665a3360d0fb9cb9e1d20af3997b245dc6c34a0560a8bea3c7821670d04c21ab',
    ],
    [
      '20260824121500_legacy_workbook_identity',
      '0faa55443bad0802e57e6cce7b9381f427c5e53938d163b6fe20fda369cafad1',
    ],
    [
      '20260824153000_transform_matters',
      'cab09355eb974cca8d9f2bedec2d1fdc4481232640b6e92101f5926da30ca19f',
    ],
    [
      '20260824154500_reviewed_text_edge_whitespace',
      'dce31bd5e1578a64f2bda516583207408e5911e384555f3db0d913ba9253bd37',
    ],
    [
      '20260824210000_transform_matter_relationships',
      'c02ef6dbb6059e1aef09bb902385f52b44720bccdc0393600ce3f38caaf04a2c',
    ],
    [
      '20260824211000_strengthen_relationship_provenance',
      '17da659dfa5d6b37c8bcd34f7dc26d31fd41e83b30473f3717f8b9e1cb95bbda',
    ],
    [
      '20260825090000_attendee_decomposition_audit',
      'c64ee2ca3aabd46a26fbb816effd16bbb911065e4f61adf69d001856ab9626ba',
    ],
    [
      '20260825103000_transform_hearings',
      'e69c52250c490e3f850dc9f3a6f05837ed7c8e690e0bf1bd2b93a284db80b430',
    ],
    [
      '20260825110000_attendee_audit_reference_guard',
      '1ba5a10ad820a3223a0750825f5e912fd4e15134208cf3b376932f1dee0deb9a',
    ],
    [
      '20260825130000_transform_admin_works',
      'c1c2c8a127d75da1ff0cfbb91520a9d1146ec11e92987817c45c4e3c9b3dd0fa',
    ],
    [
      '20260825140000_transform_powers_of_attorney',
      '81083489ce7091f5a8cf802359db2eeda8dd0a53fe6a6a8b84e2556a6b2a1adc',
    ],
    [
      '20260825150000_transform_documents',
      '724db20bc60cc8c73945ae85661f2275f8f71ddd6ce92ef57a94e589341f0601',
    ],
    [
      '20260825160000_transform_fee_letters',
      '5f25b0151886f85bf9797df096e40b34abebcce69bb126ac18b4efcc6c105c1b',
    ],
    [
      '20260825163000_allow_native_fee_letter_references',
      '9e9211ce0129fff466f1641bec39d70a7fd2df8247ccb33b01dbeb9b60a37730',
    ],
    [
      '20260825170000_enforce_poa_match_modes',
      'cd2a5850d85701c6a0b7077f40e608c164bc2ccb9231163c71dd9825d02e97c5',
    ],
    [
      '20260825180000_transform_billing_history',
      '0edd01df98f523e1e504ade7c3d4d98eeda83b746bb47c6fd4b5dd2cf39a1687',
    ],
    [
      '20260826090000_protect_billing_history',
      '2e14a9cb13387fc5e63f8e62a96a0204b4272c4874597bfbc44eca3349b5d4ca',
    ],
    [
      '20260826110000_enforce_complete_billing_provenance',
      '4ed18cfc9cd84ee1a364cd1c78a22165684f220146a05b701b7e2bcc504ed6a9',
    ],
    [
      '20260826130000_enforce_null_safe_billing_provenance',
      '569ec95e147492dadb928698a927f509bc25b75dbf1f629221c4a6ecb2fe398a',
    ],
    [
      '20260826150000_transform_attendance',
      '3a621e767ebad6326eec176e4117e55a12af9f963d52ebc7ce558810202a6d11',
    ],
    [
      '20260826170000_migrate_client_logos',
      'cc9b0643e8dc150f24f657c770d0df8c5ad63e1e99ad4f510bd72f1b8e4c3e7c',
    ],
    [
      '20260830110000_preserve_admin_task_created_date',
      '53b2dfd28e14f83bea9f5e9b5cdf3ff820381cab7b632adf4a2b7b6d67ff9c97',
    ],
  ] as const
).map(([name, checksum]) => ({ name, checksum }));

export const GATE4_STAGE2_REQUIRED_COUNT = 51;
export const GATE4_FINAL_STAGE2_MIGRATION = '20260830110000_preserve_admin_task_created_date';

export const GATE4_APPROVED_CLEAN_ROLLBACKS: readonly MigrationIdentity[] = [
  {
    name: '20260821081746_people_roster_and_teams',
    checksum: '3df109bb59d152baa269767489ac645d8819f132f17cdd0d8cf6d7a02ec8920b',
  },
];

function identityDigest(rows: readonly MigrationIdentity[]): string {
  return createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
}

function state(row: Gate4MigrationHistoryRow): 'applied' | 'clean rollback' | 'unfinished/failed' {
  if (row.finishedAt !== null && row.rolledBackAt === null && row.appliedStepsCount === 1)
    return 'applied';
  if (row.finishedAt === null && row.rolledBackAt !== null && row.appliedStepsCount === 0)
    return 'clean rollback';
  return 'unfinished/failed';
}

export function reconcileGate4Migrations(
  rows: readonly Gate4MigrationHistoryRow[],
): Gate4MigrationEvidence {
  const defects: string[] = [];
  if (GATE4_REQUIRED_STAGE2_MIGRATIONS.length !== GATE4_STAGE2_REQUIRED_COUNT)
    defects.push(
      `required Stage 2 baseline contains ${GATE4_REQUIRED_STAGE2_MIGRATIONS.length}/${GATE4_STAGE2_REQUIRED_COUNT} identities`,
    );
  if (GATE4_REQUIRED_STAGE2_MIGRATIONS.at(-1)?.name !== GATE4_FINAL_STAGE2_MIGRATION)
    defects.push('required Stage 2 baseline does not end at the approved boundary');
  const requiredNames = new Set(GATE4_REQUIRED_STAGE2_MIGRATIONS.map((row) => row.name));
  const rollbackNames = new Set(GATE4_APPROVED_CLEAN_ROLLBACKS.map((row) => row.name));
  const actualRequired: MigrationIdentity[] = [];
  let requiredStage2Proved = 0;

  for (const expected of GATE4_REQUIRED_STAGE2_MIGRATIONS) {
    const matches = rows.filter((row) => row.migrationName === expected.name);
    if (matches.length !== 1) {
      defects.push(`${expected.name}: expected exactly one history row, found ${matches.length}`);
      continue;
    }
    const actual = matches[0]!;
    actualRequired.push({ name: actual.migrationName, checksum: actual.checksum });
    if (state(actual) !== 'applied')
      defects.push(`${expected.name}: required migration is ${state(actual)}`);
    else if (actual.checksum !== expected.checksum)
      defects.push(`${expected.name}: apply-time checksum differs`);
    else requiredStage2Proved += 1;
  }

  for (const expected of GATE4_APPROVED_CLEAN_ROLLBACKS) {
    const matches = rows.filter((row) => row.migrationName === expected.name);
    if (matches.length !== 1) {
      defects.push(
        `${expected.name}: expected one approved clean rollback, found ${matches.length}`,
      );
      continue;
    }
    const actual = matches[0]!;
    if (state(actual) !== 'clean rollback')
      defects.push(`${expected.name}: approved historical row is ${state(actual)}`);
    if (actual.checksum !== expected.checksum)
      defects.push(`${expected.name}: approved rollback checksum differs`);
  }

  const laterAppliedNames: string[] = [];
  const knownNames = new Set([...requiredNames, ...rollbackNames]);
  for (const row of rows.filter((candidate) => !knownNames.has(candidate.migrationName))) {
    if (!/^\d{14}_[a-z0-9_]+$/u.test(row.migrationName)) {
      defects.push(`${row.migrationName}: migration name is malformed`);
      continue;
    }
    if (row.migrationName <= GATE4_FINAL_STAGE2_MIGRATION) {
      defects.push(`${row.migrationName}: unexpected migration at or before the Stage 2 boundary`);
      continue;
    }
    if (state(row) !== 'applied') {
      defects.push(`${row.migrationName}: later migration is ${state(row)}`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/u.test(row.checksum)) {
      defects.push(`${row.migrationName}: later migration checksum is malformed`);
      continue;
    }
    laterAppliedNames.push(row.migrationName);
  }

  const nameCounts = new Map<string, number>();
  for (const row of rows)
    nameCounts.set(row.migrationName, (nameCounts.get(row.migrationName) ?? 0) + 1);
  for (const [name, count] of nameCounts)
    if (count > 1) defects.push(`${name}: duplicate migration history (${count} rows)`);

  laterAppliedNames.sort();
  const applied = rows.filter((row) => state(row) === 'applied');
  const cleanRollbacks = rows.filter((row) => state(row) === 'clean rollback');
  const unfinishedOrFailed = rows.filter((row) => state(row) === 'unfinished/failed');
  return {
    requiredStage2Expected: GATE4_STAGE2_REQUIRED_COUNT,
    requiredStage2Proved,
    requiredStage2Digest: identityDigest(actualRequired),
    finalStage2Migration: GATE4_FINAL_STAGE2_MIGRATION,
    totalApplied: applied.length,
    laterApplied: laterAppliedNames.length,
    laterAppliedNames,
    cleanRollbacks: cleanRollbacks.length,
    cleanRollbackNames: cleanRollbacks.map((row) => row.migrationName).sort(),
    unfinishedOrFailed: unfinishedOrFailed.length,
    defects,
  };
}
