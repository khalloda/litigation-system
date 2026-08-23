-- =========================================================================
--  0027 — KEEP `contactLawyer` (task 2.5)
--
--  `العملاء.contactLawyer` names the FIRM'S LAWYER responsible for a client:
--  `أحمد سعيد`, `ناجي رمضان`, `د. هاني سري الدين`. 123 of 318 clients carry
--  one, across 11 spellings.
--
--  IT HAS NOWHERE TO GO. `clients.contact_person_id` is not it — that column
--  references `contacts`, and means the client's own contact person, the
--  person you ring at their office. A firm lawyer is a `people` row. There is
--  no column on `clients` for one.
--
--  Whether there should be is a decision for the firm, not for this
--  migration. What is NOT a decision is whether the text survives: rule 7
--  says nothing is deleted, and the `_raw` rule says a value that cannot yet
--  be mapped keeps its original text beside it.
--
--  So this column preserves it verbatim, and commits to nothing. If the firm
--  wants a `responsible_person_id`, the raw text is here to derive it from.
--  If they do not, the text is still here and the information is not lost.
-- =========================================================================

ALTER TABLE clients ADD COLUMN legacy_contact_lawyer_raw text;

COMMENT ON COLUMN clients.legacy_contact_lawyer_raw IS
    'العملاء.contactLawyer, byte for byte. The firm lawyer responsible for this client. Preserved because there is no modelled column for it yet; see task 2.5. Never parsed, never resolved — the raw text only.';

DO $RAW$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'clients'
       AND column_name = 'legacy_contact_lawyer_raw' AND is_nullable = 'YES';
    IF n <> 1 THEN
        RAISE EXCEPTION 'clients.legacy_contact_lawyer_raw is missing or not nullable';
    END IF;
    RAISE NOTICE 'clients.legacy_contact_lawyer_raw added';
END
$RAW$;
