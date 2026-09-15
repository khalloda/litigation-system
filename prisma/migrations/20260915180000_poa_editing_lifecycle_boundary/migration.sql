-- Task 4.5 / D64. Pending on real development; disposable proof only.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.powers_of_attorney,public.power_of_attorney_lawyers IN ACCESS EXCLUSIVE MODE;
CREATE TABLE _migration.poa_edit_import (
  entity_table text NOT NULL CHECK(entity_table IN ('powers_of_attorney','power_of_attorney_lawyers')),
  id integer NOT NULL,
  initial_values jsonb NOT NULL CHECK(jsonb_typeof(initial_values)='object' AND (initial_values->>'id')::integer=id),
  PRIMARY KEY(entity_table,id)
);
DO $precondition$
DECLARE t text; expected jsonb; actual jsonb; profile text; projection text;
BEGIN
  IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
    OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>69
    OR EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20260915180000_poa_editing_lifecycle_boundary') THEN
    RAISE EXCEPTION 'Exact complete migration-69 direct owner prestate required';
  END IF;
  SELECT b.profile INTO STRICT profile FROM _migration.staff_roster_boundary b;
  FOREACH t IN ARRAY ARRAY['powers_of_attorney','power_of_attorney_lawyers'] LOOP
    IF profile='historical-full-state-upgrade' THEN
      SELECT i-ARRAY['schema','table'] INTO STRICT expected FROM _migration.high_impact_application a,
        LATERAL jsonb_array_elements(a.before_inventory) i WHERE i->>'schema'='public' AND i->>'table'=t;
      EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''digest'',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''UTF8'')),''hex'')) FROM public.%I r WHERE NOT EXISTS(SELECT 1 FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) c WHERE c->>''table''=$1 AND (c->>''id'')::integer=r.id)',t) INTO actual USING t;
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Original pre-release power of attorney evidence differs: %',t; END IF;
    ELSIF profile='canonical-clean-replay' THEN
      EXECUTE format('SELECT count(*) FROM public.%I',t) INTO actual;
      IF actual<>'0'::jsonb THEN RAISE EXCEPTION 'Nonempty canonical power of attorney profile'; END IF;
    ELSE RAISE EXCEPTION 'Unrecognized power of attorney profile'; END IF;
    EXECUTE format('INSERT INTO _migration.poa_edit_import SELECT $1,id,to_jsonb(r) FROM public.%I r',t) USING t;
    -- Expand the old row shape before adding operational columns.
    SELECT string_agg(CASE WHEN a.attname='id' THEN 'id' WHEN a.atttypid='jsonb'::regtype THEN format('initial_values->%L AS %I',a.attname,a.attname) ELSE format('(initial_values->>%L)::%s AS %I',a.attname,format_type(a.atttypid,a.atttypmod),a.attname) END,',' ORDER BY a.attnum) INTO projection FROM pg_attribute a WHERE a.attrelid=format('public.%I',t)::regclass AND a.attnum>0 AND NOT a.attisdropped;
    EXECUTE format('CREATE VIEW _migration.poa_edit_initial_%I AS SELECT %s FROM _migration.poa_edit_import WHERE entity_table=%L',t,projection,t);
  END LOOP;
END
$precondition$;

CREATE FUNCTION _migration.poa_edit_require_account(p_account integer,p_version integer,p_role text,p_expires timestamptz,p_lock boolean) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
  IF p_expires IS NULL OR p_expires<=clock_timestamp() OR p_role NOT IN ('Administrator','Litigation Assistant') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized power of attorney session required';
  END IF;
  IF p_lock THEN
    PERFORM 1 FROM public.people p JOIN public.user_accounts u ON u.person_id=p.id WHERE u.id=p_account FOR SHARE OF p,u;
  END IF;
  SELECT a.id INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
    WHERE u.id=p_account AND u.session_version=p_version AND u.role_code=p_role AND u.is_enabled AND u.password_hash IS NOT NULL
      AND NOT u.must_change_password AND p.is_staff AND p.is_active AND p.can_login;
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized power of attorney session required'; END IF;
  RETURN actor;
END;
$$;
CREATE FUNCTION _migration.poa_edit_positive(v jsonb,nullable boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT coalesce((nullable AND v='null'::jsonb) OR (jsonb_typeof(v)='number' AND v::text ~ '^[1-9][0-9]{0,9}$' AND v::text::numeric<=2147483647),false)
$$;
CREATE TABLE _migration.poa_edit_boundary (
 singleton boolean PRIMARY KEY CHECK(singleton), profile text NOT NULL,
 inventory jsonb NOT NULL, established_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO _migration.poa_edit_boundary SELECT true,profile,
 (SELECT coalesce(jsonb_agg(x ORDER BY x->>'table'),'[]') FROM (
 SELECT jsonb_build_object('table',entity_table,'count',count(*),'digest',encode(sha256(convert_to(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE "C"),'UTF8')),'hex')) x
 FROM _migration.poa_edit_import GROUP BY entity_table) r) FROM _migration.staff_roster_boundary;
ALTER TABLE public.powers_of_attorney ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.power_of_attorney_lawyers ADD COLUMN is_retired boolean NOT NULL DEFAULT false, ADD COLUMN current_order integer CHECK(current_order>0);
CREATE UNIQUE INDEX poa_current_order_idx ON public.power_of_attorney_lawyers(power_of_attorney_id,current_order);
CREATE INDEX poa_operational_list_idx ON public.powers_of_attorney(is_archived,id);
CREATE TABLE _migration.poa_edit_submission (
 submission_id uuid PRIMARY KEY, actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 request_payload jsonb NOT NULL, poa_id integer NOT NULL REFERENCES public.powers_of_attorney(id),
 result_version bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT statement_timestamp(), UNIQUE(poa_id,result_version)
);
CREATE TABLE _migration.poa_edit_change (
 poa_id integer NOT NULL REFERENCES public.powers_of_attorney(id), version bigint NOT NULL,
 actor_id integer NOT NULL REFERENCES public.audit_actors(id), before_values jsonb, after_values jsonb NOT NULL,
 request_id uuid NOT NULL, PRIMARY KEY(poa_id,version)
);
CREATE FUNCTION _migration.poa_edit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'POA import, boundary and change evidence is immutable'; END;
$$;
DO $guards$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['poa_edit_import','poa_edit_boundary','poa_edit_submission','poa_edit_change'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.poa_edit_immutable()',t);
  IF t IN ('poa_edit_import','poa_edit_boundary') THEN EXECUTE format('CREATE TRIGGER immutable_insert BEFORE INSERT ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.poa_edit_immutable()',t); END IF;
 END LOOP;
END
$guards$;
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason) VALUES
 ('public','powers_of_attorney','row_version',64,'value','poa_aggregate_version'),
 ('public','powers_of_attorney','is_archived',64,'value','poa_archive_state'),
 ('public','power_of_attorney_lawyers','is_retired',64,'value','poa_current_membership_retirement'),
 ('public','power_of_attorney_lawyers','current_order',64,'value','poa_current_membership_order');
CREATE FUNCTION _migration.poa_edit_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('poa',to_jsonb(p),'lawyers',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p.id),'[]')) FROM public.powers_of_attorney p WHERE p.id=p_id
$$;
CREATE FUNCTION _migration.poa_edit_initial_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('poa',p.initial_values||jsonb_build_object('row_version',1,'is_archived',false),'lawyers',coalesce((SELECT jsonb_agg(l.initial_values||jsonb_build_object('is_retired',false,'current_order',NULL) ORDER BY l.id) FROM _migration.poa_edit_import l WHERE entity_table='power_of_attorney_lawyers' AND (initial_values->>'power_of_attorney_id')::integer=p_id),'[]')) FROM _migration.poa_edit_import p WHERE entity_table='powers_of_attorney' AND p.id=p_id
$$;
CREATE FUNCTION _migration.poa_edit_facts(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('id',p.id,'principal',p.principal_name,'number',p.poa_number,'letter',p.poa_letter,'year',p.poa_year,
 'clientId',p.client_id,'clientName',c.name_ar,'parentArchived',coalesce(c.is_archived,false),'archived',p.is_archived,
 'copies',p.copies_count,'report',p.show_on_poa_report,
 'current',(SELECT count(*) FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p.id AND NOT l.is_retired),
 'retired',(SELECT count(*) FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p.id AND l.is_retired),
 'original',(SELECT count(*) FROM _migration.poa_edit_import l WHERE l.entity_table='power_of_attorney_lawyers' AND (initial_values->>'power_of_attorney_id')::integer=p.id))
 FROM public.powers_of_attorney p LEFT JOIN public.clients c ON c.id=p.client_id WHERE p.id=p_id
$$;
CREATE FUNCTION _migration.poa_edit_audit_matches(p_table text,p_prior jsonb,p_next jsonb,p_actor integer,p_request uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT count(*)=1 FROM public.audit_events e CROSS JOIN LATERAL (
 SELECT array_agg(f.field_name ORDER BY f.field_name) fields,
 CASE WHEN p_prior IS NULL THEN '{}'::jsonb ELSE coalesce(jsonb_object_agg(f.field_name,public.audit_bound_json_value(p_prior->f.field_name,f.max_text_characters,f.capture_mode)),'{}') END before_values,
 coalesce(jsonb_object_agg(f.field_name,public.audit_bound_json_value(p_next->f.field_name,f.max_text_characters,f.capture_mode)),'{}') after_values
 FROM public.audit_event_fields f WHERE f.entity_schema='public' AND f.entity_table=p_table AND f.capture_mode IN('value','redacted') AND (p_prior IS NULL OR p_prior->f.field_name IS DISTINCT FROM p_next->f.field_name)
 ) expected WHERE p_table IN('powers_of_attorney','power_of_attorney_lawyers')
 AND e.entity_schema='public' AND e.entity_table=p_table AND e.entity_key=jsonb_build_object('id',(p_next->>'id')::integer)
 AND e.actor_id=p_actor AND e.request_id=p_request AND e.outcome='succeeded'
 AND e.actor_role_snapshot IN('Administrator','Litigation Assistant')
 AND e.action=CASE WHEN p_table='powers_of_attorney' THEN CASE WHEN p_prior IS NULL THEN 'record_created' ELSE 'record_updated' END ELSE CASE WHEN p_prior IS NULL THEN 'relationship_added' ELSE 'relationship_updated' END END
 AND e.changed_fields=expected.fields AND e.before_values=expected.before_values AND e.after_values=expected.after_values
$$;
CREATE FUNCTION _migration.poa_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb:=_migration.poa_edit_initial_aggregate(p_id); c record; s record; v bigint; op text; prior jsonb; next_row jsonb; member jsonb; old_member jsonb; selected jsonb; k text;
BEGIN
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.poa_edit_change WHERE poa_id=p_id ORDER BY version LOOP
  SELECT * INTO s FROM _migration.poa_edit_submission WHERE poa_id=p_id AND result_version=c.version;
  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR (c.after_values->'poa'->>'id')::integer IS DISTINCT FROM p_id
   OR (c.after_values->'poa'->>'row_version')::bigint IS DISTINCT FROM v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='powers_of_attorney' AND e.entity_schema='public' AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.after_values->>'row_version'=v::text AND e.action IN('record_created','record_updated') AND e.outcome='succeeded') THEN RETURN false; END IF;
  op:=s.request_payload->>'operation'; prior:=expected->'poa'; next_row:=c.after_values->'poa';
  IF op NOT IN('create','update','archive','restore') OR (op='create')<>(expected IS NULL)
   OR (op<>'create' AND (s.request_payload->>'id' IS DISTINCT FROM p_id::text OR s.request_payload->>'version' IS DISTINCT FROM (v-1)::text)) THEN RETURN false; END IF;
  IF NOT _migration.poa_edit_audit_matches('powers_of_attorney',prior,next_row,c.actor_id,c.request_id) THEN RETURN false; END IF;
  IF op IN('archive','restore') THEN
   IF next_row-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM prior-ARRAY['is_archived','row_version','updated_at','updated_by']
    OR next_row->'is_archived' IS DISTINCT FROM to_jsonb(op='archive') OR next_row->'is_archived' IS NOT DISTINCT FROM prior->'is_archived'
    OR c.after_values->'lawyers' IS DISTINCT FROM expected->'lawyers'
    OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='powers_of_attorney' AND e.entity_key=jsonb_build_object('id',p_id) AND e.request_id=c.request_id AND e.actor_id=c.actor_id AND e.action=op AND e.outcome='succeeded' AND e.actor_role_snapshot='Administrator')
    OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='powers_of_attorney' AND e.entity_key=jsonb_build_object('id',p_id) AND e.request_id=c.request_id AND e.actor_id=c.actor_id AND e.action='record_updated' AND e.after_values->>'row_version'=v::text AND e.actor_role_snapshot='Administrator') THEN RETURN false; END IF;
  ELSE
   IF next_row->'is_archived' IS DISTINCT FROM 'false'::jsonb OR (prior IS NOT NULL AND prior->'is_archived'<>'false'::jsonb) THEN RETURN false; END IF;
   IF prior IS NOT NULL AND next_row-ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report','row_version','updated_at','updated_by'] IS DISTINCT FROM prior-ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report','row_version','updated_at','updated_by'] THEN RETURN false; END IF;
   FOREACH k IN ARRAY ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report'] LOOP
    IF next_row->k IS DISTINCT FROM (CASE WHEN s.request_payload->'values' ? k THEN s.request_payload->'values'->k ELSE coalesce(prior->k,'null'::jsonb) END) THEN RETURN false; END IF;
   END LOOP;
   selected:=s.request_payload->'lawyers';
   IF selected<>'null'::jsonb THEN
    IF (SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM jsonb_array_elements(selected) x) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(l->'person_id' ORDER BY l->'person_id'),'[]') FROM jsonb_array_elements(c.after_values->'lawyers') l WHERE l->'is_retired'='false'::jsonb) THEN RETURN false; END IF;
   ELSIF c.after_values->'lawyers' IS DISTINCT FROM coalesce(expected->'lawyers','[]') THEN RETURN false; END IF;
   FOR member IN SELECT * FROM jsonb_array_elements(c.after_values->'lawyers') LOOP
    SELECT l INTO old_member FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l WHERE l->'id'=member->'id';
    IF (member->>'power_of_attorney_id')::integer IS DISTINCT FROM p_id THEN RETURN false; END IF;
    IF member IS DISTINCT FROM old_member AND NOT _migration.poa_edit_audit_matches('power_of_attorney_lawyers',old_member,member,c.actor_id,c.request_id) THEN RETURN false; END IF;
    IF old_member IS NOT NULL THEN
     IF member-ARRAY['is_retired','updated_at','updated_by'] IS DISTINCT FROM old_member-ARRAY['is_retired','updated_at','updated_by'] THEN RETURN false; END IF;
    ELSE
     IF member->'is_retired'<>'false'::jsonb OR member->>'current_order' IS NULL OR (member->>'current_order')::integer <= (SELECT coalesce(max(coalesce((l->>'current_order')::integer,(l->>'source_member_ordinal')::integer)),0) FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l) THEN RETURN false; END IF;
     FOR k IN SELECT key FROM jsonb_each(member) WHERE key LIKE 'legacy_%' OR key IN('reviewed_rule_id','source_member_ordinal') LOOP IF member->k<>'null'::jsonb THEN RETURN false; END IF; END LOOP;
    END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'lawyers') n WHERE n->'id'=l->'id')) THEN RETURN false; END IF;
  END IF;
  IF op='create' THEN
   FOR k IN SELECT key FROM jsonb_each(next_row) WHERE key LIKE 'legacy_%' OR key IN('client_name','poa_capacity_duplicate') LOOP IF next_row->k<>'null'::jsonb THEN RETURN false; END IF; END LOOP;
  END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.poa_edit_aggregate(p_id);
END;
$$;
CREATE FUNCTION _migration.poa_edit_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer;
BEGIN
 identity:=CASE WHEN TG_TABLE_NAME='powers_of_attorney' THEN (to_jsonb(NEW)->>'id')::integer ELSE (to_jsonb(NEW)->>'power_of_attorney_id')::integer END;
 IF _migration.poa_edit_current_valid(identity) IS DISTINCT FROM true THEN RAISE EXCEPTION 'POA aggregate lacks continuous authorized audited history'; END IF;
 RETURN NULL;
END;
$$;
CREATE FUNCTION _migration.poa_edit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE incoming jsonb; previous jsonb; allowed text[]; k text; parent integer;
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'POA history cannot be deleted'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE WHEN TG_TABLE_NAME='powers_of_attorney' THEN ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report','row_version','is_archived'] ELSE ARRAY['is_retired'] END;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  IF incoming-allowed-ARRAY['updated_at','updated_by'] IS DISTINCT FROM previous-allowed-ARRAY['updated_at','updated_by'] THEN RAISE EXCEPTION 'POA source, identity and member order are immutable'; END IF;
  IF TG_TABLE_NAME='powers_of_attorney' THEN
   IF (incoming->>'row_version')::bigint<>(previous->>'row_version')::bigint+1 THEN RAISE EXCEPTION 'POA version must advance exactly once'; END IF;
   IF incoming->'is_archived' IS DISTINCT FROM previous->'is_archived' THEN
    PERFORM _migration.client_contact_require_actor(true);
    IF incoming-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM previous-ARRAY['is_archived','row_version','updated_at','updated_by'] THEN RAISE EXCEPTION 'POA lifecycle cannot change business values'; END IF;
   ELSIF OLD.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived POA before editing'; END IF;
  END IF;
 ELSE
  FOR k IN SELECT key FROM jsonb_each(incoming) WHERE key LIKE 'legacy_%' OR key IN('client_name','poa_capacity_duplicate','reviewed_rule_id','source_member_ordinal') LOOP
   IF incoming->k<>'null'::jsonb THEN RAISE EXCEPTION 'Native POA cannot invent source evidence'; END IF;
  END LOOP;
  IF TG_TABLE_NAME='powers_of_attorney' AND ((incoming->>'is_archived')::boolean OR (incoming->>'row_version')::bigint<>1) THEN RAISE EXCEPTION 'Native POA starts current at version one'; END IF;
  IF TG_TABLE_NAME='power_of_attorney_lawyers' AND ((incoming->>'is_retired')::boolean OR incoming->>'current_order' IS NULL) THEN RAISE EXCEPTION 'Native POA member requires current order'; END IF;
 END IF;
 IF TG_TABLE_NAME='powers_of_attorney' THEN parent:=(incoming->>'client_id')::integer;
 ELSE
  SELECT client_id INTO parent FROM public.powers_of_attorney WHERE id=NEW.power_of_attorney_id AND NOT is_archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived POA before changing lawyers'; END IF;
 END IF;
 IF parent IS NOT NULL THEN
  PERFORM 1 FROM public.clients WHERE id=parent AND NOT is_archived FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived client before changing POA'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
DO $row_guards$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['powers_of_attorney','power_of_attorney_lawyers'] LOOP
  EXECUTE format('CREATE TRIGGER zz_poa_edit_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION _migration.poa_edit_guard()',t);
  EXECUTE format('CREATE TRIGGER poa_edit_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.poa_edit_guard()',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER poa_edit_complete AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.poa_edit_complete()',t);
 END LOOP;
END
$row_guards$;
CREATE FUNCTION _migration.poa_edit_values(p_values jsonb,p_original jsonb,p_create boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; result jsonb:=p_values; whitespace text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid POA fields'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_values) LOOP
  IF item.key NOT IN('client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported POA field'; END IF;
  IF NOT p_create AND item.value IS NOT DISTINCT FROM p_original->item.key THEN result:=result-item.key; CONTINUE; END IF;
  IF item.key='client_id' THEN
   IF NOT _migration.poa_edit_positive(item.value,true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid client'; END IF;
  ELSIF item.key='copies_count' THEN
   IF item.value<>'null'::jsonb AND (jsonb_typeof(item.value)<>'number' OR item.value::text !~ '^(0|[1-9][0-9]{0,9})$' OR item.value::text::numeric>2147483647) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid copies count'; END IF;
  ELSIF item.key='show_on_poa_report' THEN
   IF jsonb_typeof(item.value) NOT IN('null','boolean') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid report setting'; END IF;
  ELSE
   IF jsonb_typeof(item.value) NOT IN('string','null') OR length(item.value#>>'{}')>10000 OR (item.value#>>'{}') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid POA text'; END IF;
   IF item.key='issue_date' AND item.value<>'null'::jsonb THEN
    IF (item.value#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (item.value#>>'{}') LIKE '0000-%' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Date-only value required'; END IF;
    PERFORM (item.value#>>'{}')::date;
   END IF;
  END IF;
 END LOOP;
 IF p_create AND btrim(coalesce((coalesce(p_original,'{}')||result)->>'principal_name',''),whitespace)='' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Meaningful principal required'; END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION public.poa_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE record jsonb;
BEGIN
 PERFORM _migration.poa_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF p_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',p.id,'version',p.row_version::text,'archived',p.is_archived,'parentArchived',coalesce(c.is_archived,false),'values',to_jsonb(p),'sourceClient',p.client_name,'sourceLawyers',p.legacy_lawyers_raw) INTO record FROM public.powers_of_attorney p LEFT JOIN public.clients c ON c.id=p.client_id WHERE p.id=p_id;
  IF record IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='POA not found'; END IF;
 END IF;
 RETURN jsonb_build_object('record',record,'facts',_migration.poa_edit_facts(p_id),
 'clients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name_ar,'active',NOT c.is_archived) ORDER BY c.name_ar COLLATE "arabic",c.id),'[]') FROM public.clients c WHERE NOT c.is_archived OR c.id=(record->'values'->>'client_id')::integer),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name_ar,'active',p.is_active,'staff',p.is_staff) ORDER BY p.name_ar COLLATE "arabic",p.id),'[]') FROM public.people p WHERE p.is_active OR EXISTS(SELECT 1 FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p_id AND l.person_id=p.id)),
 'lawyers',(SELECT coalesce(jsonb_agg(jsonb_build_object('personId',l.person_id,'retired',l.is_retired,'original',l.legacy_source_record_key IS NOT NULL,'order',coalesce(l.current_order,l.source_member_ordinal)) ORDER BY coalesce(l.current_order,l.source_member_ordinal),l.id),'[]') FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p_id));
END;
$$;
CREATE FUNCTION public.poa_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; expected bigint; submission uuid; receipt _migration.poa_edit_submission%ROWTYPE;
 original jsonb; before_state jsonb; patch jsonb; after_state jsonb; parent integer; selected_parent integer; version bigint;
 columns text; selections text; assignments text; op text; creating boolean; lifecycle boolean; next_order integer; person integer; desired jsonb; changed_members boolean:=false;
BEGIN
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 actor:=_migration.poa_edit_require_account(p_account,p_session,p_role,p_expires,true);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='POA actor differs from trusted context'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>200000 OR NOT p_request ?& ARRAY['operation','id','version','submission','values','lawyers','facts'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('operation','id','version','submission','values','lawyers','facts')) OR NOT _migration.poa_edit_positive(p_request->'id',true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid POA request'; END IF;
 op:=p_request->>'operation'; creating:=op='create'; lifecycle:=op IN('archive','restore');
 IF op IS NULL OR op NOT IN('create','update','archive','restore') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid POA operation'; END IF;
 IF lifecycle AND p_role<>'Administrator' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='POA lifecycle requires Administrator'; END IF;
 identity:=(p_request->>'id')::integer;
 IF creating<>(identity IS NULL) OR (creating AND p_request->'version'<>'null'::jsonb) OR (NOT creating AND (jsonb_typeof(p_request->'version')<>'string' OR (p_request->>'version') !~ '^[1-9][0-9]{0,18}$')) OR jsonb_typeof(p_request->'submission')<>'string' OR (p_request->>'submission') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid POA identity/version'; END IF;
 expected:=(p_request->>'version')::bigint; submission:=(p_request->>'submission')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(submission::text,45));
 SELECT * INTO receipt FROM _migration.poa_edit_submission WHERE submission_id=submission;
 IF FOUND THEN
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='POA submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='POA submission payload differs'; END IF;
  RETURN jsonb_build_object('id',receipt.poa_id,'version',receipt.result_version::text,'changed',true);
 END IF;
 IF NOT creating THEN
  SELECT to_jsonb(p) INTO original FROM public.powers_of_attorney p WHERE id=identity;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='POA not found'; END IF;
  parent:=(original->>'client_id')::integer;
 END IF;
 IF lifecycle THEN
  IF p_request->'values'<>'{}'::jsonb OR p_request->'lawyers'<>'null'::jsonb OR jsonb_typeof(p_request->'facts')<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid POA confirmation'; END IF;
  patch:='{}';
 ELSE
  IF p_request->'facts'<>'null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Editing cannot contain lifecycle facts'; END IF;
  patch:=_migration.poa_edit_values(p_request->'values',original,creating);
 END IF;
 selected_parent:=CASE WHEN patch ? 'client_id' THEN (patch->>'client_id')::integer ELSE parent END;
 -- Shared roster mutex; client mutations meet on parent row locks in deterministic order.
 FOR person IN SELECT DISTINCT x FROM unnest(ARRAY[parent,selected_parent]) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM 1 FROM public.clients WHERE id=person AND NOT is_archived FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived client before changing POA'; END IF;
 END LOOP;
 IF NOT creating THEN
  SELECT to_jsonb(p) INTO original FROM public.powers_of_attorney p WHERE id=identity FOR UPDATE;
  IF (original->>'row_version')::bigint<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='POA version or confirmation is stale'; END IF;
  IF NOT lifecycle AND (original->>'is_archived')::boolean THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived POA before editing'; END IF;
  before_state:=_migration.poa_edit_aggregate(identity);
 END IF;
 desired:=p_request->'lawyers';
 IF desired<>'null'::jsonb THEN
  IF jsonb_typeof(desired)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(desired) x WHERE NOT _migration.poa_edit_positive(x,false)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lawyer selections'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(desired))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(desired) x) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate lawyer selections'; END IF;
  FOR person IN SELECT x::text::integer FROM jsonb_array_elements(desired) x ORDER BY x::text::integer LOOP
   PERFORM 1 FROM public.people WHERE id=person FOR SHARE;
   IF NOT FOUND OR (NOT (SELECT is_active FROM public.people WHERE id=person) AND NOT EXISTS(SELECT 1 FROM public.power_of_attorney_lawyers WHERE power_of_attorney_id=identity AND person_id=person AND NOT is_retired)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active existing person required for new selection'; END IF;
  END LOOP;
  changed_members:=(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM jsonb_array_elements(desired) x) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(person_id ORDER BY person_id),'[]') FROM public.power_of_attorney_lawyers WHERE power_of_attorney_id=identity AND NOT is_retired);
 END IF;
 IF lifecycle AND p_request->'facts' IS DISTINCT FROM _migration.poa_edit_facts(identity) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='POA version or confirmation is stale'; END IF;
 PERFORM _migration.poa_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF NOT creating AND ((lifecycle AND (original->>'is_archived')::boolean=(op='archive')) OR (NOT lifecycle AND patch='{}' AND NOT changed_members)) THEN RETURN jsonb_build_object('id',identity,'version',expected::text,'changed',false); END IF;
 PERFORM public.audit_ensure_event_context();
 IF creating THEN
  SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key) INTO columns,selections FROM jsonb_object_keys(patch) key;
  EXECUTE format('INSERT INTO public.powers_of_attorney(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.powers_of_attorney,$1) v RETURNING id',columns,selections) INTO identity USING patch;
 ELSE
  IF lifecycle THEN patch:=jsonb_build_object('is_archived',op='archive'); END IF;
  SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(patch) key;
  EXECUTE format('UPDATE public.powers_of_attorney p SET %srow_version=p.row_version+1 FROM jsonb_populate_record(NULL::public.powers_of_attorney,$1) v WHERE p.id=$2',CASE WHEN assignments IS NULL THEN '' ELSE assignments||',' END) USING original||patch,identity;
 END IF;
 IF changed_members THEN
  UPDATE public.power_of_attorney_lawyers SET is_retired=NOT (desired @> jsonb_build_array(person_id)) WHERE power_of_attorney_id=identity AND is_retired IS DISTINCT FROM (NOT (desired @> jsonb_build_array(person_id)));
  SELECT coalesce(max(coalesce(current_order,source_member_ordinal)),0) INTO next_order FROM public.power_of_attorney_lawyers WHERE power_of_attorney_id=identity;
  FOR person IN SELECT x::text::integer FROM jsonb_array_elements(desired) WITH ORDINALITY a(x,n) ORDER BY n LOOP
   IF NOT EXISTS(SELECT 1 FROM public.power_of_attorney_lawyers WHERE power_of_attorney_id=identity AND person_id=person) THEN
    next_order:=next_order+1;
    INSERT INTO public.power_of_attorney_lawyers(power_of_attorney_id,person_id,current_order) VALUES(identity,person,next_order);
   END IF;
  END LOOP;
 END IF;
 IF lifecycle THEN PERFORM public.audit_append_semantic_event(op,'succeeded','public','powers_of_attorney',jsonb_build_object('id',identity),NULL,NULL,NULL,'{}',NULL,'{}'); END IF;
 SELECT row_version INTO version FROM public.powers_of_attorney WHERE id=identity;
 after_state:=_migration.poa_edit_aggregate(identity);
 INSERT INTO _migration.poa_edit_change VALUES(identity,version,actor,before_state,after_state,current_setting('litigation.audit_request_id')::uuid);
 INSERT INTO _migration.poa_edit_submission(submission_id,actor_id,request_payload,poa_id,result_version) VALUES(submission,actor,p_request,identity,version);
 RETURN jsonb_build_object('id',identity,'version',version::text,'changed',true);
END;
$$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.powers_of_attorney,public.power_of_attorney_lawyers FROM litigation_runtime;
REVOKE ALL ON SEQUENCE public.powers_of_attorney_id_seq,public.power_of_attorney_lawyers_id_seq FROM litigation_runtime;
REVOKE ALL ON _migration.poa_edit_import,_migration.poa_edit_boundary,_migration.poa_edit_change,_migration.poa_edit_submission,_migration.poa_edit_initial_powers_of_attorney,_migration.poa_edit_initial_power_of_attorney_lawyers FROM PUBLIC,litigation_runtime;
DO $permissions$
DECLARE routine regprocedure;
BEGIN
 FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'poa_edit_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine); END LOOP;
END
$permissions$;
GRANT EXECUTE ON FUNCTION public.poa_edit_state(integer,integer,text,timestamptz,integer),public.poa_edit_save(integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
DO $postcondition$
BEGIN
 IF EXISTS(SELECT 1 FROM public.powers_of_attorney p WHERE _migration.poa_edit_current_valid(p.id) IS DISTINCT FROM true) THEN RAISE EXCEPTION 'POA migration changed original values'; END IF;
END
$postcondition$;
COMMIT;
