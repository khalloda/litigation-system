-- Tasks 4.6 + 4.7 / D65 + D66. Candidate-only; never apply to the owner database here.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT public.audit_set_migration_context();
SELECT public.audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
  NULL,'controlled-maintenance:tasks-4-6-4-7-boundary','system');
LOCK TABLE public.documents,public.fee_letters,public.fee_letter_matters,
  public.matter_fee_letter_references IN ACCESS EXCLUSIVE MODE;

CREATE TABLE _migration.tasks46_47_import (
  entity_table text NOT NULL CHECK(entity_table IN
    ('documents','fee_letters','fee_letter_matters','matter_fee_letter_references')),
  id integer NOT NULL,
  initial_values jsonb NOT NULL CHECK(jsonb_typeof(initial_values)='object'
    AND (initial_values->>'id')::integer=id),
  PRIMARY KEY(entity_table,id)
);

DO $precondition$
DECLARE t text; expected jsonb; actual jsonb; profile text; projection text;
BEGIN
  IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
    OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>70
    OR EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL
      AND migration_name<>'20260916180000_documents_fee_letters_boundary') THEN
    RAISE EXCEPTION 'Exact complete migration-70 direct owner prestate required';
  END IF;
  SELECT b.profile INTO STRICT profile FROM _migration.staff_roster_boundary b;
  FOREACH t IN ARRAY ARRAY['documents','fee_letters','fee_letter_matters','matter_fee_letter_references'] LOOP
    IF profile='historical-full-state-upgrade' THEN
      SELECT i-ARRAY['schema','table'] INTO STRICT expected
      FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.before_inventory) i
      WHERE i->>'schema'='public' AND i->>'table'=t;
      EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''digest'',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''UTF8'')),''hex'')) FROM public.%I r WHERE NOT EXISTS(SELECT 1 FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) c WHERE c->>''table''=$1 AND (c->>''id'')::integer=r.id)',t) INTO actual USING t;
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Original Task 4.6/4.7 evidence differs: %',t; END IF;
    ELSIF profile='canonical-clean-replay' THEN
      EXECUTE format('SELECT count(*) FROM public.%I',t) INTO actual;
      IF actual<>'0'::jsonb THEN RAISE EXCEPTION 'Nonempty canonical Task 4.6/4.7 profile: %',t; END IF;
    ELSE RAISE EXCEPTION 'Unrecognized Task 4.6/4.7 profile'; END IF;
    EXECUTE format('INSERT INTO _migration.tasks46_47_import SELECT $1,id,to_jsonb(r) FROM public.%I r',t) USING t;
    SELECT string_agg(CASE WHEN a.attname='id' THEN 'id'
      WHEN a.atttypid='jsonb'::regtype THEN format('initial_values->%L AS %I',a.attname,a.attname)
      ELSE format('(initial_values->>%L)::%s AS %I',a.attname,format_type(a.atttypid,a.atttypmod),a.attname)
      END,',' ORDER BY a.attnum) INTO projection
    FROM pg_attribute a WHERE a.attrelid=format('public.%I',t)::regclass
      AND a.attnum>0 AND NOT a.attisdropped;
    EXECUTE format('CREATE VIEW _migration.tasks46_47_initial_%I AS SELECT %s FROM _migration.tasks46_47_import WHERE entity_table=%L',t,projection,t);
  END LOOP;
END
$precondition$;

CREATE TABLE _migration.tasks46_47_boundary (
  singleton boolean PRIMARY KEY CHECK(singleton), profile text NOT NULL,
  inventory jsonb NOT NULL, established_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO _migration.tasks46_47_boundary
SELECT true,profile,(SELECT coalesce(jsonb_agg(x ORDER BY x->>'table'),'[]'::jsonb) FROM (
  SELECT jsonb_build_object('table',entity_table,'count',count(*),'digest',
    encode(sha256(convert_to(coalesce(string_agg(initial_values::text,chr(10)
      ORDER BY initial_values::text COLLATE "C"),''),'UTF8')),'hex')) x
  FROM _migration.tasks46_47_import GROUP BY entity_table) s)
FROM _migration.staff_roster_boundary;

ALTER TABLE public.documents
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.fee_letters
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.fee_letter_matters
  ADD COLUMN is_retired boolean NOT NULL DEFAULT false,
  ADD COLUMN current_order integer CHECK(current_order>0);
ALTER TABLE public.matter_fee_letter_references
  ADD COLUMN is_retired boolean NOT NULL DEFAULT false;

INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason) VALUES
 ('public','documents','row_version',64,'value','document_aggregate_version'),
 ('public','documents','is_archived',64,'value','document_archive_state'),
 ('public','fee_letters','row_version',64,'value','fee_letter_aggregate_version'),
 ('public','fee_letters','is_archived',64,'value','fee_letter_archive_state'),
 ('public','fee_letter_matters','is_retired',64,'value','fee_letter_covered_matter_retirement'),
 ('public','fee_letter_matters','current_order',64,'value','fee_letter_covered_matter_order'),
 ('public','matter_fee_letter_references','is_retired',64,'value','matter_current_fee_letter_retirement');

ALTER TABLE public.matter_fee_letter_references
  DROP CONSTRAINT matter_fee_letter_references_matter_id_key;
CREATE UNIQUE INDEX matter_fee_reference_current_matter_idx
  ON public.matter_fee_letter_references(matter_id) WHERE NOT is_retired;
CREATE UNIQUE INDEX matter_fee_reference_matter_fee_idx
  ON public.matter_fee_letter_references(matter_id,fee_letter_id);
CREATE UNIQUE INDEX fee_letter_current_matter_pair_idx
  ON public.fee_letter_matters(fee_letter_id,matter_id) WHERE NOT is_retired;
CREATE UNIQUE INDEX fee_letter_current_order_idx
  ON public.fee_letter_matters(fee_letter_id,(coalesce(current_order,ordinal+1))) WHERE NOT is_retired;
CREATE INDEX documents_operational_list_idx ON public.documents(is_archived,id);
CREATE INDEX fee_letters_operational_list_idx ON public.fee_letters(is_archived,id);

CREATE TABLE _migration.document_edit_change (
 document_id integer NOT NULL REFERENCES public.documents(id), version bigint NOT NULL,
 actor_id integer NOT NULL REFERENCES public.audit_actors(id), before_values jsonb,
 after_values jsonb NOT NULL, request_id uuid NOT NULL, PRIMARY KEY(document_id,version)
);
CREATE TABLE _migration.document_edit_submission (
 submission_id uuid PRIMARY KEY, actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 request_payload jsonb NOT NULL, document_id integer NOT NULL REFERENCES public.documents(id),
 result_version bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE(document_id,result_version)
);
CREATE TABLE _migration.fee_letter_edit_change (
 fee_letter_id integer NOT NULL REFERENCES public.fee_letters(id), version bigint NOT NULL,
 actor_id integer NOT NULL REFERENCES public.audit_actors(id), before_values jsonb,
 after_values jsonb NOT NULL, request_id uuid NOT NULL, PRIMARY KEY(fee_letter_id,version)
);
CREATE TABLE _migration.fee_letter_edit_submission (
 submission_id uuid PRIMARY KEY, actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 request_payload jsonb NOT NULL, fee_letter_id integer NOT NULL REFERENCES public.fee_letters(id),
 result_version bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE(fee_letter_id,result_version)
);
CREATE TABLE _migration.matter_fee_reference_state (
 matter_id integer PRIMARY KEY REFERENCES public.matters(id), row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0)
);
INSERT INTO _migration.matter_fee_reference_state(matter_id) SELECT id FROM public.matters;
CREATE TABLE _migration.matter_fee_reference_change (
 matter_id integer NOT NULL REFERENCES public.matters(id), version bigint NOT NULL,
 actor_id integer NOT NULL REFERENCES public.audit_actors(id), before_values jsonb NOT NULL,
 after_values jsonb NOT NULL, request_id uuid NOT NULL, PRIMARY KEY(matter_id,version)
);
CREATE TABLE _migration.matter_fee_reference_submission (
 submission_id uuid PRIMARY KEY, actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 request_payload jsonb NOT NULL, matter_id integer NOT NULL REFERENCES public.matters(id),
 result_version bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE(matter_id,result_version)
);
CREATE TABLE _migration.tasks46_47_submission_owner (
 submission_id uuid PRIMARY KEY,
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 gateway text NOT NULL CHECK(gateway IN('documents','fee_letters','matter_fee_references')),
 operation text NOT NULL,
 entity_id integer NOT NULL,
 request_payload jsonb NOT NULL,
 result_version bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE(gateway,entity_id,result_version)
);

CREATE FUNCTION _migration.tasks46_47_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Tasks 4.6/4.7 import, boundary, change and receipt evidence is immutable'; END;
$$;
DO $evidence_guards$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['tasks46_47_import','tasks46_47_boundary','document_edit_change',
  'document_edit_submission','fee_letter_edit_change','fee_letter_edit_submission',
  'matter_fee_reference_change','matter_fee_reference_submission','tasks46_47_submission_owner'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.tasks46_47_immutable()',t);
  IF t IN('tasks46_47_import','tasks46_47_boundary') THEN
   EXECUTE format('CREATE TRIGGER immutable_insert BEFORE INSERT ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.tasks46_47_immutable()',t);
  END IF;
 END LOOP;
END
$evidence_guards$;

CREATE FUNCTION _migration.tasks46_47_read_account(
 p_account integer,p_version integer,p_role text,p_expires timestamptz,p_administrator boolean
) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
 IF p_expires IS NULL OR p_expires<=clock_timestamp()
   OR p_role NOT IN('Administrator','Litigation Assistant')
   OR (p_administrator AND p_role<>'Administrator') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized document/fee-letter session required';
 END IF;
 SELECT a.id INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
 JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
 WHERE u.id=p_account AND u.session_version=p_version AND u.role_code=p_role
  AND u.is_enabled AND u.password_hash IS NOT NULL AND NOT u.must_change_password
  AND p.is_staff AND p.is_active AND p.can_login;
 IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized document/fee-letter session required'; END IF;
 RETURN actor;
END;
$$;
CREATE FUNCTION _migration.tasks46_47_require_account(
 p_account integer,p_version integer,p_role text,p_expires timestamptz,p_administrator boolean
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.people p JOIN public.user_accounts u ON u.person_id=p.id
  WHERE u.id=p_account FOR SHARE OF p,u;
 RETURN _migration.tasks46_47_read_account(
  p_account,p_version,p_role,p_expires,p_administrator);
END;
$$;
CREATE FUNCTION _migration.tasks46_47_positive(v jsonb,nullable boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((nullable AND v='null'::jsonb) OR (jsonb_typeof(v)='number'
  AND v::text~'^[1-9][0-9]{0,9}$' AND v::text::numeric<=2147483647),false)
$$;
CREATE FUNCTION _migration.tasks46_47_request_identity(p jsonb) RETURNS TABLE(
 operation text,identity integer,expected bigint,submission uuid
) LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>200000
  OR NOT p ?& ARRAY['operation','id','version','submission','values','related','facts']
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN('operation','id','version','submission','values','related','facts'))
  OR NOT _migration.tasks46_47_positive(p->'id',true)
  OR jsonb_typeof(p->'submission')<>'string'
  OR (p->>'submission') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document/fee-letter request';
 END IF;
 operation:=p->>'operation'; identity:=(p->>'id')::integer;
 IF identity IS NULL THEN expected:=NULL;
 ELSIF jsonb_typeof(p->'version')<>'string' OR (p->>'version') !~ '^[1-9][0-9]{0,18}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document/fee-letter version';
 ELSE expected:=(p->>'version')::bigint; END IF;
 submission:=(p->>'submission')::uuid; RETURN NEXT;
END;
$$;

CREATE FUNCTION _migration.tasks46_47_receipt_valid(
 p_gateway text,p_actor integer,p_request jsonb,p_entity integer,p_result bigint
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; owner record; op text;
BEGIN
 BEGIN SELECT * INTO r FROM _migration.tasks46_47_request_identity(p_request);
 EXCEPTION WHEN OTHERS THEN RETURN false; END;
 op:=r.operation;
 SELECT * INTO owner FROM _migration.tasks46_47_submission_owner WHERE submission_id=r.submission;
 IF NOT FOUND OR owner.actor_id<>p_actor OR owner.gateway<>p_gateway OR owner.operation<>op
  OR owner.entity_id<>p_entity OR owner.result_version<>p_result
  OR owner.request_payload IS DISTINCT FROM p_request THEN RETURN false; END IF;
 IF (op='create') IS DISTINCT FROM (r.identity IS NULL) OR
  (op='create' AND (p_request->'version'<>'null' OR p_result<>1)) OR
  (op<>'create' AND (r.identity<>p_entity OR r.expected<>p_result-1)) THEN RETURN false; END IF;
 IF p_gateway='documents' THEN
  IF op NOT IN('create','update','archive','restore')
   OR (op IN('create','update') AND (p_request->'related'<>'null' OR p_request->'facts'<>'null'))
   OR (op IN('archive','restore') AND (p_request->'values'<>'{}' OR p_request->'related'<>'null'
    OR jsonb_typeof(p_request->'facts')<>'object')) THEN RETURN false; END IF;
 ELSIF p_gateway='fee_letters' THEN
  IF op NOT IN('create','update','archive','restore','covered-add','covered-retire','covered-restore') THEN RETURN false; END IF;
  IF op IN('create','update') AND (p_request->'related'<>'null' OR p_request->'facts'<>'null') THEN RETURN false; END IF;
  IF op IN('archive','restore') AND (p_request->'values'<>'{}' OR p_request->'related'<>'null'
   OR jsonb_typeof(p_request->'facts')<>'object') THEN RETURN false; END IF;
  IF op LIKE 'covered-%' AND (p_request->'values'<>'{}' OR p_request->'facts'<>'null'
   OR jsonb_typeof(p_request->'related')<>'object'
   OR NOT p_request->'related' ?& ARRAY['membershipId','matterId']
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request->'related') k WHERE k NOT IN('membershipId','matterId')))
   THEN RETURN false; END IF;
 ELSIF p_gateway='matter_fee_references' THEN
  IF op NOT IN('set','clear','replace') OR p_request->'values'<>'{}' OR p_request->'facts'<>'null'
   OR jsonb_typeof(p_request->'related')<>'object'
   OR NOT p_request->'related' ?& ARRAY['oldFeeLetterId','newFeeLetterId']
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request->'related') k WHERE k NOT IN('oldFeeLetterId','newFeeLetterId'))
   THEN RETURN false; END IF;
 ELSE RETURN false;
 END IF;
 RETURN true;
END;
$$;

CREATE FUNCTION _migration.document_edit_initial_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT initial_values||jsonb_build_object('row_version',1,'is_archived',false)
 FROM _migration.tasks46_47_import WHERE entity_table='documents' AND id=p_id
$$;
CREATE FUNCTION _migration.document_edit_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT to_jsonb(d) FROM public.documents d WHERE id=p_id
$$;
CREATE FUNCTION _migration.document_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE expected jsonb:=_migration.document_edit_initial_aggregate(p_id); c record; s record; v bigint; op text; patch jsonb;
BEGIN
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.document_edit_change WHERE document_id=p_id ORDER BY version LOOP
  SELECT * INTO s FROM _migration.document_edit_submission WHERE document_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('documents',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.submission_id::text<>s.request_payload->>'submission'
	   OR (c.after_values->>'id')::integer<>p_id OR (c.after_values->>'row_version')::bigint<>v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='documents' AND e.entity_key=jsonb_build_object('id',p_id)
    AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.outcome='succeeded'
	    AND e.after_values->>'row_version'=v::text) THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation';
	  IF op IN('create','update') THEN
	   BEGIN patch:=_migration.document_edit_values(s.request_payload->'values',c.before_values,op='create');
	   EXCEPTION WHEN OTHERS THEN RETURN false; END;
	   IF op='create' THEN
	    IF c.before_values IS NOT NULL OR NOT c.after_values @> patch THEN RETURN false; END IF;
	   ELSIF c.after_values-ARRAY['row_version','updated_at','updated_by']
	    IS DISTINCT FROM (c.before_values||patch)-ARRAY['row_version','updated_at','updated_by'] THEN RETURN false; END IF;
	  ELSIF c.before_values IS NULL OR c.after_values-ARRAY['row_version','updated_at','updated_by','is_archived']
	   IS DISTINCT FROM c.before_values-ARRAY['row_version','updated_at','updated_by','is_archived']
	   OR (c.after_values->>'is_archived')::boolean IS DISTINCT FROM (op='archive') THEN RETURN false;
	  END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.document_edit_submission sr WHERE sr.document_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.document_edit_change ch WHERE ch.document_id=sr.document_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.document_edit_aggregate(p_id);
END;
$$;
CREATE FUNCTION _migration.fee_letter_edit_initial_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('feeLetter',f.initial_values||jsonb_build_object('row_version',1,'is_archived',false),
  'covered',coalesce((SELECT jsonb_agg(l.initial_values||jsonb_build_object('is_retired',false,'current_order',NULL) ORDER BY l.id)
   FROM _migration.tasks46_47_import l WHERE l.entity_table='fee_letter_matters'
    AND (l.initial_values->>'fee_letter_id')::integer=p_id),'[]'))
 FROM _migration.tasks46_47_import f WHERE f.entity_table='fee_letters' AND f.id=p_id
$$;
CREATE FUNCTION _migration.fee_letter_edit_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('feeLetter',to_jsonb(f),'covered',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
  FROM public.fee_letter_matters l WHERE l.fee_letter_id=f.id),'[]')) FROM public.fee_letters f WHERE id=p_id
$$;
CREATE FUNCTION _migration.fee_letter_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE expected jsonb:=_migration.fee_letter_edit_initial_aggregate(p_id); c record; s record; v bigint;
 op text; patch jsonb; member integer; matter integer; before_member jsonb; after_member jsonb;
BEGIN
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.fee_letter_edit_change WHERE fee_letter_id=p_id ORDER BY version LOOP
  SELECT * INTO s FROM _migration.fee_letter_edit_submission WHERE fee_letter_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('fee_letters',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR (c.after_values->'feeLetter'->>'id')::integer<>p_id
   OR (c.after_values->'feeLetter'->>'row_version')::bigint<>v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='fee_letters' AND e.entity_key=jsonb_build_object('id',p_id)
    AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.outcome='succeeded'
	    AND e.after_values->>'row_version'=v::text) THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation';
	  IF op IN('create','update') THEN
	   BEGIN patch:=_migration.fee_letter_edit_values(s.request_payload->'values',c.before_values->'feeLetter',op='create');
	   EXCEPTION WHEN OTHERS THEN RETURN false; END;
	   IF op='create' THEN
	    IF c.before_values IS NOT NULL OR NOT c.after_values->'feeLetter' @> patch OR c.after_values->'covered'<>'[]' THEN RETURN false; END IF;
	   ELSIF c.after_values->'covered' IS DISTINCT FROM c.before_values->'covered'
	    OR (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by']
	    IS DISTINCT FROM ((c.before_values->'feeLetter')||patch)-ARRAY['row_version','updated_at','updated_by'] THEN RETURN false; END IF;
	  ELSIF op IN('archive','restore') THEN
	   IF c.after_values->'covered' IS DISTINCT FROM c.before_values->'covered'
	    OR (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by','is_archived']
	    IS DISTINCT FROM (c.before_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by','is_archived']
	    OR (c.after_values->'feeLetter'->>'is_archived')::boolean IS DISTINCT FROM (op='archive') THEN RETURN false; END IF;
	  ELSE
	   member:=(s.request_payload->'related'->>'membershipId')::integer;
	   matter:=(s.request_payload->'related'->>'matterId')::integer;
	   IF (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by']
	    IS DISTINCT FROM (c.before_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by'] THEN RETURN false; END IF;
	   IF op='covered-add' THEN
	    IF member IS NOT NULL OR matter IS NULL
	     OR jsonb_array_length(c.after_values->'covered')<>coalesce(jsonb_array_length(c.before_values->'covered'),0)+1
	     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') e
	      WHERE (e->>'matter_id')::integer=matter AND NOT (e->>'is_retired')::boolean AND e->>'legacy_source_record_key' IS NULL)
	     OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'covered') b
	      WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') a WHERE a IS NOT DISTINCT FROM b)) THEN RETURN false; END IF;
	   ELSE
	    SELECT e INTO before_member FROM jsonb_array_elements(c.before_values->'covered') e WHERE (e->>'id')::integer=member;
	    SELECT e INTO after_member FROM jsonb_array_elements(c.after_values->'covered') e WHERE (e->>'id')::integer=member;
	    IF member IS NULL OR before_member IS NULL OR after_member IS NULL
	     OR jsonb_array_length(c.after_values->'covered')<>jsonb_array_length(c.before_values->'covered')
	     OR before_member-ARRAY['is_retired','updated_at','updated_by']
	      IS DISTINCT FROM after_member-ARRAY['is_retired','updated_at','updated_by']
	     OR (before_member->>'is_retired')::boolean IS DISTINCT FROM (op='covered-restore')
	     OR (after_member->>'is_retired')::boolean IS DISTINCT FROM (op='covered-retire')
	     OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'covered') b
	      WHERE (b->>'id')::integer<>member AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') a WHERE a IS NOT DISTINCT FROM b)) THEN RETURN false; END IF;
	   END IF;
	  END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.fee_letter_edit_submission sr WHERE sr.fee_letter_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.fee_letter_edit_change ch WHERE ch.fee_letter_id=sr.fee_letter_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.fee_letter_edit_aggregate(p_id);
END;
$$;
CREATE FUNCTION _migration.matter_fee_reference_initial_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('matterId',p_id,'version','1','references',coalesce((SELECT jsonb_agg(
  initial_values||jsonb_build_object('is_retired',false) ORDER BY id)
  FROM _migration.tasks46_47_import WHERE entity_table='matter_fee_letter_references'
   AND (initial_values->>'matter_id')::integer=p_id),'[]'))
$$;
CREATE FUNCTION _migration.matter_fee_reference_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('matterId',p_id,'version',coalesce((SELECT row_version::text FROM _migration.matter_fee_reference_state WHERE matter_id=p_id),'1'),
  'references',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.matter_fee_letter_references r WHERE r.matter_id=p_id),'[]'))
$$;
CREATE FUNCTION _migration.matter_fee_reference_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE expected jsonb:=_migration.matter_fee_reference_initial_aggregate(p_id); c record; s record; v bigint:=2;
 op text; old_fee integer; new_fee integer; before_current integer; after_current integer;
BEGIN
 FOR c IN SELECT * FROM _migration.matter_fee_reference_change WHERE matter_id=p_id ORDER BY version LOOP
  SELECT * INTO s FROM _migration.matter_fee_reference_submission WHERE matter_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('matter_fee_references',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR c.after_values->>'matterId'<>p_id::text OR c.after_values->>'version'<>v::text
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='matter_fee_letter_references' AND e.actor_id=c.actor_id
	    AND e.request_id=c.request_id AND e.outcome='succeeded') THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation'; old_fee:=(s.request_payload->'related'->>'oldFeeLetterId')::integer;
	  new_fee:=(s.request_payload->'related'->>'newFeeLetterId')::integer;
	  SELECT (e->>'fee_letter_id')::integer INTO before_current FROM jsonb_array_elements(c.before_values->'references') e WHERE NOT (e->>'is_retired')::boolean;
	  SELECT (e->>'fee_letter_id')::integer INTO after_current FROM jsonb_array_elements(c.after_values->'references') e WHERE NOT (e->>'is_retired')::boolean;
	  IF (op='set' AND (old_fee IS NOT NULL OR new_fee IS NULL OR before_current IS NOT NULL OR after_current IS DISTINCT FROM new_fee))
	   OR (op='clear' AND (old_fee IS NULL OR new_fee IS NOT NULL OR before_current IS DISTINCT FROM old_fee OR after_current IS NOT NULL))
	   OR (op='replace' AND (old_fee IS NULL OR new_fee IS NULL OR old_fee=new_fee OR before_current IS DISTINCT FROM old_fee OR after_current IS DISTINCT FROM new_fee))
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'references') b
	    WHERE (b->>'fee_letter_id')::integer NOT IN(old_fee,new_fee)
	     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'references') a WHERE a IS NOT DISTINCT FROM b)) THEN RETURN false; END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.matter_fee_reference_submission sr WHERE sr.matter_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.matter_fee_reference_change ch WHERE ch.matter_id=sr.matter_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT DISTINCT FROM _migration.matter_fee_reference_aggregate(p_id);
END;
$$;

CREATE FUNCTION _migration.tasks46_47_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE incoming jsonb; previous jsonb; allowed text[]; k text;
BEGIN
 IF current_setting('litigation.tasks46_47_gateway',true) IS DISTINCT FROM 'on'
  OR TG_OP IN('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Task 4.6/4.7 direct write or deletion refused'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE TG_TABLE_NAME
  WHEN 'documents' THEN ARRAY['matter_id','client_id','description','document_date','page_count','deposit_date','responsible_person_id','movement_card','storage_location','notes','mfiles_id','row_version','is_archived']
  WHEN 'fee_letters' THEN ARRAY['client_id','mfiles_id','contract_type','contract_date','contract_details','contract_structure','row_version','is_archived']
  WHEN 'fee_letter_matters' THEN ARRAY['is_retired'] ELSE ARRAY['is_retired'] END;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  IF incoming-allowed-ARRAY['updated_at','updated_by'] IS DISTINCT FROM previous-allowed-ARRAY['updated_at','updated_by'] THEN
   RAISE EXCEPTION 'Task 4.6/4.7 identity and source evidence are immutable'; END IF;
  IF TG_TABLE_NAME IN('documents','fee_letters')
   AND (incoming->>'row_version')::bigint<>(previous->>'row_version')::bigint+1 THEN
   RAISE EXCEPTION 'Aggregate version must advance exactly once'; END IF;
 ELSE
  FOR k IN SELECT key FROM jsonb_each(incoming) WHERE key LIKE 'legacy_%'
    OR key IN('contract_id','client_name','status','ordinal','legacy_parent_contract_id_raw','identifier_space') LOOP
   IF incoming->k<>'null'::jsonb THEN RAISE EXCEPTION 'Native record cannot invent source evidence'; END IF;
  END LOOP;
  IF TG_TABLE_NAME IN('documents','fee_letters')
   AND ((incoming->>'is_archived')::boolean OR (incoming->>'row_version')::bigint<>1) THEN
   RAISE EXCEPTION 'Native aggregate starts current at version one'; END IF;
  IF TG_TABLE_NAME='fee_letter_matters' AND ((incoming->>'is_retired')::boolean
   OR (incoming->>'current_order' IS NULL AND incoming->>'legacy_source_record_key' IS NULL)) THEN
   RAISE EXCEPTION 'Native covered matter requires current order'; END IF;
  IF TG_TABLE_NAME='matter_fee_letter_references' AND (incoming->>'is_retired')::boolean THEN
   RAISE EXCEPTION 'Native matter reference starts current'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION _migration.tasks46_47_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer; valid boolean;
BEGIN
 IF TG_TABLE_NAME='documents' THEN identity:=NEW.id; valid:=_migration.document_edit_current_valid(identity);
 ELSIF TG_TABLE_NAME='fee_letters' THEN identity:=NEW.id; valid:=_migration.fee_letter_edit_current_valid(identity);
 ELSIF TG_TABLE_NAME='fee_letter_matters' THEN identity:=NEW.fee_letter_id; valid:=_migration.fee_letter_edit_current_valid(identity);
 ELSE identity:=NEW.matter_id; valid:=_migration.matter_fee_reference_current_valid(identity); END IF;
 IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Task 4.6/4.7 aggregate lacks continuous authorized history'; END IF;
 RETURN NULL;
END;
$$;
DO $row_guards$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['documents','fee_letters','fee_letter_matters','matter_fee_letter_references'] LOOP
  EXECUTE format('CREATE TRIGGER zz_tasks46_47_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION _migration.tasks46_47_guard()',t);
  EXECUTE format('CREATE TRIGGER tasks46_47_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.tasks46_47_guard()',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER tasks46_47_complete AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.tasks46_47_complete()',t);
 END LOOP;
END
$row_guards$;

CREATE FUNCTION _migration.document_edit_values(p_values jsonb,p_original jsonb,p_create boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; result jsonb:=p_values; whitespace text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document fields'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_values) LOOP
  IF item.key NOT IN('matter_id','client_id','responsible_person_id','description','document_date','page_count','deposit_date','movement_card','storage_location','notes','mfiles_id') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported document field'; END IF;
  IF NOT p_create AND item.value IS NOT DISTINCT FROM p_original->item.key THEN result:=result-item.key; CONTINUE; END IF;
  IF item.key IN('matter_id','client_id','responsible_person_id') THEN
   IF NOT _migration.tasks46_47_positive(item.value,true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document relationship'; END IF;
  ELSIF item.key='page_count' THEN
   IF item.value<>'null'::jsonb AND (jsonb_typeof(item.value)<>'number' OR item.value::text!~'^(0|[1-9][0-9]{0,9})$' OR item.value::text::numeric>2147483647) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid page count'; END IF;
  ELSE
   IF jsonb_typeof(item.value) NOT IN('string','null') OR length(item.value#>>'{}')>10000
    OR (item.value#>>'{}')~'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document text'; END IF;
   IF item.key IN('document_date','deposit_date') AND item.value<>'null'::jsonb THEN
    IF (item.value#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (item.value#>>'{}') LIKE '0000-%' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Date-only value required'; END IF;
    PERFORM (item.value#>>'{}')::date;
   END IF;
  END IF;
 END LOOP;
 IF p_create AND btrim(coalesce((coalesce(p_original,'{}')||result)->>'description',''),whitespace)='' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Meaningful document description required'; END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION _migration.fee_letter_edit_values(p_values jsonb,p_original jsonb,p_create boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; result jsonb:=p_values;
BEGIN
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid fee-letter fields'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_values) LOOP
  IF item.key NOT IN('client_id','mfiles_id','contract_type','contract_date','contract_details','contract_structure') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported fee-letter field'; END IF;
  IF NOT p_create AND item.value IS NOT DISTINCT FROM p_original->item.key THEN result:=result-item.key; CONTINUE; END IF;
  IF item.key='client_id' THEN
   IF NOT _migration.tasks46_47_positive(item.value,true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid fee-letter client'; END IF;
  ELSE
   IF jsonb_typeof(item.value) NOT IN('string','null') OR length(item.value#>>'{}')>10000
    OR (item.value#>>'{}')~'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid fee-letter text'; END IF;
   IF item.key='contract_date' AND item.value<>'null'::jsonb THEN
    IF (item.value#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (item.value#>>'{}') LIKE '0000-%' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Date-only value required'; END IF;
    PERFORM (item.value#>>'{}')::date;
   END IF;
  END IF;
 END LOOP;
 IF p_create AND (NOT result ? 'client_id' OR result->'client_id'='null'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='New fee letter requires client'; END IF;
 RETURN result;
END;
$$;

CREATE FUNCTION _migration.document_edit_facts(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',d.id,'description',d.description,'archived',d.is_archived,
  'clientId',d.client_id,'matterId',d.matter_id,'responsiblePersonId',d.responsible_person_id,
  'parentArchived',CASE WHEN d.matter_id IS NOT NULL THEN coalesce(m.is_archived,false)
   WHEN d.client_id IS NOT NULL THEN coalesce(c.is_archived,false) ELSE false END)
 FROM public.documents d LEFT JOIN public.clients c ON c.id=d.client_id
 LEFT JOIN public.matters m ON m.id=d.matter_id WHERE d.id=p_id
$$;
CREATE FUNCTION _migration.fee_letter_edit_facts(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',f.id,'contractId',f.contract_id,'archived',f.is_archived,
  'clientId',f.client_id,'clientArchived',coalesce(c.is_archived,false),
  'coveredCurrent',(SELECT count(*) FROM public.fee_letter_matters l WHERE l.fee_letter_id=f.id AND NOT l.is_retired),
  'coveredRetired',(SELECT count(*) FROM public.fee_letter_matters l WHERE l.fee_letter_id=f.id AND l.is_retired),
  'referencingCurrent',(SELECT count(*) FROM public.matter_fee_letter_references r WHERE r.fee_letter_id=f.id AND NOT r.is_retired),
  'invoices',(SELECT count(*) FROM public.invoices i WHERE i.fee_letter_id=f.id))
 FROM public.fee_letters f LEFT JOIN public.clients c ON c.id=f.client_id WHERE f.id=p_id
$$;

CREATE FUNCTION public.document_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE record jsonb;
BEGIN
 PERFORM _migration.tasks46_47_read_account(p_account,p_session,p_role,p_expires,false);
 IF p_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',d.id,'version',d.row_version::text,'archived',d.is_archived,
   'values',to_jsonb(d),'facts',_migration.document_edit_facts(d.id)) INTO record
  FROM public.documents d WHERE d.id=p_id;
  IF record IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Document not found'; END IF;
 END IF;
 RETURN jsonb_build_object('record',record,
  'clients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name_ar,'active',NOT is_archived) ORDER BY name_ar COLLATE "arabic",id),'[]') FROM public.clients),
  'matters',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',case_number_ar,'active',NOT is_archived) ORDER BY case_number_ar COLLATE "arabic",id),'[]') FROM public.matters),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name_ar,'active',is_active,'staff',is_staff) ORDER BY name_ar COLLATE "arabic",id),'[]') FROM public.people));
END;
$$;

CREATE FUNCTION public.document_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; r record; receipt _migration.document_edit_submission%ROWTYPE; owner _migration.tasks46_47_submission_owner%ROWTYPE; original jsonb;
 before_state jsonb; after_state jsonb; patch jsonb; columns text; selections text; assignments text;
 op text; creating boolean; lifecycle boolean; old_matter integer; new_matter integer; old_client integer;
 new_client integer; old_person integer; new_person integer; v bigint; request_id uuid;
BEGIN
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 actor:=_migration.tasks46_47_require_account(p_account,p_session,p_role,p_expires,false);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document actor differs from trusted context'; END IF;
 SELECT * INTO r FROM _migration.tasks46_47_request_identity(p_request);
 op:=r.operation; creating:=op='create'; lifecycle:=op IN('archive','restore');
 IF op NOT IN('create','update','archive','restore') OR creating<>(r.identity IS NULL)
  OR (lifecycle AND p_role<>'Administrator') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document operation'; END IF;
	 PERFORM pg_advisory_xact_lock(hashtextextended(r.submission::text,4647));
	 SELECT * INTO owner FROM _migration.tasks46_47_submission_owner WHERE submission_id=r.submission;
	 IF FOUND AND (owner.actor_id<>actor OR owner.gateway<>'documents' OR owner.operation<>op OR owner.request_payload IS DISTINCT FROM p_request) THEN
	  RAISE EXCEPTION USING ERRCODE=CASE WHEN owner.actor_id<>actor THEN '42501' ELSE '22023' END,MESSAGE='submission payload differs across gateway, actor, or payload';
	 END IF;
	 SELECT * INTO receipt FROM _migration.document_edit_submission WHERE submission_id=r.submission;
	 IF FOUND THEN
	  IF owner.submission_id IS NULL THEN RAISE EXCEPTION 'Document receipt has no global submission owner'; END IF;
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Document submission payload differs'; END IF;
  RETURN jsonb_build_object('id',receipt.document_id,'version',receipt.result_version::text,'changed',true);
 END IF;
 IF NOT creating THEN
  SELECT to_jsonb(d) INTO original FROM public.documents d WHERE id=r.identity;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Document not found'; END IF;
 END IF;
 IF lifecycle THEN
  IF p_request->'values'<>'{}' OR p_request->'related'<>'null' OR p_request->'facts' IS DISTINCT FROM _migration.document_edit_facts(r.identity) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Document version or confirmation is stale'; END IF;
  patch:=jsonb_build_object('is_archived',op='archive');
 ELSE
  IF p_request->'facts'<>'null' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Document edit cannot contain lifecycle facts'; END IF;
  patch:=_migration.document_edit_values(p_request->'values',original,creating);
 END IF;
 old_matter:=(original->>'matter_id')::integer; old_client:=(original->>'client_id')::integer;
 old_person:=(original->>'responsible_person_id')::integer;
 new_matter:=CASE WHEN patch ? 'matter_id' THEN (patch->>'matter_id')::integer ELSE old_matter END;
 new_client:=CASE WHEN patch ? 'client_id' THEN (patch->>'client_id')::integer ELSE old_client END;
 new_person:=CASE WHEN patch ? 'responsible_person_id' THEN (patch->>'responsible_person_id')::integer ELSE old_person END;
 PERFORM 1 FROM public.matters WHERE id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_matter,new_matter]) x WHERE x IS NOT NULL) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.clients WHERE id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_client,new_client]) x WHERE x IS NOT NULL) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.people WHERE id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_person,new_person]) x WHERE x IS NOT NULL) ORDER BY id FOR UPDATE;
 IF new_matter IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.matters WHERE id=new_matter AND NOT is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived document parent'; END IF;
 ELSIF new_client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clients WHERE id=new_client AND NOT is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived document parent'; END IF;
 IF old_matter IS NOT NULL AND EXISTS(SELECT 1 FROM public.matters WHERE id=old_matter AND is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived document parent'; END IF;
 IF old_matter IS NULL AND old_client IS NOT NULL AND EXISTS(SELECT 1 FROM public.clients WHERE id=old_client AND is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived document parent'; END IF;
 IF patch ? 'client_id' AND new_client IS NOT NULL AND EXISTS(SELECT 1 FROM public.clients WHERE id=new_client AND is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived document client'; END IF;
 IF new_person IS NOT NULL AND new_person IS DISTINCT FROM old_person THEN
  PERFORM 1 FROM public.people WHERE id=new_person AND is_active AND is_staff FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active staff person required'; END IF;
 END IF;
 IF NOT creating THEN
  SELECT to_jsonb(d) INTO original FROM public.documents d WHERE id=r.identity FOR UPDATE;
  IF (original->>'row_version')::bigint<>r.expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Document version or confirmation is stale'; END IF;
  IF NOT lifecycle AND (original->>'is_archived')::boolean THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived document before editing'; END IF;
  before_state:=original;
 END IF;
 PERFORM _migration.tasks46_47_require_account(p_account,p_session,p_role,p_expires,lifecycle);
 IF NOT creating AND ((lifecycle AND (original->>'is_archived')::boolean=(op='archive')) OR (NOT lifecycle AND patch='{}')) THEN
  RETURN jsonb_build_object('id',r.identity,'version',r.expected::text,'changed',false);
 END IF;
 PERFORM public.audit_ensure_event_context(); PERFORM set_config('litigation.tasks46_47_gateway','on',true);
 IF creating THEN
  SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key)
   INTO columns,selections FROM jsonb_object_keys(patch) key;
  EXECUTE format('INSERT INTO public.documents(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.documents,$1) v RETURNING id',columns,selections) INTO r.identity USING patch;
 ELSE
  SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(patch) key;
  EXECUTE format('UPDATE public.documents d SET %srow_version=d.row_version+1 FROM jsonb_populate_record(NULL::public.documents,$1) v WHERE d.id=$2',CASE WHEN assignments IS NULL THEN '' ELSE assignments||',' END) USING original||patch,r.identity;
 END IF;
 IF lifecycle THEN PERFORM public.audit_append_semantic_event(op,'succeeded','public','documents',jsonb_build_object('id',r.identity),NULL,NULL,NULL,'{}',NULL,'{}'); END IF;
 SELECT row_version INTO v FROM public.documents WHERE id=r.identity; after_state:=_migration.document_edit_aggregate(r.identity);
 request_id:=current_setting('litigation.audit_request_id')::uuid;
 INSERT INTO _migration.document_edit_change VALUES(r.identity,v,actor,before_state,after_state,request_id);
	 INSERT INTO _migration.tasks46_47_submission_owner(submission_id,actor_id,gateway,operation,entity_id,request_payload,result_version) VALUES(r.submission,actor,'documents',op,r.identity,p_request,v);
	 INSERT INTO _migration.document_edit_submission(submission_id,actor_id,request_payload,document_id,result_version) VALUES(r.submission,actor,p_request,r.identity,v);
 RETURN jsonb_build_object('id',r.identity,'version',v::text,'changed',true);
END;
$$;

CREATE FUNCTION public.fee_letter_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE record jsonb;
BEGIN
 PERFORM _migration.tasks46_47_read_account(p_account,p_session,p_role,p_expires,false);
 IF p_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',f.id,'version',f.row_version::text,'archived',f.is_archived,
   'values',to_jsonb(f),'facts',_migration.fee_letter_edit_facts(f.id),
   'covered',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'matterId',l.matter_id,
    'retired',l.is_retired,'order',coalesce(l.current_order,l.ordinal+1),'original',l.legacy_source_record_key IS NOT NULL)
    ORDER BY coalesce(l.current_order,l.ordinal+1),l.id),'[]') FROM public.fee_letter_matters l WHERE l.fee_letter_id=f.id)) INTO record
  FROM public.fee_letters f WHERE f.id=p_id;
  IF record IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Fee letter not found'; END IF;
 END IF;
 RETURN jsonb_build_object('record',record,
  'clients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name_ar,'active',NOT is_archived) ORDER BY name_ar COLLATE "arabic",id),'[]') FROM public.clients),
  'matters',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',case_number_ar,'active',NOT is_archived) ORDER BY case_number_ar COLLATE "arabic",id),'[]') FROM public.matters));
END;
$$;

CREATE FUNCTION public.fee_letter_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; r record; receipt _migration.fee_letter_edit_submission%ROWTYPE; owner _migration.tasks46_47_submission_owner%ROWTYPE; original jsonb;
 before_state jsonb; after_state jsonb; patch jsonb; columns text; selections text; assignments text;
 op text; creating boolean; lifecycle boolean; relation boolean; old_client integer; new_client integer;
 member_id integer; target_matter integer; next_order integer; v bigint; request_id uuid;
BEGIN
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 actor:=_migration.tasks46_47_require_account(p_account,p_session,p_role,p_expires,false);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Fee-letter actor differs from trusted context'; END IF;
 SELECT * INTO r FROM _migration.tasks46_47_request_identity(p_request);
 op:=r.operation; creating:=op='create'; lifecycle:=op IN('archive','restore'); relation:=op IN('covered-add','covered-retire','covered-restore');
 IF op NOT IN('create','update','archive','restore','covered-add','covered-retire','covered-restore')
  OR creating<>(r.identity IS NULL) OR (lifecycle AND p_role<>'Administrator') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid fee-letter operation'; END IF;
	 PERFORM pg_advisory_xact_lock(hashtextextended(r.submission::text,4647));
	 SELECT * INTO owner FROM _migration.tasks46_47_submission_owner WHERE submission_id=r.submission;
	 IF FOUND AND (owner.actor_id<>actor OR owner.gateway<>'fee_letters' OR owner.operation<>op OR owner.request_payload IS DISTINCT FROM p_request) THEN
	  RAISE EXCEPTION USING ERRCODE=CASE WHEN owner.actor_id<>actor THEN '42501' ELSE '22023' END,MESSAGE='submission payload differs across gateway, actor, or payload';
	 END IF;
	 SELECT * INTO receipt FROM _migration.fee_letter_edit_submission WHERE submission_id=r.submission;
	 IF FOUND THEN
	  IF owner.submission_id IS NULL THEN RAISE EXCEPTION 'Fee-letter receipt has no global submission owner'; END IF;
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Fee-letter submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Fee-letter submission payload differs'; END IF;
  RETURN jsonb_build_object('id',receipt.fee_letter_id,'version',receipt.result_version::text,'changed',true);
 END IF;
 IF NOT creating THEN
  SELECT to_jsonb(f) INTO original FROM public.fee_letters f WHERE id=r.identity;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Fee letter not found'; END IF;
 END IF;
 IF lifecycle THEN
  IF p_request->'values'<>'{}' OR p_request->'related'<>'null' OR p_request->'facts' IS DISTINCT FROM _migration.fee_letter_edit_facts(r.identity) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Fee-letter version or confirmation is stale'; END IF;
  patch:=jsonb_build_object('is_archived',op='archive');
 ELSIF relation THEN
  IF p_request->'values'<>'{}' OR jsonb_typeof(p_request->'related')<>'object' OR p_request->'facts'<>'null' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid covered-matter request'; END IF;
  patch:='{}'; member_id:=(p_request->'related'->>'membershipId')::integer; target_matter:=(p_request->'related'->>'matterId')::integer;
  IF op='covered-add' AND (member_id IS NOT NULL OR NOT _migration.tasks46_47_positive(to_jsonb(target_matter),false)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid covered matter'; END IF;
  IF op<>'covered-add' AND NOT _migration.tasks46_47_positive(to_jsonb(member_id),false) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid covered membership'; END IF;
 ELSE
  IF p_request->'facts'<>'null' OR p_request->'related'<>'null' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid fee-letter edit request'; END IF;
  patch:=_migration.fee_letter_edit_values(p_request->'values',original,creating);
 END IF;
 old_client:=(original->>'client_id')::integer; new_client:=CASE WHEN patch ? 'client_id' THEN (patch->>'client_id')::integer ELSE old_client END;
 PERFORM 1 FROM public.clients WHERE id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_client,new_client]) x WHERE x IS NOT NULL) ORDER BY id FOR UPDATE;
 IF old_client IS NOT NULL AND EXISTS(SELECT 1 FROM public.clients WHERE id=old_client AND is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived fee-letter client'; END IF;
 IF new_client IS NOT NULL AND EXISTS(SELECT 1 FROM public.clients WHERE id=new_client AND is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived fee-letter client'; END IF;
 IF creating AND new_client IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='New fee letter requires client'; END IF;
 IF NOT creating THEN
  SELECT to_jsonb(f) INTO original FROM public.fee_letters f WHERE id=r.identity FOR UPDATE;
  IF (original->>'row_version')::bigint<>r.expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Fee-letter version or confirmation is stale'; END IF;
  IF NOT lifecycle AND (original->>'is_archived')::boolean THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived fee letter before editing'; END IF;
  before_state:=_migration.fee_letter_edit_aggregate(r.identity);
 END IF;
 IF relation THEN
  IF op='covered-add' THEN
   PERFORM 1 FROM public.matters WHERE id=target_matter AND NOT is_archived FOR UPDATE;
   IF NOT FOUND OR EXISTS(SELECT 1 FROM public.fee_letter_matters l WHERE l.fee_letter_id=r.identity AND l.matter_id=target_matter AND NOT l.is_retired) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid or duplicate covered matter'; END IF;
  ELSE
   SELECT l.matter_id INTO target_matter FROM public.fee_letter_matters l WHERE l.id=member_id AND l.fee_letter_id=r.identity FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Covered membership not found'; END IF;
   PERFORM 1 FROM public.matters WHERE id=target_matter AND NOT is_archived FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived covered matter'; END IF;
   IF op='covered-retire' AND (SELECT is_retired FROM public.fee_letter_matters WHERE id=member_id) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Covered membership already retired'; END IF;
   IF op='covered-restore' AND (NOT (SELECT is_retired FROM public.fee_letter_matters WHERE id=member_id)
    OR EXISTS(SELECT 1 FROM public.fee_letter_matters l WHERE l.fee_letter_id=r.identity AND l.matter_id=target_matter AND NOT l.is_retired)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Covered membership cannot be restored'; END IF;
  END IF;
 END IF;
 PERFORM _migration.tasks46_47_require_account(p_account,p_session,p_role,p_expires,lifecycle);
 IF NOT creating AND ((lifecycle AND (original->>'is_archived')::boolean=(op='archive')) OR (op='update' AND patch='{}')) THEN RETURN jsonb_build_object('id',r.identity,'version',r.expected::text,'changed',false); END IF;
 PERFORM public.audit_ensure_event_context(); PERFORM set_config('litigation.tasks46_47_gateway','on',true);
 IF creating THEN
  SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key) INTO columns,selections FROM jsonb_object_keys(patch) key;
  EXECUTE format('INSERT INTO public.fee_letters(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.fee_letters,$1) v RETURNING id',columns,selections) INTO r.identity USING patch;
 ELSIF relation THEN
  IF op='covered-add' THEN
   SELECT coalesce(max(coalesce(current_order,ordinal+1)),0)+1 INTO next_order FROM public.fee_letter_matters WHERE fee_letter_id=r.identity;
   INSERT INTO public.fee_letter_matters(fee_letter_id,matter_id,current_order) VALUES(r.identity,target_matter,next_order);
  ELSIF op='covered-retire' THEN UPDATE public.fee_letter_matters SET is_retired=true WHERE id=member_id;
  ELSE UPDATE public.fee_letter_matters SET is_retired=false WHERE id=member_id; END IF;
  UPDATE public.fee_letters SET row_version=row_version+1 WHERE id=r.identity;
 ELSE
  SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(patch) key;
  EXECUTE format('UPDATE public.fee_letters f SET %srow_version=f.row_version+1 FROM jsonb_populate_record(NULL::public.fee_letters,$1) v WHERE f.id=$2',CASE WHEN assignments IS NULL THEN '' ELSE assignments||',' END) USING original||patch,r.identity;
 END IF;
 IF lifecycle THEN PERFORM public.audit_append_semantic_event(op,'succeeded','public','fee_letters',jsonb_build_object('id',r.identity),NULL,NULL,NULL,'{}',NULL,'{}'); END IF;
 SELECT row_version INTO v FROM public.fee_letters WHERE id=r.identity; after_state:=_migration.fee_letter_edit_aggregate(r.identity);
 request_id:=current_setting('litigation.audit_request_id')::uuid;
 INSERT INTO _migration.fee_letter_edit_change VALUES(r.identity,v,actor,before_state,after_state,request_id);
	 INSERT INTO _migration.tasks46_47_submission_owner(submission_id,actor_id,gateway,operation,entity_id,request_payload,result_version) VALUES(r.submission,actor,'fee_letters',op,r.identity,p_request,v);
	 INSERT INTO _migration.fee_letter_edit_submission(submission_id,actor_id,request_payload,fee_letter_id,result_version) VALUES(r.submission,actor,p_request,r.identity,v);
 RETURN jsonb_build_object('id',r.identity,'version',v::text,'changed',true);
END;
$$;

CREATE FUNCTION public.matter_fee_reference_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_matter integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM _migration.tasks46_47_read_account(p_account,p_session,p_role,p_expires,false);
 IF NOT EXISTS(SELECT 1 FROM public.matters WHERE id=p_matter) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Matter not found'; END IF;
 RETURN _migration.matter_fee_reference_aggregate(p_matter)||jsonb_build_object(
  'matterArchived',(SELECT is_archived FROM public.matters WHERE id=p_matter),
  'matterName',(SELECT case_number_ar FROM public.matters WHERE id=p_matter),
  'feeLetters',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'contractId',f.contract_id,'clientName',c.name_ar,
   'active',NOT f.is_archived AND NOT coalesce(c.is_archived,false)) ORDER BY f.id DESC),'[]')
   FROM public.fee_letters f LEFT JOIN public.clients c ON c.id=f.client_id));
END;
$$;
CREATE FUNCTION public.matter_fee_reference_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; r record; receipt _migration.matter_fee_reference_submission%ROWTYPE; owner _migration.tasks46_47_submission_owner%ROWTYPE;
 op text; old_fee integer; new_fee integer; current_ref integer; version bigint; before_state jsonb; after_state jsonb; request_id uuid;
BEGIN
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 actor:=_migration.tasks46_47_require_account(p_account,p_session,p_role,p_expires,false);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Matter fee-reference actor differs from trusted context'; END IF;
 SELECT * INTO r FROM _migration.tasks46_47_request_identity(p_request); op:=r.operation;
 IF op NOT IN('set','clear','replace') OR r.identity IS NULL OR p_request->'values'<>'{}' OR p_request->'facts'<>'null'
  OR jsonb_typeof(p_request->'related')<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid matter fee-reference request'; END IF;
 old_fee:=(p_request->'related'->>'oldFeeLetterId')::integer; new_fee:=(p_request->'related'->>'newFeeLetterId')::integer;
 IF (op='set' AND (old_fee IS NOT NULL OR new_fee IS NULL)) OR (op='clear' AND (old_fee IS NULL OR new_fee IS NOT NULL))
  OR (op='replace' AND (old_fee IS NULL OR new_fee IS NULL OR old_fee=new_fee)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Explicit set/clear/replace values required'; END IF;
	 PERFORM pg_advisory_xact_lock(hashtextextended(r.submission::text,4647));
	 SELECT * INTO owner FROM _migration.tasks46_47_submission_owner WHERE submission_id=r.submission;
	 IF FOUND AND (owner.actor_id<>actor OR owner.gateway<>'matter_fee_references' OR owner.operation<>op OR owner.request_payload IS DISTINCT FROM p_request) THEN
	  RAISE EXCEPTION USING ERRCODE=CASE WHEN owner.actor_id<>actor THEN '42501' ELSE '22023' END,MESSAGE='submission payload differs across gateway, actor, or payload';
	 END IF;
	 SELECT * INTO receipt FROM _migration.matter_fee_reference_submission WHERE submission_id=r.submission;
	 IF FOUND THEN
	  IF owner.submission_id IS NULL THEN RAISE EXCEPTION 'Matter fee-reference receipt has no global submission owner'; END IF;
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Matter fee-reference submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Matter fee-reference submission payload differs'; END IF;
  RETURN jsonb_build_object('id',receipt.matter_id,'version',receipt.result_version::text,'changed',true);
 END IF;
 INSERT INTO _migration.matter_fee_reference_state(matter_id) VALUES(r.identity) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.matters WHERE id=r.identity AND NOT is_archived FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before fee-reference change'; END IF;
 PERFORM 1 FROM public.matter_fee_letter_references WHERE matter_id=r.identity AND NOT is_retired FOR UPDATE;
 SELECT fee_letter_id INTO current_ref FROM public.matter_fee_letter_references WHERE matter_id=r.identity AND NOT is_retired;
 IF (op='set' AND current_ref IS NOT NULL) OR (op IN('clear','replace') AND current_ref IS DISTINCT FROM old_fee) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Matter fee-reference version or subject is stale'; END IF;
 IF (SELECT row_version FROM _migration.matter_fee_reference_state WHERE matter_id=r.identity FOR UPDATE)<>r.expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Matter fee-reference version or subject is stale'; END IF;
 PERFORM 1 FROM public.fee_letters f
  WHERE f.id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_fee,new_fee]) x WHERE x IS NOT NULL)
  ORDER BY f.id FOR UPDATE;
 PERFORM 1 FROM public.clients c WHERE c.id IN(SELECT DISTINCT f.client_id FROM public.fee_letters f
  WHERE f.id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_fee,new_fee]) x WHERE x IS NOT NULL)
   AND f.client_id IS NOT NULL) ORDER BY c.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.fee_letters f LEFT JOIN public.clients c ON c.id=f.client_id
  WHERE f.id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_fee,new_fee]) x WHERE x IS NOT NULL)
   AND (f.is_archived OR (f.client_id IS NOT NULL AND c.is_archived)))
  OR (SELECT count(*) FROM public.fee_letters WHERE id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_fee,new_fee]) x WHERE x IS NOT NULL))
    <>(SELECT count(DISTINCT x) FROM unnest(ARRAY[old_fee,new_fee]) x WHERE x IS NOT NULL) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore affected fee letter and client'; END IF;
 before_state:=_migration.matter_fee_reference_aggregate(r.identity);
 PERFORM _migration.tasks46_47_require_account(p_account,p_session,p_role,p_expires,false);
 PERFORM public.audit_ensure_event_context(); PERFORM set_config('litigation.tasks46_47_gateway','on',true);
 IF old_fee IS NOT NULL THEN UPDATE public.matter_fee_letter_references SET is_retired=true WHERE matter_id=r.identity AND fee_letter_id=old_fee AND NOT is_retired; END IF;
 IF new_fee IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.matter_fee_letter_references WHERE matter_id=r.identity AND fee_letter_id=new_fee) THEN
   UPDATE public.matter_fee_letter_references SET is_retired=false WHERE matter_id=r.identity AND fee_letter_id=new_fee;
  ELSE INSERT INTO public.matter_fee_letter_references(matter_id,fee_letter_id) VALUES(r.identity,new_fee); END IF;
 END IF;
 UPDATE _migration.matter_fee_reference_state SET row_version=row_version+1 WHERE matter_id=r.identity RETURNING row_version INTO version;
 after_state:=_migration.matter_fee_reference_aggregate(r.identity); request_id:=current_setting('litigation.audit_request_id')::uuid;
 INSERT INTO _migration.matter_fee_reference_change VALUES(r.identity,version,actor,before_state,after_state,request_id);
	 INSERT INTO _migration.tasks46_47_submission_owner(submission_id,actor_id,gateway,operation,entity_id,request_payload,result_version) VALUES(r.submission,actor,'matter_fee_references',op,r.identity,p_request,version);
	 INSERT INTO _migration.matter_fee_reference_submission(submission_id,actor_id,request_payload,matter_id,result_version) VALUES(r.submission,actor,p_request,r.identity,version);
 RETURN jsonb_build_object('id',r.identity,'version',version::text,'changed',true);
END;
$$;

-- Narrow read gateways expose only aggregate evidence counts. Runtime never
-- receives access to the quarantine or migration schemas themselves.
CREATE FUNCTION public.document_edit_evidence_count(p_source_key text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT count(*)::integer FROM quarantine.document_evidence e
  WHERE e.src_record_key=p_source_key
$$;
CREATE FUNCTION public.fee_letter_edit_forward_quarantine_count(p_contract_id integer) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT count(*)::integer FROM quarantine.fee_letter_matter_transform q
  WHERE q.parent_contract_id_raw=p_contract_id::text
$$;
CREATE FUNCTION public.fee_letter_edit_reverse_quarantine_count(p_source_key text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT count(*)::integer FROM quarantine.matter_fee_letter_reference q
  WHERE q.resolved_fee_letter_source_key=p_source_key
$$;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.documents,public.fee_letters,
 public.fee_letter_matters,public.matter_fee_letter_references FROM litigation_runtime;
REVOKE ALL ON SEQUENCE public.documents_id_seq,public.fee_letters_id_seq,
 public.fee_letter_matters_id_seq,public.matter_fee_letter_references_id_seq FROM litigation_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA _migration FROM litigation_runtime;
DO $permissions$
DECLARE routine regprocedure;
BEGIN
 FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN('public','_migration') AND (p.proname LIKE 'document_edit_%'
   OR p.proname LIKE 'fee_letter_edit_%' OR p.proname LIKE 'matter_fee_reference_%'
   OR p.proname LIKE 'tasks46_47_%') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine);
 END LOOP;
END
$permissions$;
GRANT EXECUTE ON FUNCTION public.document_edit_state(integer,integer,text,timestamptz,integer),
 public.document_edit_save(integer,integer,text,timestamptz,jsonb),
 public.document_edit_evidence_count(text),
 public.fee_letter_edit_state(integer,integer,text,timestamptz,integer),
 public.fee_letter_edit_save(integer,integer,text,timestamptz,jsonb),
 public.fee_letter_edit_forward_quarantine_count(integer),
 public.fee_letter_edit_reverse_quarantine_count(text),
 public.matter_fee_reference_edit_state(integer,integer,text,timestamptz,integer),
 public.matter_fee_reference_edit_save(integer,integer,text,timestamptz,jsonb) TO litigation_runtime;

DO $postcondition$
DECLARE invalid_documents integer; invalid_fees integer; invalid_matter_references integer; invalid_receipts integer;
BEGIN
 SELECT count(*) INTO invalid_documents FROM public.documents d WHERE _migration.document_edit_current_valid(d.id) IS DISTINCT FROM true;
 SELECT count(*) INTO invalid_fees FROM public.fee_letters f WHERE _migration.fee_letter_edit_current_valid(f.id) IS DISTINCT FROM true;
	 SELECT count(*) INTO invalid_matter_references FROM public.matters m WHERE _migration.matter_fee_reference_current_valid(m.id) IS DISTINCT FROM true;
	 SELECT count(*) INTO invalid_receipts FROM _migration.tasks46_47_submission_owner o WHERE
	  (o.gateway='documents' AND NOT EXISTS(SELECT 1 FROM _migration.document_edit_submission s WHERE s.submission_id=o.submission_id AND s.actor_id=o.actor_id AND s.document_id=o.entity_id AND s.result_version=o.result_version AND s.request_payload IS NOT DISTINCT FROM o.request_payload)) OR
	  (o.gateway='fee_letters' AND NOT EXISTS(SELECT 1 FROM _migration.fee_letter_edit_submission s WHERE s.submission_id=o.submission_id AND s.actor_id=o.actor_id AND s.fee_letter_id=o.entity_id AND s.result_version=o.result_version AND s.request_payload IS NOT DISTINCT FROM o.request_payload)) OR
	  (o.gateway='matter_fee_references' AND NOT EXISTS(SELECT 1 FROM _migration.matter_fee_reference_submission s WHERE s.submission_id=o.submission_id AND s.actor_id=o.actor_id AND s.matter_id=o.entity_id AND s.result_version=o.result_version AND s.request_payload IS NOT DISTINCT FROM o.request_payload));
	 IF invalid_documents<>0 OR invalid_fees<>0 OR invalid_matter_references<>0 OR invalid_receipts<>0 THEN
	  RAISE EXCEPTION 'Task 4.6/4.7 migration changed original values or relationships: documents %, fee letters %, matter references %, receipts %',invalid_documents,invalid_fees,invalid_matter_references,invalid_receipts;
 END IF;
END
$postcondition$;
COMMIT;
