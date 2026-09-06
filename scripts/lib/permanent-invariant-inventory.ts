import assert from 'node:assert/strict';
import type { StaffProfile } from './staff-roster-checkpoint';

/** Frozen inventory of the 93 existing permanent checks. Every historical-only
 * row identifies a concrete non-Git artifact; no security guard is demoted.
 * Phase 1 structural/operational invariants are listed in STAFF_INVARIANTS.
 * Synthetic canonical fixtures must initialize an Administrator before the
 * operational-readiness check; passwordless migration state is checked first. */
export const PERMANENT_INVARIANTS = [
  {
    id: 'DB-001',
    description: 'Task 3.5B current release and protected historical partition',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'Both: exact release schema and guards. Historical: 382 exact dispositions, D41 twelve-hearing set, immutable full-value/event continuity. Canonical: no release, resolution or row-proof payload.',
    expected61: 'Same exact schema, guards and profile-specific release evidence as migration 60.',
  },
  {
    id: 'DB-002',
    description: 'Connects to PostgreSQL',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '16 or newer',
    expected61: '16 or newer',
  },
  {
    id: 'DB-003',
    description: 'Migrations applied',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'at least 1',
    expected61: 'at least 1',
  },
  {
    id: 'DB-004',
    description: 'Search extensions',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'btree_gin, pg_trgm, unaccent',
    expected61: 'btree_gin, pg_trgm, unaccent',
  },
  {
    id: 'DB-005',
    description: 'Arabic survives the driver',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'arabic',
    expected61: 'arabic',
  },
  {
    id: 'DB-006',
    description: 'Arabic sorts correctly',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '… ,… ,بسام last',
    expected61: '… ,… ,بسام last',
  },
  {
    id: 'DB-007',
    description: 'Lookup lists (9)',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'Historical: 138 lookup rows; canonical: 135; every list exact.',
    expected61: 'Historical: 138 lookup rows; canonical: 135; every list exact.',
  },
  {
    id: 'DB-008',
    description: 'One default matter type',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '1',
    expected61: '1',
  },
  {
    id: 'DB-009',
    description: 'Merged spellings removed',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0',
    expected61: '0',
  },
  {
    id: 'DB-010',
    description: 'Merge targets present',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '3',
    expected61: '3',
  },
  {
    id: 'DB-011',
    description: 'تحكيم and تحقيق both kept',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '2',
    expected61: '2',
  },
  {
    id: 'DB-012',
    description: 'Client branch: exact D19 baseline plus applied D39 approvals',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'Historical: 18 named approved branches; canonical: 15; no invented or non-branch rows.',
    expected61:
      'Historical: 18 named approved branches; canonical: 15; no invented or non-branch rows.',
  },
  {
    id: 'DB-013',
    description: 'Crosswalk rules resolve',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '204 rules, 0 dangling, 0 unrecognised',
    expected61: '204 rules, 0 dangling, 0 unrecognised',
  },
  {
    id: 'DB-014',
    description: 'No lookup value is also a crosswalk source',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 chains',
    expected61: '0 chains',
  },
  {
    id: 'DB-015',
    description: 'Court list and crosswalk',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'Historical: 309 courts; canonical: 308; both: 94 exact rules.',
    expected61: 'Historical: 309 courts; canonical: 308; both: 94 exact rules.',
  },
  {
    id: 'DB-016',
    description: '`26` is a circuit, court unknown',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: "circuit '26', not in lookup_court, 1 discard (/)",
    expected61: "circuit '26', not in lookup_court, 1 discard (/)",
  },
  {
    id: 'DB-017',
    description: 'Separate-client rules (rule b)',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '3',
    expected61: '3',
  },
  {
    id: 'DB-018',
    description: 'Reviewed links unchanged',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '348 reviewed alias mappings plus 204 crosswalk rules; no changed mapping.',
    expected61:
      '348 reviewed alias mappings plus 204 crosswalk rules; no changed mapping. Original names use the verified stable-ID snapshot; current operational identity is checked independently.',
  },
  {
    id: 'DB-019',
    description: 'Protected Stage 2 roster figures (9)',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '135/348/64/21/43/71/2/5/16',
    expected61:
      '135/348/64/21/43/71/2/5/16; historical names/state are read from the verified stable-ID snapshot, while current operational state is verified independently.',
  },
  {
    id: 'DB-020',
    description: 'No two people share a normalised name',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 collisions',
    expected61: '0 collisions',
  },
  {
    id: 'DB-021',
    description: 'Every person findable by their own name',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 unfindable',
    expected61: '0 unfindable',
  },
  {
    id: 'DB-022',
    description: 'Hamza pairs resolve to one person',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '2 pairs, 0 problems',
    expected61:
      '2 pairs, 0 problems; historical names/state are read from the verified stable-ID snapshot, while current operational state is verified independently.',
  },
  {
    id: 'DB-023',
    description: 'One primary alias per person',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'every person exactly 1, and it is their own name',
    expected61: 'every person exactly 1, and it is their own name',
  },
  {
    id: 'DB-024',
    description: 'The one-primary index still exists',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'present',
    expected61: 'present',
  },
  {
    id: 'DB-025',
    description: 'Teams: exact reviewer and membership',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '2 teams, 4 named members each, reviewer ناجي رمضان',
    expected61:
      '2 teams, 4 named members each, reviewer ناجي رمضان; historical names/state are read from the verified stable-ID snapshot, while current operational state is verified independently.',
  },
  {
    id: 'DB-026',
    description: 'Core schema: 23 tables, 21 raw columns',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'all present',
    expected61: 'all present',
  },
  {
    id: 'DB-027',
    description: 'No placeholder or complex columns',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0',
    expected61: '0',
  },
  {
    id: 'DB-028',
    description: 'Stage 2 can never reject a row',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '15 links + payments.payment_date, all nullable',
    expected61: '15 links + payments.payment_date, all nullable',
  },
  {
    id: 'DB-029',
    description: 'D9 case numbers, D15 logos as files',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'case_number_ar is text, client_logos holds no binary',
    expected61: 'case_number_ar is text, client_logos holds no binary',
  },
  {
    id: 'DB-030',
    description: 'Guards do their job, not just exist',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '9 checks validated + 2 unique partial indexes + 0 matters with two leads',
    expected61: '9 checks validated + 2 unique partial indexes + 0 matters with two leads',
  },
  {
    id: 'DB-031',
    description: 'Billing: exact money, no Pay-Date',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'numeric amounts, Pay-Date absent',
    expected61: 'numeric amounts, Pay-Date absent',
  },
  {
    id: 'DB-032',
    description: 'Invoice shares sum to 1',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 out, 0 null shares',
    expected61: '0 out, 0 null shares',
  },
  {
    id: 'DB-033',
    description: 'Allocations all reach an invoice',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 unresolved',
    expected61: '0 unresolved',
  },
  {
    id: 'DB-034',
    description: 'Billing lookups: 11 exact codes',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '11 present, none translated',
    expected61: '11 present, none translated',
  },
  {
    id: 'DB-035',
    description: 'Arabic search folds, and does not over-fold',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '10 of 10',
    expected61: '10 of 10',
  },
  {
    id: 'DB-036',
    description: 'Normalised columns agree (all 7)',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 rows out of step',
    expected61: '0 rows out of step',
  },
  {
    id: 'DB-037',
    description: 'Search triggers and indexes do their job',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '7 triggers enabled and correct, 7 trigram indexes',
    expected61: '7 triggers enabled and correct, 7 trigram indexes',
  },
  {
    id: 'DB-038',
    description: 'Staging tables exist',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '20 (17 extracted + 3 complex)',
    expected61: '20 (17 extracted + 3 complex)',
  },
  {
    id: 'DB-039',
    description: 'Staging columns',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '284 (204 from Access + 20 x 4 provenance and identity)',
    expected61: '284 (204 from Access + 20 x 4 provenance and identity)',
  },
  {
    id: 'DB-040',
    description: 'Staging cannot refuse a row',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'every source column text, nullable, no default',
    expected61: 'every source column text, nullable, no default',
  },
  {
    id: 'DB-041',
    description: 'Staging has no constraints on source data',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'no checks, no foreign keys, no unique constraints',
    expected61: 'no checks, no foreign keys, no unique constraints',
  },
  {
    id: 'DB-042',
    description: 'Staging rows trace back to their origin',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '20 primary keys on (src_file, src_row_num)',
    expected61: '20 primary keys on (src_file, src_row_num)',
  },
  {
    id: 'DB-043',
    description: 'Staging durable source identity',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'Historical: exact extraction identity. Canonical: all 20 staging tables empty, extraction fingerprint absent, all identity functions/indexes exact.',
    expected61:
      'Historical: exact extraction identity. Canonical: all 20 staging tables empty, extraction fingerprint absent, all identity functions/indexes exact.',
  },
  {
    id: 'DB-044',
    description: 'Quarantine tables exist',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '20 (the 16 prior tables, three billing evidence tables and Attendance evidence)',
    expected61: '20 (the 16 prior tables, three billing evidence tables and Attendance evidence)',
  },
  {
    id: 'DB-045',
    description: 'Quarantine can record a missing value',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'finding.original_value is nullable',
    expected61: 'finding.original_value is nullable',
  },
  {
    id: 'DB-046',
    description: 'Every finding explains itself',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 with a blank explanation',
    expected61: '0 with a blank explanation',
  },
  {
    id: 'DB-047',
    description: 'No row is both quarantined and excluded',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 rows in two states',
    expected61: '0 rows in two states',
  },
  {
    id: 'DB-048',
    description: "Quarantine will not discard the firm's answers",
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'the truncate guard is installed',
    expected61: 'the truncate guard is installed',
  },
  {
    id: 'DB-049',
    description: 'Quarantine answers stay on their source records',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'durable constraint, 3 exact triggers, 0 orphaned identities',
    expected61: 'durable constraint, 3 exact triggers, 0 orphaned identities',
  },
  {
    id: 'DB-050',
    description: 'Historic workbook identities cannot drift',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'Both: exact identity constraints and triggers; historical: 744 exact immutable associations; canonical: zero associations and null aggregate digest',
    expected61:
      'Same exact constraints, triggers and profile-specific association evidence as migration 60',
  },
  {
    id: 'DB-051',
    description: "The firm's original 744 answers remain attached to the same values",
    scope: 'historical-full-state',
    historicalArtifact:
      'The original 744 review-answer values, notes and decisions in quarantine.review_value and quarantine.finding; Git contains their frozen digest, not the payload.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60: '668 value answers + 76 finding answers, exact reviewed payload',
    expected61: '668 value answers + 76 finding answers, exact reviewed payload',
  },
  {
    id: 'DB-052',
    description: 'Every staged client was transformed',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'Historical: 318 staged clients and 318 targets; canonical: both zero.',
    expected61: 'Historical: 318 staged clients and 318 targets; canonical: both zero.',
  },
  {
    id: 'DB-053',
    description: 'Every staged contact was transformed',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'Historical: 188 staged contacts and 188 targets; canonical: both zero; no orphan contacts.',
    expected61:
      'Historical: 188 staged contacts and 188 targets; canonical: both zero; no orphan contacts.',
  },
  {
    id: 'DB-054',
    description: 'Cleared values still differ from never-entered',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'Historical: two explicitly cleared Cash/probono values remain empty strings; canonical: both source and target zero.',
    expected61:
      'Historical: two explicitly cleared Cash/probono values remain empty strings; canonical: both source and target zero.',
  },
  {
    id: 'DB-055',
    description: 'contactLawyer preserved byte for byte',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 differing from staging',
    expected61: '0 differing from staging',
  },
  {
    id: 'DB-056',
    description: 'Nothing was guessed into branch or contact_person',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '0 rows',
    expected61: '0 rows',
  },
  {
    id: 'DB-057',
    description: 'Matter transform safeguards still exist',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: '21/1/1/6/2/2/1 and reviewed key exact',
    expected61: '21/1/1/6/2/2/1 and reviewed key exact',
  },
  {
    id: 'DB-058',
    description: 'Matter safeguard definitions are exact',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'source identity, index, branch FK, triggers and functions exact',
    expected61: 'source identity, index, branch FK, triggers and functions exact',
  },
  {
    id: 'DB-059',
    description: 'Every staged matter has one safe destination (historical partition)',
    scope: 'historical-full-state',
    historicalArtifact:
      'The complete staged litigation extraction and its 1,689 historical matter targets plus 55 quarantine dispositions.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60: '1,744 = 1,689 historical targets + 55 preserved quarantine records; 0 defects',
    expected61: '1,744 = 1,689 historical targets + 55 preserved quarantine records; 0 defects',
  },
  {
    id: 'DB-060',
    description: 'Matter target fields and quarantine evidence reconcile',
    scope: 'historical-full-state',
    historicalArtifact:
      'The original 1,744 staged matter payloads and reviewed quarantine values, not reproduced by schema migrations.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '1,744 = 1,689 transformed + 55 quarantined; every target field and quarantine value exact',
    expected61:
      '1,744 = 1,689 transformed + 55 quarantined; every target field and quarantine value exact',
  },
  {
    id: 'DB-061',
    description: 'Matter lawyers and parties reconcile to source',
    scope: 'historical-full-state',
    historicalArtifact:
      'The staged matter lawyer/party cells and reviewed per-cell relationship outcomes from the historical extraction.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60: '33 rules + 84 ordered members + 38 exclusions; every source cell exact',
    expected61: '33 rules + 84 ordered members + 38 exclusions; every source cell exact',
  },
  {
    id: 'DB-062',
    description: 'Corrected-rule current extraction evidence',
    scope: 'historical-full-state',
    historicalArtifact:
      'Exact occurrences in the original staged powers-of-attorney and matter extraction used by the corrected relationship rules.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60: 'POA 8/0/1; matter lawyers 0/0/0',
    expected61: 'POA 8/0/1; matter lawyers 0/0/0',
  },
  {
    id: 'DB-063',
    description: 'Matter relationship constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      '3 exact CHECKs, 5 exact unique indexes, 4 exact foreign keys, 2 exact triggers/functions; Git-owned 33 rules, 84 ordered members and 38 exclusions match every field.',
    expected61: 'Same exact structural and Git-owned rule-payload evidence as migration 60.',
  },
  {
    id: 'DB-064',
    description: 'Attendee source cells and spans reconcile',
    scope: 'historical-full-state',
    historicalArtifact:
      'The 12,732 imported attendee cells, complete byte spans and reviewed decomposition ledger.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60: '12,732 cells; every byte, span, answer, person and quarantine item exact',
    expected61: '12,732 cells; every byte, span, answer, person and quarantine item exact',
  },
  {
    id: 'DB-065',
    description: 'Attendee audit constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'complete cell/span/quarantine constraints, indexes, foreign keys, triggers and functions',
    expected61:
      'complete cell/span/quarantine constraints, indexes, foreign keys, triggers and functions',
  },
  {
    id: 'DB-066',
    description: 'Hearings, attendees and quarantine reconcile',
    scope: 'historical-full-state',
    historicalArtifact:
      'The imported hearing/attendee source rows, typed targets and quarantine outcomes.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '13,382 = 13,055 transformed + 327 quarantined; 8,884 attendees; every value and evidence item exact',
    expected61:
      '13,382 = 13,055 transformed + 327 quarantined; 8,884 attendees; every value and evidence item exact',
  },
  {
    id: 'DB-067',
    description: 'Hearing transform constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'complete provenance constraints, unique indexes, foreign keys and quarantine protections',
    expected61:
      'complete provenance constraints, unique indexes, foreign keys and quarantine protections',
  },
  {
    id: 'DB-068',
    description: 'Administrative works and task steps reconcile',
    scope: 'historical-full-state',
    historicalArtifact:
      'The staged administrative task and task-action payloads and their historical transformation evidence.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60: 'every staged task and step is exactly transformed or quarantined',
    expected61: 'every staged task and step is exactly transformed or quarantined',
  },
  {
    id: 'DB-069',
    description: 'Administrative task business creation dates',
    scope: 'historical-full-state',
    historicalArtifact:
      'The 3,694 migrated administrative tasks and their 1,906 recorded source dates; Git contains the frozen digest, not these source rows.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '3,694 migrated tasks: 1,906 source dates, 1,788 genuine nulls, range 2018-02-22 to 2026-08-18; never created_at',
    expected61:
      '3,694 migrated tasks: 1,906 source dates, 1,788 genuine nulls, range 2018-02-22 to 2026-08-18; never created_at',
  },
  {
    id: 'DB-070',
    description: 'Administrative transform constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'complete provenance constraints, unique indexes and immutable quarantine definitions',
    expected61:
      'complete provenance constraints, unique indexes and immutable quarantine definitions',
  },
  {
    id: 'DB-071',
    description: 'Administrative court `26` remains circuit-only',
    scope: 'historical-full-state',
    historicalArtifact: 'The one specific imported administrative task whose raw court is 26.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60: 'the one reviewed row has circuit 26, no court, and raw court 26',
    expected61: 'the one reviewed row has circuit 26, no court, and raw court 26',
  },
  {
    id: 'DB-072',
    description: 'Powers of attorney reconcile to source and reviewed relationships',
    scope: 'historical-full-state',
    historicalArtifact:
      'The 752 imported power-of-attorney payloads and their reviewed relationship outcomes.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '752 source records; every value, typed field, reviewed member and evidence row exact',
    expected61:
      '752 source records; every value, typed field, reviewed member and evidence row exact',
  },
  {
    id: 'DB-073',
    description: 'POA constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'complete PostgreSQL 17.11 definitions, including function configuration',
    expected61: 'complete PostgreSQL 17.11 definitions, including function configuration',
  },
  {
    id: 'DB-074',
    description: 'Paper documents reconcile to source and reviewed relationships',
    scope: 'historical-full-state',
    historicalArtifact: 'The 407 imported paper-document payloads and reviewed links.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '407 source records; every scalar, typed value, raw value, link and evidence row exact',
    expected61:
      '407 source records; every scalar, typed value, raw value, link and evidence row exact',
  },
  {
    id: 'DB-075',
    description: 'Document constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'complete PostgreSQL 17.11 definitions, including function configuration',
    expected61: 'complete PostgreSQL 17.11 definitions, including function configuration',
  },
  {
    id: 'DB-076',
    description: 'Fee letters and both matter-link directions reconcile',
    scope: 'historical-full-state',
    historicalArtifact:
      'The 331 imported fee letters, 288 source forward links and 412 source reverse references.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '331 fee letters; 288 forward links; 412 reverse references; every value, rule and evidence row exact',
    expected61:
      '331 fee letters; 288 forward links; 412 reverse references; every value, rule and evidence row exact',
  },
  {
    id: 'DB-077',
    description: 'Fee-letter constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'complete PostgreSQL 17.11 definitions, including function configuration',
    expected61: 'complete PostgreSQL 17.11 definitions, including function configuration',
  },
  {
    id: 'DB-078',
    description: 'Billing history and immutable evidence reconcile',
    scope: 'historical-full-state',
    historicalArtifact:
      'The 543 historical invoices, 597 payments, 47 allocation rows and immutable import evidence.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '543 invoices; 597 payments; 47 allocation rows in 15 exact-one groups; no source loss',
    expected61:
      '543 invoices; 597 payments; 47 allocation rows in 15 exact-one groups; no source loss',
  },
  {
    id: 'DB-079',
    description: 'Billing constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'complete PostgreSQL 17.11 definitions, including function configuration',
    expected61: 'complete PostgreSQL 17.11 definitions, including function configuration',
  },
  {
    id: 'DB-080',
    description: 'Staff attendance reconciles to the leave register',
    scope: 'historical-full-state',
    historicalArtifact:
      'The 4,022 original staff-attendance extraction rows and immutable import ledger.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '4,022 source rows; every exact value, alias, date and provenance field has one target or quarantine outcome',
    expected61:
      '4,022 source rows; every exact value, alias, date and provenance field has one target or quarantine outcome',
  },
  {
    id: 'DB-081',
    description: 'Attendance constraints and evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'complete PostgreSQL 17.11 definitions, including function configuration',
    expected61: 'complete PostgreSQL 17.11 definitions, including function configuration',
  },
  {
    id: 'DB-082',
    description: 'Migrated client logos reconcile to source and files',
    scope: 'historical-full-state',
    historicalArtifact:
      'The 54 original extracted logo payloads/files and their byte-identical immutable import records.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '54 immutable import rows, 54 clients, exact source/result digests and every referenced file valid',
    expected61:
      '54 immutable import rows, 54 clients, exact source/result digests and every referenced file valid',
  },
  {
    id: 'DB-083',
    description: 'Client-logo constraints and import evidence guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'complete PostgreSQL 17.11 definitions, including function configuration',
    expected61: 'complete PostgreSQL 17.11 definitions, including function configuration',
  },
  {
    id: 'DB-084',
    description: 'Task 3.1 initial identities and authentication state',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'four exact account/person/alias mappings; 135 protected canonical people plus two named native additions; valid eligibility and password states',
    expected61:
      'four exact account/person/alias mappings; 135 protected canonical people plus two named native additions; valid eligibility and password states; historical names/state are read from the verified stable-ID snapshot, while current operational state is verified independently.',
  },
  {
    id: 'DB-085',
    description: 'Authentication constraints and security guards',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60: 'complete PostgreSQL 17.11 definitions, including function configuration',
    expected61: 'complete PostgreSQL 17.11 definitions, including function configuration',
  },
  {
    id: 'DB-086',
    description: 'Task 3.4 operational Administrator readiness',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'At least one usable Administrator. Canonical acceptance initializes a generated disposable password only after asserting the exact passwordless migration-owned state.',
    expected61:
      'At least one usable Administrator; legitimate lifecycle mutations may not remove the last usable Administrator.',
  },
  {
    id: 'DB-087',
    description: 'Task 3.3A actor schema and trigger enforcement',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'exact 38-table boundary, 76 foreign keys/indexes and immutable registry/context functions',
    expected61:
      'exact 38-table boundary, 76 foreign keys/indexes and immutable registry/context functions',
  },
  {
    id: 'DB-088',
    description: 'Task 3.3A complete runtime principal and ACL boundary',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'exact schemas, zero explicit inbound/outbound memberships, ACL provenance, columns, sequences, functions, MAINTAIN and session_replication_role refusal',
    expected61:
      'exact schemas, zero explicit inbound/outbound memberships, ACL provenance, columns, sequences, functions, MAINTAIN and session_replication_role refusal',
  },
  {
    id: 'DB-089',
    description: 'Task 3.3A/3.4 truthful actor registry and current attribution',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'Three exact system actors, four original human mappings, one immutable actor per current account. Historical: 45,463 migration creations and at most four original unknown update actors. Canonical: independently approved initial actor/creation profile.',
    expected61:
      'Same exact actor registry and immutable audit attribution contract; historical 45,463 creation population retained, canonical accepted initial profile plus synthetic operational fixtures.',
  },
  {
    id: 'DB-090',
    description: 'Protected 5,209-row business and timestamp projection',
    scope: 'historical-full-state',
    historicalArtifact:
      'The original 5,209 billing/attendance rows, original stable IDs and original timestamps.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60:
      '5,209 rows; SHA-256 b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab.',
    expected61: 'Same 5,209 rows and exact protected SHA-256 as migration 60.',
  },
  {
    id: 'DB-091',
    description: 'Frozen Task 3.3A audit-attribution projection',
    scope: 'historical-full-state',
    historicalArtifact:
      'The historical-live Task 3.3A attribution snapshot for 45,463 imported creations; canonical replay has a distinct already-approved audit baseline.',
    command: 'tsx scripts/check-db.ts --profile=historical-full-state-upgrade',
    expected60: 'SHA-256 edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d.',
    expected61: 'Same frozen historical attribution SHA-256 as migration 60.',
  },
  {
    id: 'DB-092',
    description: 'Task 3.3B append-only event structure',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'exact tables, allowlists, triggers, keyset indexes, fixed-path functions and runtime grants',
    expected61:
      'exact tables, allowlists, triggers, keyset indexes, fixed-path functions and runtime grants',
  },
  {
    id: 'DB-093',
    description: 'Task 3.3B truthful baseline checkpoint',
    scope: 'both',
    historicalArtifact: null,
    command:
      'tsx scripts/check-db.ts --profile=<historical-full-state-upgrade|canonical-clean-replay>',
    expected60:
      'One first baseline event, with the exact independently approved historical or canonical aggregates and frozen immutable digests.',
    expected61:
      'Same unchanged historical/canonical audit checkpoint definitions and frozen digests; new events must remain truthful and secret-free.',
  },
] as const;

export function permanentInvariant(name: string) {
  const rows = PERMANENT_INVARIANTS.filter((row) => row.description === name);
  assert.equal(rows.length, 1, 'Unclassified or duplicate permanent invariant: ' + name);
  return rows[0]!;
}
export function requiredPermanentInvariants(profile: StaffProfile) {
  return PERMANENT_INVARIANTS.filter(
    (row) => profile === 'historical-full-state-upgrade' || row.scope === 'both',
  );
}
