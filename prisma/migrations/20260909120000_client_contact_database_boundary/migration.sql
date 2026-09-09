BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.clients,public.contacts IN ACCESS EXCLUSIVE MODE;
LOCK TABLE staging."العملاء",staging."Contacts",public.audit_events,public.audit_actors IN SHARE MODE;

-- D52-D57: one forward boundary. The project remains at 61 until separately
-- authorized deployment. No source, accepted digest or historical row is reset.
DO $precondition$
DECLARE profile text; inventory jsonb; item jsonb; actual jsonb; source_count integer;
BEGIN
  IF session_user<>current_user OR NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=session_user),false) THEN
    RAISE EXCEPTION 'D35 direct migration principal required';
  END IF;
  IF (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>61
    OR NOT EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name='20260906180000_staff_roster_database_boundary' AND checksum='87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND applied_steps_count=1)
    OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='_migration' AND tablename LIKE 'client_contact_%')
    OR EXISTS(SELECT 1 FROM pg_views WHERE schemaname='_migration' AND viewname LIKE 'client_contact_%')
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.proname LIKE 'client_contact_%')
    OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('clients','contacts') AND column_name IN ('row_version','is_archived','is_application_native','application_modified_at','application_modified_by')) THEN
    RAISE EXCEPTION 'Exact complete migration-61 client/contact prestate required';
  END IF;
  SELECT b.profile INTO STRICT profile FROM _migration.staff_roster_boundary b;
  IF profile='historical-full-state-upgrade' THEN
    SELECT before_inventory INTO STRICT inventory FROM _migration.high_impact_application
      WHERE plan_sha256='4a1fee01d011b960f48204102e28ed71731a5f1d682006141749460828e33da3';
    IF _migration.current_staging_fingerprint() IS DISTINCT FROM '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979' THEN RAISE EXCEPTION 'Original source fingerprint differs'; END IF;
    -- This pre-existing receipt includes actual system IDs, Access IDs,
    -- ownership, original values and timestamps. Counts alone cannot prove it.
    FOR item IN SELECT value FROM jsonb_array_elements(inventory) WHERE value->>'schema'='public' AND value->>'table' IN ('clients','contacts') LOOP
      EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''digest'',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text COLLATE "C"),''''),''UTF8'')),''hex'')) FROM public.%I t',item->>'table') INTO actual;
      IF actual IS DISTINCT FROM item-ARRAY['schema','table'] THEN RAISE EXCEPTION 'Original client/contact associations or initial values differ'; END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_array_elements(inventory) i WHERE i->>'schema'='public' AND i->>'table' IN ('clients','contacts'))<>2
       OR (SELECT count(*) FROM public.clients)<>318 OR (SELECT count(*) FROM public.contacts)<>188 THEN RAISE EXCEPTION 'Incomplete original client/contact population'; END IF;
  ELSIF profile='canonical-clean-replay' THEN
    IF EXISTS(SELECT 1 FROM public.clients) OR EXISTS(SELECT 1 FROM public.contacts)
       OR EXISTS(SELECT 1 FROM _migration.high_impact_application) THEN RAISE EXCEPTION 'Canonical profile contains noncanonical client/contact evidence'; END IF;
  ELSE RAISE EXCEPTION 'Unknown client/contact source profile'; END IF;
  SELECT count(*) INTO source_count FROM staging."العملاء";
  IF source_count<>(SELECT count(*) FROM clients) OR (SELECT count(*) FROM staging."Contacts")<>(SELECT count(*) FROM contacts) THEN RAISE EXCEPTION 'Hybrid client/contact source profile'; END IF;
  IF EXISTS(SELECT 1 FROM public.clients c FULL JOIN staging."العملاء" s ON c.legacy_id=s."ID_client"::integer
    WHERE c.id IS NULL OR s.src_record_key IS NULL OR
    ROW(c.name_ar,c.name_en,c.full_name,c.cash_or_probono,c.status,c.poa_location,c.documents_location,c.legacy_contact_lawyer_raw,c.client_start,c.client_end)
      IS DISTINCT FROM ROW(s."العميل",s."Client_en",s."Full_name",s."Cash/probono",s."Status",s."مكان التوكيل",s."مكان المستندات",s."contactLawyer",
      CASE WHEN s."clientStart" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN s."clientStart"::timestamp::date END,
      CASE WHEN s."clientEnd" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN s."clientEnd"::timestamp::date END)
    OR c.branch_id IS NOT NULL OR c.legacy_branch_raw IS NOT NULL OR c.contact_person_id IS NOT NULL) THEN RAISE EXCEPTION 'Client source values do not reconcile exactly'; END IF;
  IF EXISTS(SELECT 1 FROM public.contacts c FULL JOIN staging."Contacts" s ON c.legacy_id=s."ID"::integer LEFT JOIN public.clients p ON p.id=c.client_id
    WHERE c.id IS NULL OR s.src_record_key IS NULL OR p.id IS NULL OR p.legacy_id IS DISTINCT FROM s."clientID"::integer OR
    ROW(c.contact_name,c.full_name,c.job_title,c.email,c.business_phone,c.home_phone,c.mobile_phone,c.fax_number,c.address,c.city,c.state_province,c.zip_postal_code,c.country_region,c.web_page)
      IS DISTINCT FROM ROW(s."Contact1",s."Full_name",s."Job Title",s."E-mail Address",s."Business Phone",s."Home Phone",s."Mobile Phone",s."Fax Number",s."Address",s."City",s."State/Province",s."ZIP/Postal Code",s."Country/Region",s."Web Page")) THEN RAISE EXCEPTION 'Contact source values or original ownership do not reconcile exactly'; END IF;
END
$precondition$;

CREATE TABLE _migration.client_contact_client_import (
  id integer PRIMARY KEY REFERENCES public.clients(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  legacy_id integer NOT NULL UNIQUE,
  source_record_key text NOT NULL UNIQUE,
  source_extraction_sha256 text NOT NULL,
  source_values jsonb NOT NULL CHECK(jsonb_typeof(source_values)='object'),
  initial_values jsonb NOT NULL CHECK(jsonb_typeof(initial_values)='object'),
  CHECK((initial_values->>'id')::integer=id AND (initial_values->>'legacy_id')::integer=legacy_id),
  CHECK(source_values->>'src_record_key'=source_record_key AND source_values->>'src_extraction_sha256'=source_extraction_sha256 AND (source_values->>'ID_client')::integer=legacy_id)
);
CREATE TABLE _migration.client_contact_contact_import (
  id integer PRIMARY KEY REFERENCES public.contacts(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  legacy_id integer NOT NULL UNIQUE,
  client_id integer NOT NULL REFERENCES _migration.client_contact_client_import(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_record_key text NOT NULL UNIQUE,
  source_extraction_sha256 text NOT NULL,
  source_values jsonb NOT NULL CHECK(jsonb_typeof(source_values)='object'),
  initial_values jsonb NOT NULL CHECK(jsonb_typeof(initial_values)='object'),
  CHECK((initial_values->>'id')::integer=id AND (initial_values->>'legacy_id')::integer=legacy_id AND (initial_values->>'client_id')::integer=client_id),
  CHECK(source_values->>'src_record_key'=source_record_key AND source_values->>'src_extraction_sha256'=source_extraction_sha256 AND (source_values->>'ID')::integer=legacy_id)
);
INSERT INTO _migration.client_contact_client_import SELECT c.id,c.legacy_id,s.src_record_key,s.src_extraction_sha256,to_jsonb(s),to_jsonb(c) FROM public.clients c JOIN staging."العملاء" s ON s."ID_client"::integer=c.legacy_id;
INSERT INTO _migration.client_contact_contact_import SELECT c.id,c.legacy_id,c.client_id,s.src_record_key,s.src_extraction_sha256,to_jsonb(s),to_jsonb(c) FROM public.contacts c JOIN staging."Contacts" s ON s."ID"::integer=c.legacy_id;
-- Expanded before adding live columns: these historical views keep precisely
-- the original row shape, including all original timestamps and actor values.
CREATE VIEW _migration.client_contact_initial_clients AS SELECT (jsonb_populate_record(NULL::public.clients,initial_values)).* FROM _migration.client_contact_client_import;
CREATE VIEW _migration.client_contact_initial_contacts AS SELECT (jsonb_populate_record(NULL::public.contacts,initial_values)).* FROM _migration.client_contact_contact_import;
CREATE TABLE _migration.client_contact_boundary (
  singleton boolean PRIMARY KEY CHECK(singleton),
  profile text NOT NULL CHECK(profile IN ('historical-full-state-upgrade','canonical-clean-replay')),
  imported_clients integer NOT NULL,
  imported_contacts integer NOT NULL,
  initial_inventory jsonb NOT NULL,
  source_inventory jsonb NOT NULL,
  established_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO _migration.client_contact_boundary
SELECT true,b.profile,(SELECT count(*) FROM clients),(SELECT count(*) FROM contacts),
  (SELECT jsonb_agg(x ORDER BY x->>'table') FROM (
    SELECT jsonb_build_object('table','clients','count',count(*),'digest',encode(sha256(convert_to(coalesce(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE "C"),''),'UTF8')),'hex')) x FROM _migration.client_contact_client_import
    UNION ALL SELECT jsonb_build_object('table','contacts','count',count(*),'digest',encode(sha256(convert_to(coalesce(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE "C"),''),'UTF8')),'hex')) FROM _migration.client_contact_contact_import) z),
  (SELECT jsonb_agg(x ORDER BY x->>'table') FROM (
    SELECT jsonb_build_object('table','clients','count',count(*),'digest',encode(sha256(convert_to(coalesce(string_agg(source_values::text,chr(10) ORDER BY source_values::text COLLATE "C"),''),'UTF8')),'hex')) x FROM _migration.client_contact_client_import
    UNION ALL SELECT jsonb_build_object('table','contacts','count',count(*),'digest',encode(sha256(convert_to(coalesce(string_agg(source_values::text,chr(10) ORDER BY source_values::text COLLATE "C"),''),'UTF8')),'hex')) FROM _migration.client_contact_contact_import) z),statement_timestamp()
FROM _migration.staff_roster_boundary b;

CREATE TABLE _migration.client_contact_submission (
  actor_id integer NOT NULL REFERENCES public.audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  entity_table text NOT NULL CHECK(entity_table IN ('clients','contacts')),
  submission_id uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
  request_sha256 text NOT NULL CHECK(request_sha256=encode(sha256(convert_to(request_payload::text,'UTF8')),'hex')),
  client_id integer NOT NULL REFERENCES public.clients(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  contact_id integer REFERENCES public.contacts(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY(actor_id,entity_table,submission_id),
  CHECK((entity_table='clients' AND contact_id IS NULL) OR (entity_table='contacts' AND contact_id IS NOT NULL))
);
CREATE FUNCTION _migration.client_contact_refuse_evidence_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Client/contact evidence and submission receipts are immutable'; END;
$$;
DO $guards$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['client_contact_client_import','client_contact_contact_import','client_contact_boundary','client_contact_submission'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON _migration.%I FOR EACH ROW EXECUTE FUNCTION _migration.client_contact_refuse_evidence_change()',name);
    EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.client_contact_refuse_evidence_change()',name);
    IF name<>'client_contact_submission' THEN EXECUTE format('CREATE TRIGGER immutable_insert BEFORE INSERT ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.client_contact_refuse_evidence_change()',name); END IF;
  END LOOP;
END
$guards$;

ALTER TABLE public.clients
  ADD COLUMN is_application_native boolean NOT NULL DEFAULT false,
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
  ADD COLUMN application_modified_at timestamptz,
  ADD COLUMN application_modified_by integer REFERENCES public.audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT clients_modification_pair CHECK((application_modified_at IS NULL)=(application_modified_by IS NULL)),
  ADD CONSTRAINT clients_native_identity CHECK(NOT is_application_native OR legacy_id IS NULL);
ALTER TABLE public.contacts
  ADD COLUMN is_application_native boolean NOT NULL DEFAULT false,
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
  ADD COLUMN application_modified_at timestamptz,
  ADD COLUMN application_modified_by integer REFERENCES public.audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT contacts_modification_pair CHECK((application_modified_at IS NULL)=(application_modified_by IS NULL)),
  ADD CONSTRAINT contacts_native_identity CHECK(NOT is_application_native OR legacy_id IS NULL),
  ADD CONSTRAINT contacts_operational_parent CHECK(client_id IS NOT NULL),
  ADD CONSTRAINT contacts_id_client_id_key UNIQUE(id,client_id);
ALTER TABLE public.clients ALTER COLUMN is_application_native SET DEFAULT true;
ALTER TABLE public.contacts ALTER COLUMN is_application_native SET DEFAULT true;
ALTER TABLE public.clients DROP CONSTRAINT clients_contact_person_id_fkey;
ALTER TABLE public.clients ADD CONSTRAINT clients_same_client_main_contact FOREIGN KEY(contact_person_id,id) REFERENCES public.contacts(id,client_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX clients_archive_name_id_idx ON public.clients(is_archived,name_ar,id);
CREATE INDEX contacts_parent_archive_id_idx ON public.contacts(client_id,is_archived,id);
CREATE INDEX clients_application_modified_by_idx ON public.clients(application_modified_by);
CREATE INDEX contacts_application_modified_by_idx ON public.contacts(application_modified_by);

INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason)
SELECT 'public',t,f,64,'value',r FROM (VALUES('clients'),('contacts')) tables(t)
CROSS JOIN (VALUES('is_application_native','client_contact_database_provenance'),('is_archived','client_contact_archive_lifecycle'),('row_version','client_contact_database_version'),('application_modified_at','client_contact_modification_provenance'),('application_modified_by','client_contact_modification_provenance')) fields(f,r);

CREATE FUNCTION _migration.client_contact_require_actor(p_archive boolean) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer; role text;
BEGIN
  PERFORM public.audit_ensure_event_context();
  actor:=public.audit_current_actor_id();
  SELECT u.role_code INTO role FROM public.audit_actors a JOIN public.user_accounts u ON u.id=a.user_account_id JOIN public.people p ON p.id=u.person_id
    WHERE a.id=actor AND a.actor_kind='human' AND u.is_enabled AND u.password_hash IS NOT NULL AND NOT u.must_change_password AND p.is_staff AND p.is_active AND p.can_login FOR SHARE OF u,p;
  IF role IS NULL OR role NOT IN ('Administrator','Litigation Assistant') OR (p_archive AND role<>'Administrator') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized human client/contact actor required';
  END IF;
  RETURN actor;
END;
$$;
CREATE FUNCTION _migration.client_contact_validate_patch(p_table text,p_patch jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed text[]; item record;
BEGIN
  allowed:=CASE p_table WHEN 'clients' THEN ARRAY['name_ar','name_en','full_name','cash_or_probono','status','poa_location','documents_location','client_start','client_end','contact_person_id'] WHEN 'contacts' THEN ARRAY['contact_name','full_name','job_title','email','mobile_phone','business_phone','fax_number','web_page','address','city','state_province','zip_postal_code','country_region'] END;
  IF allowed IS NULL OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Client/contact patch must be an object'; END IF;
  FOR item IN SELECT key,value FROM jsonb_each(p_patch) LOOP
    IF NOT item.key=ANY(allowed) OR (jsonb_typeof(item.value) NOT IN ('string','null') AND NOT(item.key='contact_person_id' AND jsonb_typeof(item.value)='number'))
      OR char_length(item.value#>>'{}')>2048 OR public.audit_contains_secret_pattern(item.value#>>'{}') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported client/contact field or value'; END IF;
  END LOOP;
END;
$$;
CREATE FUNCTION _migration.client_contact_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE previous jsonb; incoming jsonb; immutable text[]; business_changed boolean; parent public.clients%ROWTYPE; selected public.contacts%ROWTYPE;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Clients and contacts cannot be physically deleted'; END IF;
  incoming:=to_jsonb(NEW);
  IF TG_OP='UPDATE' THEN
    previous:=to_jsonb(OLD);
    immutable:=ARRAY['id','legacy_id','is_application_native','row_version','application_modified_at','application_modified_by'];
    immutable:=immutable||CASE WHEN TG_TABLE_NAME='clients' THEN ARRAY['branch_id','legacy_branch_raw','legacy_contact_lawyer_raw'] ELSE ARRAY['client_id','home_phone'] END;
    IF EXISTS(SELECT 1 FROM unnest(immutable) k WHERE incoming->k IS DISTINCT FROM previous->k) THEN RAISE EXCEPTION 'Client/contact identity, ownership, version and provenance are database-owned'; END IF;
    business_changed:=incoming-ARRAY['created_at','updated_at','created_by','updated_by','name_ar_normalised','full_name_normalised','contact_name_normalised'] IS DISTINCT FROM previous-ARRAY['created_at','updated_at','created_by','updated_by','name_ar_normalised','full_name_normalised','contact_name_normalised'];
    IF NOT business_changed THEN RETURN NULL; END IF;
    IF OLD.is_archived AND (NEW.is_archived OR incoming-ARRAY['created_at','updated_at','created_by','updated_by','is_archived'] IS DISTINCT FROM previous-ARRAY['created_at','updated_at','created_by','updated_by','is_archived']) THEN RAISE EXCEPTION 'Restore archived record before editing business fields'; END IF;
    IF NEW.is_archived<>OLD.is_archived AND incoming-ARRAY['created_at','updated_at','created_by','updated_by','is_archived'] IS DISTINCT FROM previous-ARRAY['created_at','updated_at','created_by','updated_by','is_archived'] THEN RAISE EXCEPTION 'Archive/restore cannot change business fields'; END IF;
    PERFORM _migration.client_contact_require_actor(NEW.is_archived<>OLD.is_archived);
    NEW.row_version:=OLD.row_version+1;
    NEW.application_modified_at:=statement_timestamp(); NEW.application_modified_by:=public.audit_current_actor_id();
  ELSE
    PERFORM _migration.client_contact_require_actor(false);
    IF NEW.legacy_id IS NOT NULL OR NOT NEW.is_application_native OR NEW.is_archived OR NEW.row_version<>1 OR NEW.application_modified_at IS NOT NULL OR NEW.application_modified_by IS NOT NULL THEN RAISE EXCEPTION 'Native records cannot invent import identity or provenance'; END IF;
  END IF;
  IF TG_TABLE_NAME='clients' THEN
    IF NEW.branch_id IS NOT NULL OR NEW.legacy_branch_raw IS NOT NULL OR (TG_OP='INSERT' AND NEW.legacy_contact_lawyer_raw IS NOT NULL) THEN RAISE EXCEPTION 'Client branch and historical lawyer fields are not entry fields'; END IF;
    IF TG_OP='UPDATE' AND OLD.legacy_id=188 AND ROW(NEW.name_ar,NEW.name_en,NEW.full_name) IS DISTINCT FROM ROW(OLD.name_ar,OLD.name_en,OLD.full_name) THEN RAISE EXCEPTION 'D39 main Sigma naming requires a separate owner decision'; END IF;
    IF (TG_OP='INSERT' OR NEW.name_ar IS DISTINCT FROM OLD.name_ar) AND coalesce(btrim(NEW.name_ar),'')='' THEN RAISE EXCEPTION 'Client name required'; END IF;
    IF (TG_OP='INSERT' OR NEW.cash_or_probono IS DISTINCT FROM OLD.cash_or_probono) AND NEW.cash_or_probono IS NOT NULL AND NEW.cash_or_probono NOT IN ('','Cash','Probono') THEN RAISE EXCEPTION 'Unsupported deliberate client fee classification'; END IF;
    IF (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND NEW.status IS NOT NULL AND NEW.status NOT IN ('','Active','Disabled','Potential') THEN RAISE EXCEPTION 'Unsupported deliberate client business status'; END IF;
    IF NEW.contact_person_id IS NOT NULL THEN
      SELECT * INTO selected FROM public.contacts WHERE id=NEW.contact_person_id FOR UPDATE;
      IF NOT FOUND OR selected.client_id IS DISTINCT FROM NEW.id OR selected.is_archived THEN RAISE EXCEPTION 'Main contact must belong to this client and be unarchived'; END IF;
    END IF;
  ELSE
    SELECT * INTO parent FROM public.clients WHERE id=NEW.client_id FOR UPDATE;
    IF NOT FOUND OR parent.is_archived THEN RAISE EXCEPTION 'Restore parent client before any contact maintenance'; END IF;
    IF (TG_OP='INSERT' OR NEW.contact_name IS DISTINCT FROM OLD.contact_name) AND coalesce(btrim(NEW.contact_name),'')='' THEN RAISE EXCEPTION 'New or deliberately changed contact name is required'; END IF;
    IF NEW.is_archived AND parent.contact_person_id=NEW.id THEN RAISE EXCEPTION 'Explicitly clear or replace the main contact before archiving it'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_client_contact_guard BEFORE INSERT OR UPDATE OR DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION _migration.client_contact_guard();
CREATE TRIGGER zz_client_contact_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contacts FOR EACH ROW EXECUTE FUNCTION _migration.client_contact_guard();
CREATE TRIGGER client_contact_no_truncate BEFORE TRUNCATE ON public.clients FOR EACH STATEMENT EXECUTE FUNCTION _migration.client_contact_guard();
CREATE TRIGGER client_contact_no_truncate BEFORE TRUNCATE ON public.contacts FOR EACH STATEMENT EXECUTE FUNCTION _migration.client_contact_guard();

CREATE FUNCTION _migration.client_contact_lock(p_table text,p_id integer,p_expected_version bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE parent_id integer; value jsonb;
BEGIN
  IF p_table NOT IN ('clients','contacts') THEN RAISE EXCEPTION 'Unknown client/contact table'; END IF;
  IF p_table='contacts' THEN
    SELECT client_id INTO parent_id FROM public.contacts WHERE id=p_id;
    PERFORM 1 FROM public.clients WHERE id=parent_id AND NOT is_archived FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Existing unarchived parent required'; END IF;
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',p_table) INTO value USING p_id;
  IF value IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Client/contact identity does not exist'; END IF;
  IF p_expected_version IS NULL OR (value->>'row_version')::bigint<>p_expected_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Client/contact row version is stale'; END IF;
  RETURN value;
END;
$$;
CREATE FUNCTION public.client_contact_update(p_table text,p_id integer,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE original jsonb; assignments text; version bigint;
BEGIN
  PERFORM _migration.client_contact_require_actor(false);
  PERFORM _migration.client_contact_validate_patch(p_table,p_patch);
  original:=_migration.client_contact_lock(p_table,p_id,p_expected_version);
  IF (original->>'is_archived')::boolean THEN RAISE EXCEPTION 'Restore archived record before editing'; END IF;
  SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(p_patch) key;
  IF assignments IS NULL THEN RETURN p_expected_version; END IF;
  EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) v WHERE t.id=$2',p_table,assignments,p_table) USING original||p_patch,p_id;
  EXECUTE format('SELECT row_version FROM public.%I WHERE id=$1',p_table) INTO version USING p_id;
  RETURN version;
END;
$$;
CREATE FUNCTION public.client_contact_set_archived(p_table text,p_id integer,p_expected_version bigint,p_archived boolean) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE original jsonb; version bigint;
BEGIN
  PERFORM _migration.client_contact_require_actor(true);
  IF p_archived IS NULL THEN RAISE EXCEPTION 'Archive state required'; END IF;
  original:=_migration.client_contact_lock(p_table,p_id,p_expected_version);
  IF (original->>'is_archived')::boolean=p_archived THEN RETURN p_expected_version; END IF;
  EXECUTE format('UPDATE public.%I SET is_archived=$1 WHERE id=$2 RETURNING row_version',p_table) INTO version USING p_archived,p_id;
  PERFORM public.audit_append_semantic_event(CASE WHEN p_archived THEN 'archive' ELSE 'restore' END,'succeeded','public',p_table,jsonb_build_object('id',p_id),NULL,NULL,NULL,'{}',NULL,'{}');
  RETURN version;
END;
$$;
CREATE FUNCTION public.client_contact_create(p_table text,p_parent_id integer,p_submission_id uuid,p_values jsonb) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; payload jsonb; receipt _migration.client_contact_submission%ROWTYPE; identity integer; columns text; selections text;
BEGIN
  actor:=_migration.client_contact_require_actor(false);
  PERFORM _migration.client_contact_validate_patch(p_table,p_values);
  IF p_submission_id IS NULL OR (p_table='clients' AND p_parent_id IS NOT NULL) OR (p_table='contacts' AND p_parent_id IS NULL) THEN RAISE EXCEPTION 'Creation submission identity and correct parent required'; END IF;
  payload:=jsonb_build_object('parent_id',p_parent_id,'values',p_values);
  -- Only equal actor/entity/submission identities serialize. This is not a
  -- global roster or client mutex. A hash collision adds contention only.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_table||':'||p_submission_id::text,41));
  SELECT * INTO receipt FROM _migration.client_contact_submission WHERE actor_id=actor AND entity_table=p_table AND submission_id=p_submission_id;
  IF FOUND THEN
    IF receipt.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Creation submission reused with conflicting input'; END IF;
    RETURN CASE WHEN p_table='clients' THEN receipt.client_id ELSE receipt.contact_id END;
  END IF;
  IF p_table='contacts' THEN
    PERFORM 1 FROM public.clients WHERE id=p_parent_id AND NOT is_archived FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Existing unarchived parent required'; END IF;
  END IF;
  SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key) INTO columns,selections FROM jsonb_object_keys(p_values) key;
  IF columns IS NULL THEN RAISE EXCEPTION 'Creation requires a name'; END IF;
  EXECUTE format('INSERT INTO public.%I(%s,updated_at%s) SELECT %s,statement_timestamp()%s FROM jsonb_populate_record(NULL::public.%I,$1) v RETURNING id',p_table,columns,CASE WHEN p_table='contacts' THEN ',client_id' ELSE '' END,selections,CASE WHEN p_table='contacts' THEN ',$2' ELSE '' END,p_table) INTO identity USING p_values,p_parent_id;
  INSERT INTO _migration.client_contact_submission(actor_id,entity_table,submission_id,request_payload,request_sha256,client_id,contact_id)
    VALUES(actor,p_table,p_submission_id,payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),CASE WHEN p_table='clients' THEN identity ELSE p_parent_id END,CASE WHEN p_table='contacts' THEN identity END);
  RETURN identity;
END;
$$;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.clients,public.contacts FROM litigation_runtime;
REVOKE ALL ON SEQUENCE public.clients_id_seq,public.contacts_id_seq FROM litigation_runtime;
REVOKE ALL ON _migration.client_contact_boundary,_migration.client_contact_client_import,_migration.client_contact_contact_import,_migration.client_contact_submission,_migration.client_contact_initial_clients,_migration.client_contact_initial_contacts FROM PUBLIC,litigation_runtime;
DO $permissions$
DECLARE routine regprocedure;
BEGIN
  FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.proname LIKE 'client_contact_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine);
  END LOOP;
END
$permissions$;
GRANT EXECUTE ON FUNCTION public.client_contact_create(text,integer,uuid,jsonb),public.client_contact_update(text,integer,bigint,jsonb),public.client_contact_set_archived(text,integer,bigint,boolean) TO litigation_runtime;

-- A deliberately late assertion supports atomicity proof without modifying an
-- older migration. Every original row projection must still be byte-exact.
DO $postcondition$
BEGIN
  IF EXISTS(SELECT 1 FROM _migration.client_contact_client_import i JOIN public.clients c USING(id) WHERE i.initial_values IS DISTINCT FROM to_jsonb(c)-ARRAY['is_application_native','is_archived','row_version','application_modified_at','application_modified_by'])
    OR EXISTS(SELECT 1 FROM _migration.client_contact_contact_import i JOIN public.contacts c USING(id) WHERE i.initial_values IS DISTINCT FROM to_jsonb(c)-ARRAY['is_application_native','is_archived','row_version','application_modified_at','application_modified_by']) THEN RAISE EXCEPTION 'Client/contact migration changed an original row'; END IF;
END
$postcondition$;
COMMIT;
