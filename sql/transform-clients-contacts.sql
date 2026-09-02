-- =========================================================================
--  STAGE D — TRANSFORM: CLIENTS AND CONTACTS (task 2.5)
--
--      npm run transform:clients
--
--  Reads `staging`, writes `public.clients` and `public.contacts`. Runs in
--  ONE transaction with its assertions inside it, so a failure leaves the
--  target tables exactly as they were.
--
--  SAFE TO RE-RUN. Both tables are rebuilt from staging, which is itself
--  rebuilt from the extraction. Nothing here holds a human decision — the
--  firm's answers live in `quarantine`, which this never touches.
--
--  WHAT IS DELIBERATELY NOT SET, AND WHY
--
--  `branch_id` / `legacy_branch_raw` — the source column `clientBranch` is on
--  the MATTER, not the client, and 8 of the 12 clients that have any branch
--  at all have SEVERAL: أدخنة النخلة has eight. A single column on the client
--  cannot hold them, and `legacy_branch_raw` could keep only one of the eight
--  original texts, which breaks the `_raw` rule outright. Left null pending
--  the firm's decision. See task 2.6.
--
--  `contact_person_id` — "the main person to contact" is a field of the new
--  model; Access has no equivalent. Choosing one of a client's contacts
--  would be inventing data (rule 4). Left null for the firm to set in the
--  application.
--
--  `contactLawyer` is preserved verbatim in `legacy_contact_lawyer_raw`
--  (migration 0027). It names a FIRM lawyer and has no modelled column yet.
-- =========================================================================

BEGIN;
SELECT public.audit_set_migration_context();
SELECT public.audit_set_event_context(
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  NULL,
  'controlled-maintenance:task-2-5-clients-contacts',
  'system'
);

--  Rebuilt from staging every run. Contacts first: it references clients.
DELETE FROM contacts;
DELETE FROM clients;

-- -------------------------------------------------------------------------
--  CLIENTS
--
--  Dates are cast ONLY when they look like dates. Every value in the file
--  does today — but a transform that casts unconditionally is one bad row
--  away from failing outright, and the rule is that an unparseable value is
--  quarantined, never a reason to reject the row.
-- -------------------------------------------------------------------------
--  `updated_at` is set explicitly. Prisma's @updatedAt is applied by the
--  CLIENT, not by the database — there is no default and no trigger, so a
--  raw INSERT that omits it violates NOT NULL. Worth knowing before writing
--  another transform: every one of them has to set it.
INSERT INTO clients (
    legacy_id, name_ar, name_en, full_name,
    cash_or_probono, status, poa_location, documents_location,
    client_start, client_end, legacy_contact_lawyer_raw,
    created_at, updated_at
)
SELECT
    c."ID_client"::integer,
    c."العميل",
    c."Client_en",
    c."Full_name",
    --  NOT normalised, NOT case-folded. `Probono` (30) and `probono` (5) are
    --  almost certainly one value, and "almost certainly" is not a licence to
    --  merge them — محكمة/محكمه/مجكمة looked equally obvious and needed the
    --  firm. The question is on the review sheet.
    --
    --  The two EMPTY STRINGS here are the two cells preserved end to end from
    --  the extraction: clients where somebody typed something and cleared it,
    --  against 316 where a value was entered. They stay '' and not NULL.
    c."Cash/probono",
    c."Status",
    c."مكان التوكيل",
    c."مكان المستندات",
    CASE WHEN c."clientStart" ~ '^\d{4}-\d{2}-\d{2}' THEN c."clientStart"::timestamp::date END,
    CASE WHEN c."clientEnd"   ~ '^\d{4}-\d{2}-\d{2}' THEN c."clientEnd"::timestamp::date   END,
    c."contactLawyer",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM staging."العملاء" c
 ORDER BY c."ID_client"::integer;

-- -------------------------------------------------------------------------
--  CONTACTS
--
--  `Contact1` is the person (97% filled) and `Full_name` is something else
--  entirely — on the row for `Ahmed Shawki Montasser` it holds
--  `شركة أبو زعبل للأسمدة والمواد الكيماوية`, the company. Both are kept,
--  under names that say what they actually are. The placeholder columns
--  `name_ar` / `name_en` were dropped at task 1.3 for exactly this reason.
-- -------------------------------------------------------------------------
INSERT INTO contacts (
    legacy_id, client_id, contact_name, full_name, job_title, email,
    business_phone, home_phone, mobile_phone, fax_number,
    address, city, state_province, zip_postal_code, country_region, web_page,
    created_at, updated_at
)
SELECT
    ct."ID"::integer,
    cl.id,
    ct."Contact1",
    ct."Full_name",
    ct."Job Title",
    ct."E-mail Address",
    ct."Business Phone",
    ct."Home Phone",
    ct."Mobile Phone",
    ct."Fax Number",
    ct."Address",
    ct."City",
    ct."State/Province",
    ct."ZIP/Postal Code",
    ct."Country/Region",
    ct."Web Page",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM staging."Contacts" ct
  LEFT JOIN clients cl ON cl.legacy_id = ct."clientID"::integer
 ORDER BY ct."ID"::integer;

-- -------------------------------------------------------------------------
--  ASSERTIONS
--
--  Every one of these compares the target against STAGING, which Gate 2 has
--  already proved equals the extraction. Nothing is compared against a
--  remembered figure: 318 and 188 are read, not written down.
-- -------------------------------------------------------------------------
DO $TRANSFORM$
DECLARE
    staged_clients  bigint;
    staged_contacts bigint;
    n               bigint;
    m               bigint;
BEGIN
    SELECT count(*) INTO staged_clients  FROM staging."العملاء";
    SELECT count(*) INTO staged_contacts FROM staging."Contacts";

    --  1. Every row arrives. Not approximately.
    SELECT count(*) INTO n FROM clients;
    IF n <> staged_clients THEN
        RAISE EXCEPTION 'clients: % rows, staging holds %', n, staged_clients;
    END IF;
    SELECT count(*) INTO n FROM contacts;
    IF n <> staged_contacts THEN
        RAISE EXCEPTION 'contacts: % rows, staging holds %', n, staged_contacts;
    END IF;
    RAISE NOTICE 'PROVED: % clients and % contacts, exactly as staged', staged_clients, staged_contacts;

    --  2. Every staged client is findable by its Access id, once. A count
    --     that matches can still be the wrong rows.
    SELECT count(*) INTO n
      FROM staging."العملاء" s
     WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.legacy_id = s."ID_client"::integer);
    IF n > 0 THEN
        RAISE EXCEPTION 'clients: % staged clients have no target row', n;
    END IF;
    SELECT count(*) INTO n FROM (SELECT legacy_id FROM clients GROUP BY legacy_id HAVING count(*) > 1) z;
    IF n > 0 THEN
        RAISE EXCEPTION 'clients: % legacy ids appear more than once', n;
    END IF;
    RAISE NOTICE 'PROVED: every staged client has exactly one target row, found by its Access id';

    --  3. Every contact reaches its client. Access enforces this and Gate 3
    --     found no orphans, so anything else here is a fault in this file.
    SELECT count(*) INTO n FROM contacts WHERE client_id IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'contacts: % rows did not find their client', n;
    END IF;
    RAISE NOTICE 'PROVED: all % contacts reached their client', staged_contacts;

    --  4. THE TWO EMPTY STRINGS, end to end.
    --
    --  This is the whole NULL-versus-'' argument arriving at its destination.
    --  Two clients had something typed into Cash/probono and cleared; 316 had
    --  a value entered. If this transform had trimmed, coalesced or
    --  normalised, those two would now be indistinguishable from "never
    --  entered" — and nothing would look wrong.
    SELECT count(*) FILTER (WHERE "Cash/probono" = ''),
           count(*) FILTER (WHERE "Cash/probono" IS NULL)
      INTO n, m FROM staging."العملاء";
    IF (SELECT count(*) FROM clients WHERE cash_or_probono = '') <> n THEN
        RAISE EXCEPTION 'clients: % empty-string cash_or_probono, staging holds %',
            (SELECT count(*) FROM clients WHERE cash_or_probono = ''), n;
    END IF;
    IF (SELECT count(*) FROM clients WHERE cash_or_probono IS NULL) <> m THEN
        RAISE EXCEPTION 'clients: NULL cash_or_probono does not match staging';
    END IF;
    RAISE NOTICE 'PROVED: % cleared and % never-entered cash_or_probono values still tell apart', n, m;

    --  5. The dates that could be parsed, were; and no row was lost to one
    --     that could not.
    SELECT count(*) FILTER (WHERE "clientStart" ~ '^\d{4}-\d{2}-\d{2}')
      INTO n FROM staging."العملاء";
    IF (SELECT count(*) FROM clients WHERE client_start IS NOT NULL) <> n THEN
        RAISE EXCEPTION 'clients: % client_start values, % were parseable in staging',
            (SELECT count(*) FROM clients WHERE client_start IS NOT NULL), n;
    END IF;
    SELECT count(*) INTO m FROM staging."العملاء"
     WHERE "clientStart" IS NOT NULL AND "clientStart" !~ '^\d{4}-\d{2}-\d{2}';
    IF m > 0 THEN
        RAISE NOTICE 'NOTE: % client_start values could not be parsed and are null in the target; the original text is in staging', m;
    END IF;
    RAISE NOTICE 'PROVED: % client_start dates parsed, % unparseable, 0 rows lost either way', n, m;

    --  6. The lawyer text survived, all of it.
    SELECT count(*) FILTER (WHERE "contactLawyer" IS NOT NULL) INTO n FROM staging."العملاء";
    IF (SELECT count(*) FROM clients WHERE legacy_contact_lawyer_raw IS NOT NULL) <> n THEN
        RAISE EXCEPTION 'clients: legacy_contact_lawyer_raw holds % of % staged values',
            (SELECT count(*) FROM clients WHERE legacy_contact_lawyer_raw IS NOT NULL), n;
    END IF;
    --  ...byte for byte, not merely present. A count would be satisfied by
    --  123 trimmed or re-cased values.
    SELECT count(*) INTO m
      FROM staging."العملاء" s
      JOIN clients c ON c.legacy_id = s."ID_client"::integer
     WHERE c.legacy_contact_lawyer_raw IS DISTINCT FROM s."contactLawyer";
    IF m > 0 THEN
        RAISE EXCEPTION 'clients: % contactLawyer values differ from staging', m;
    END IF;
    RAISE NOTICE 'PROVED: all % contactLawyer values preserved byte for byte', n;

    --  7. Nothing was invented in the two columns that are deliberately empty.
    SELECT count(*) INTO n FROM clients WHERE branch_id IS NOT NULL OR legacy_branch_raw IS NOT NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'clients: % rows carry a branch, which this transform must not set', n;
    END IF;
    SELECT count(*) INTO n FROM clients WHERE contact_person_id IS NOT NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'clients: % rows carry a contact_person_id, which this transform must not guess', n;
    END IF;
    RAISE NOTICE 'PROVED: branch and contact_person_id left empty, not guessed';
END
$TRANSFORM$;

COMMIT;
