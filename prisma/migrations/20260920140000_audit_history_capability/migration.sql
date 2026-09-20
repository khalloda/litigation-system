-- Task 4.9 candidate. Apply only to disposable copies until independent review
-- and a separate owner operational mandate. Migrations 1-72 are immutable.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $precondition$
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
  OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>72
  OR NOT EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name='20260918100000_billing_arabic_labels'
   AND checksum='ff0c27c0102d7c8f72cb756277efe2c0b12fe83bce23425aa77f95767b0e2d95' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL
    AND migration_name<>'20260920140000_audit_history_capability') THEN
  RAISE EXCEPTION 'Task 4.9 requires exact completed migration 72 and direct administration identity';
 END IF;
 -- Resolve the initial recipient once, using the approved seed and immutable
 -- actor relationship. Runtime authorization never compares these names.
 IF (SELECT count(*) FROM public.user_accounts WHERE username_normalized='khelmy')<>1
  OR (SELECT count(*) FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
   JOIN public.audit_actors a ON a.user_account_id=u.id
   WHERE u.username='KHelmy' AND u.person_id=139 AND u.role_code='Administrator'
    AND a.actor_kind='human' AND a.actor_key='user_account:'||u.id::text
    AND p.name_en='Khaled Helmy')<>1 THEN
  RAISE EXCEPTION 'Initial audit-export recipient identity is ambiguous';
 END IF;
END
$precondition$;

-- Purpose-specific access state and append-only receipts, not business records.
-- No sequences, raw runtime grants or new general account-management controls.
CREATE TABLE _migration.audit_export_capability (
 account_id integer PRIMARY KEY REFERENCES public.user_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 enabled boolean NOT NULL,
 event_id bigint NOT NULL UNIQUE REFERENCES public.audit_events(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE _migration.audit_export_capability_change (
 event_id bigint PRIMARY KEY REFERENCES public.audit_events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 account_id integer NOT NULL REFERENCES public.user_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 previous_enabled boolean NOT NULL, enabled boolean NOT NULL,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 256 AND NOT public.audit_contains_secret_pattern(reason)),
 CHECK(previous_enabled<>enabled)
);
CREATE TABLE _migration.audit_export_receipt (
 account_id integer NOT NULL REFERENCES public.user_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 operation_id uuid NOT NULL,
 request_digest text NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),
 artifact_digest text NOT NULL CHECK(artifact_digest~'^[a-f0-9]{64}$'),
 event_id bigint NOT NULL UNIQUE REFERENCES public.audit_events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 PRIMARY KEY(account_id,operation_id)
);
REVOKE ALL ON _migration.audit_export_capability,_migration.audit_export_capability_change,
 _migration.audit_export_receipt FROM PUBLIC,litigation_runtime;
CREATE TRIGGER audit_export_capability_change_immutable BEFORE UPDATE OR DELETE ON _migration.audit_export_capability_change
 FOR EACH ROW EXECUTE FUNCTION public.refuse_audit_event_change();
CREATE TRIGGER audit_export_capability_change_no_truncate BEFORE TRUNCATE ON _migration.audit_export_capability_change
 FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_audit_event_change();
CREATE TRIGGER audit_export_receipt_immutable BEFORE UPDATE OR DELETE ON _migration.audit_export_receipt
 FOR EACH ROW EXECUTE FUNCTION public.refuse_audit_event_change();
CREATE TRIGGER audit_export_receipt_no_truncate BEFORE TRUNCATE ON _migration.audit_export_receipt
 FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_audit_event_change();
CREATE TRIGGER audit_export_capability_no_delete BEFORE DELETE ON _migration.audit_export_capability
 FOR EACH ROW EXECUTE FUNCTION public.refuse_audit_event_change();
CREATE TRIGGER audit_export_capability_no_truncate BEFORE TRUNCATE ON _migration.audit_export_capability
 FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_audit_event_change();

ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_shape,
 ADD CONSTRAINT audit_events_action_shape CHECK(action IN(
 'record_created','record_updated','relationship_added','relationship_updated','relationship_removed',
 'login_succeeded','login_failed','account_locked','password_changed','password_initialized','password_reset',
 'archive','restore','account_created','account_enabled','account_disabled','username_changed','role_changed',
 'report_executed','export_completed','download_completed','audit_baseline_established',
 'audit_export_granted','audit_export_revoked'));

CREATE FUNCTION _migration.audit_history_authorize(p_account integer,p_person integer,p_version integer,p_expires timestamptz,p_export boolean)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
 IF p_expires IS NULL OR p_expires<=clock_timestamp() OR p_expires>clock_timestamp()+interval '31 days'
  OR p_export IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current audit authority required'; END IF;
 SELECT a.id INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
 JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
 WHERE u.id=p_account AND u.person_id=p_person AND u.session_version=p_version
  AND u.role_code='Administrator' AND u.is_enabled AND NOT u.must_change_password
  AND u.password_hash IS NOT NULL AND p.is_staff AND p.is_active AND p.can_login
  AND (NOT p_export OR EXISTS(SELECT 1 FROM _migration.audit_export_capability c WHERE c.account_id=u.id AND c.enabled));
 IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current audit authority required'; END IF;
 RETURN actor;
END;
$$;

CREATE FUNCTION public.audit_history_authority(p_account integer,p_person integer,p_version integer,p_expires timestamptz,p_export boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM _migration.audit_history_authorize(p_account,p_person,p_version,p_expires,p_export);
 RETURN EXISTS(SELECT 1 FROM _migration.audit_export_capability WHERE account_id=p_account AND enabled);
END;
$$;

CREATE FUNCTION _migration.audit_export_set_capability(p_account integer,p_enabled boolean,p_reason text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous boolean; target integer; event bigint;
BEGIN
 IF session_user<>current_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
  OR p_account IS NULL OR p_enabled IS NULL OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 256
  OR public.audit_contains_secret_pattern(p_reason) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Explicit controlled capability maintenance required'; END IF;
 PERFORM 1 FROM public.user_accounts WHERE id=p_account FOR UPDATE;
 SELECT id INTO STRICT target FROM public.audit_actors WHERE user_account_id=p_account AND actor_kind='human';
 SELECT enabled INTO previous FROM _migration.audit_export_capability WHERE account_id=p_account FOR UPDATE;
 previous:=coalesce(previous,false);
 IF previous=p_enabled THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Capability transition is unchanged'; END IF;
 IF (SELECT actor_key FROM public.audit_actors WHERE id=public.audit_current_actor_id()) NOT IN('system_administration','system_migration') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Controlled capability actor required'; END IF;
 event:=public.audit_write_event(CASE WHEN p_enabled THEN 'audit_export_granted' ELSE 'audit_export_revoked' END,
  'succeeded','public','user_accounts',jsonb_build_object('id',p_account),ARRAY['audit_export_capability'],
  jsonb_build_object('audit_export_capability',previous),jsonb_build_object('audit_export_capability',p_enabled),
  target,NULL,'audit_history:capability','{}','controlled_capability_maintenance',jsonb_build_object('reason',p_reason));
 INSERT INTO _migration.audit_export_capability_change VALUES(event,p_account,previous,p_enabled,p_reason);
 INSERT INTO _migration.audit_export_capability VALUES(p_account,p_enabled,event)
 ON CONFLICT(account_id) DO UPDATE SET enabled=EXCLUDED.enabled,event_id=EXCLUDED.event_id;
 RETURN event;
END;
$$;

-- Scalar projection carries explicit type plus text; JSON parsing can never
-- round a numeric amount/bigint. Only already-recorded bounded values enter it.
CREATE FUNCTION _migration.audit_history_values(p_values jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_object_agg(key,jsonb_build_object('kind',jsonb_typeof(value),
  'text',CASE WHEN jsonb_typeof(value)='string' THEN value#>>'{}' ELSE value::text END)),'{}')
 FROM jsonb_each(p_values)
$$;
CREATE FUNCTION _migration.audit_history_event(e public.audit_events) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',e.id::text,'occurredAt',to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'actorId',e.actor_id::text,'actorKey',e.actor_key_snapshot,'actorUsername',e.actor_username_snapshot,
  'actorName',e.actor_display_name_snapshot,'actorRole',e.actor_role_snapshot,
  'targetId',e.target_actor_id::text,'targetKey',e.target_actor_key_snapshot,'targetUsername',e.target_username_snapshot,
  'targetName',e.target_display_name_snapshot,'targetRole',e.target_role_snapshot,
  'action',e.action,'outcome',e.outcome,'table',e.entity_table,'key',_migration.audit_history_values(coalesce(e.entity_key,'{}')),
  'fields',e.changed_fields,'before',_migration.audit_history_values(e.before_values),'after',_migration.audit_history_values(e.after_values),
  'requestId',e.request_id,'correlationId',e.correlation_id,'auditSessionId',e.audit_session_id,
  'device',e.device_class,'ip',host(e.ip_address),'userAgent',e.user_agent,'userAgentTruncated',e.user_agent_truncated,
  'attemptedUsername',e.attempted_username,'attemptedUsernameTruncated',e.attempted_username_truncated,
  'resource',e.resource_identifier,'reason',e.reason_code,'parameters',_migration.audit_history_values(e.parameters),
  'metadata',_migration.audit_history_values(e.event_metadata))
$$;

-- A known server request is finer than correlation or timestamp. Actor and
-- immutable snapshots are part of identity, so a role/identity change is never
-- silently attributed under another snapshot. System operations are labelled
-- correlated operations by the projection, never described as human saves.
CREATE FUNCTION _migration.audit_history_group(e public.audit_events) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(jsonb_build_array(e.request_id,e.correlation_id,e.audit_session_id,
  e.actor_id,e.actor_key_snapshot,e.actor_username_snapshot,e.actor_display_name_snapshot,e.actor_role_snapshot)::text,'UTF8')),'hex')
$$;

-- Only retained immutable child-parent keys may supplement recorded keys.
-- No names, timestamp proximity, inferred billing/matter link or mutable
-- current business-value projection is used as historical evidence.
CREATE FUNCTION _migration.audit_history_parent(p_table text,p_id text,p_field text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result text;
BEGIN
 IF p_id !~ '^[1-9][0-9]{0,9}$' OR p_id::numeric>2147483647 THEN RETURN NULL; END IF;
 IF (p_table,p_field) NOT IN (('contacts','client_id'),('client_logos','client_id'),
  ('matter_lawyers','matter_id'),('matter_parties','matter_id'),('matter_party_roles','party_id'),
  ('hearing_attendees','hearing_id'),('task_actions','task_id'),('power_of_attorney_lawyers','power_of_attorney_id'),
  ('fee_letter_matters','fee_letter_id'),('fee_letter_matters','matter_id'),
  ('matter_fee_letter_references','matter_id'),('matter_fee_letter_references','fee_letter_id'),
  ('invoice_allocations','invoice_id'),('payments','invoice_id'),('person_name_alias','person_id'),('user_accounts','person_id')) THEN RETURN NULL; END IF;
 EXECUTE format('SELECT %I::text FROM public.%I WHERE id=$1',p_field,p_table) INTO result USING p_id::integer;
 RETURN result;
END;
$$;
CREATE FUNCTION _migration.audit_history_association(e public.audit_events,p_field text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT ARRAY(SELECT DISTINCT v FROM unnest(ARRAY[e.before_values->>p_field,e.after_values->>p_field,
  _migration.audit_history_parent(e.entity_table,e.entity_key->>'id',p_field)]) v WHERE v IS NOT NULL)
$$;
CREATE FUNCTION _migration.audit_history_in_scope(e public.audit_events,p_table text,p_id text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE field text; party text;
BEGIN
 IF p_table IS NULL THEN RETURN true; END IF;
 IF e.entity_schema='public' AND e.entity_table=p_table AND e.entity_key->>'id'=p_id THEN RETURN true; END IF;
 field:=CASE
  WHEN p_table='clients' AND e.entity_table IN('contacts','client_logos') THEN 'client_id'
  WHEN p_table='matters' AND e.entity_table IN('matter_lawyers','matter_parties','matter_fee_letter_references','fee_letter_matters') THEN 'matter_id'
  WHEN p_table='hearings' AND e.entity_table='hearing_attendees' THEN 'hearing_id'
  WHEN p_table='admin_tasks' AND e.entity_table='task_actions' THEN 'task_id'
  WHEN p_table='powers_of_attorney' AND e.entity_table='power_of_attorney_lawyers' THEN 'power_of_attorney_id'
  WHEN p_table='fee_letters' AND e.entity_table IN('fee_letter_matters','matter_fee_letter_references') THEN 'fee_letter_id'
  WHEN p_table='invoices' AND e.entity_table IN('invoice_allocations','payments') THEN 'invoice_id'
  WHEN p_table='people' AND e.entity_table IN('person_name_alias','user_accounts') THEN 'person_id'
  WHEN p_table='matter_parties' AND e.entity_table='matter_party_roles' THEN 'party_id' END;
 IF field IS NOT NULL THEN RETURN p_id=ANY(_migration.audit_history_association(e,field)); END IF;
 IF p_table='matters' AND e.entity_table='matter_party_roles' THEN
  FOREACH party IN ARRAY _migration.audit_history_association(e,'party_id') LOOP
   IF _migration.audit_history_parent('matter_parties',party,'matter_id')=p_id
    OR EXISTS(SELECT 1 FROM public.audit_events h WHERE h.entity_table='matter_parties' AND h.entity_key->>'id'=party
      AND (h.before_values->>'matter_id'=p_id OR h.after_values->>'matter_id'=p_id)) THEN RETURN true; END IF;
  END LOOP;
 END IF;
 RETURN false;
END;
$$;

CREATE FUNCTION public.audit_history_read(p_account integer,p_person integer,p_version integer,p_expires timestamptz,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE watermark bigint; max_id bigint; take integer; subject text; identity text; query text;
 actor text; filter_action text; from_date date; to_date date; before_time timestamptz; before_id bigint;
 response jsonb; export_mode boolean; terms text[];
BEGIN
 PERFORM _migration.audit_history_authorize(p_account,p_person,p_version,p_expires,false);
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>12000
  OR p_request-ARRAY['table','id','q','actor','action','from','to','watermark','beforeTime','beforeId','take','export','terms']<>'{}' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid audit query'; END IF;
 subject:=nullif(p_request->>'table',''); identity:=nullif(p_request->>'id','');
 query:=coalesce(p_request->>'q',''); actor:=nullif(p_request->>'actor',''); filter_action:=nullif(p_request->>'action','');
 IF char_length(query)>160 OR char_length(coalesce(actor,''))>10 OR char_length(coalesce(filter_action,''))>64
  OR (actor IS NOT NULL AND actor !~ '^[1-9][0-9]{0,9}$')
  OR (subject IS NULL)<>(identity IS NULL)
  OR (subject IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.audit_event_table_rules WHERE entity_schema='public' AND entity_table=subject)
    OR identity !~ '^[1-9][0-9]{0,9}$' OR identity::numeric>2147483647)) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid audit scope'; END IF;
 from_date:=nullif(p_request->>'from','')::date; to_date:=nullif(p_request->>'to','')::date;
 IF from_date>to_date THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid date interval'; END IF;
 SELECT last_value INTO STRICT max_id FROM _migration.matter_lifecycle_audit_counter WHERE singleton;
 watermark:=coalesce((p_request->>'watermark')::bigint,max_id);
 IF watermark<0 OR watermark>max_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid watermark'; END IF;
 before_time:=nullif(p_request->>'beforeTime','')::timestamptz; before_id:=nullif(p_request->>'beforeId','')::bigint;
 IF (before_time IS NULL)<>(before_id IS NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid keyset'; END IF;
 export_mode:=coalesce((p_request->>'export')::boolean,false);
 IF export_mode THEN PERFORM _migration.audit_history_authorize(p_account,p_person,p_version,p_expires,true); END IF;
 take:=coalesce((p_request->>'take')::integer,25);
 IF take<1 OR take>(CASE WHEN export_mode THEN 10000 ELSE 50 END) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid page size'; END IF;
 IF p_request ? 'terms' AND (jsonb_typeof(p_request->'terms')<>'array' OR jsonb_array_length(p_request->'terms')>80) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid search expansion'; END IF;
 terms:=ARRAY(SELECT value FROM jsonb_array_elements_text(coalesce(p_request->'terms','[]')));
 IF EXISTS(SELECT 1 FROM unnest(terms) t WHERE char_length(t)>128) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid search expansion'; END IF;
 WITH scoped AS MATERIALIZED (
  SELECT e.*,_migration.audit_history_group(e) group_key,
   (from_date IS NULL OR e.occurred_at>=from_date::timestamp AT TIME ZONE 'UTC')
   AND (to_date IS NULL OR e.occurred_at<(to_date+1)::timestamp AT TIME ZONE 'UTC')
   AND (actor IS NULL OR e.actor_id::text=actor)
   AND (filter_action IS NULL OR e.action=filter_action)
   AND (query='' OR position(public.ar_normalise(query) IN public.ar_normalise(concat_ws(' ',
    e.id::text,e.actor_username_snapshot,e.actor_display_name_snapshot,e.actor_role_snapshot,
    e.target_username_snapshot,e.target_display_name_snapshot,e.action,e.outcome,e.entity_table,
    e.entity_key::text,e.changed_fields::text,e.before_values::text,e.after_values::text,e.reason_code,
    e.resource_identifier,e.parameters::text,e.event_metadata::text)))>0
    OR e.action=ANY(terms) OR e.entity_table=ANY(terms) OR e.changed_fields&&terms) matches
  FROM public.audit_events e WHERE e.id<=watermark AND _migration.audit_history_in_scope(e,subject,identity)
 ), grouped AS MATERIALIZED (
  SELECT group_key,max(occurred_at) occurred_at,max(id) id,count(*) n,bool_or(matches) matched FROM scoped GROUP BY group_key
 ), selected AS (
  SELECT * FROM grouped WHERE matched AND (before_time IS NULL OR (occurred_at,id)<(before_time,before_id))
  ORDER BY occurred_at DESC,id DESC LIMIT take+1
 ), projected AS (
  SELECT s.*, (SELECT jsonb_agg(_migration.audit_history_event(e)||jsonb_build_object('matched',h.matches) ORDER BY e.occurred_at,e.id)
    FROM scoped h JOIN public.audit_events e ON e.id=h.id WHERE h.group_key=s.group_key) events FROM selected s
 )
 SELECT jsonb_build_object('watermark',watermark::text,'totalGroups',(SELECT count(*) FROM grouped WHERE matched),
  'totalEvents',(SELECT coalesce(sum(n),0) FROM grouped WHERE matched),
  'actors',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'name',x->>'id'),'[]') FROM(
   SELECT DISTINCT jsonb_build_object('id',actor_id::text,'name',actor_display_name_snapshot,'username',actor_username_snapshot,'role',actor_role_snapshot) x FROM scoped) a),
  'actions',(SELECT coalesce(jsonb_agg(action ORDER BY action),'[]') FROM(SELECT DISTINCT action FROM scoped) a),
  'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',group_key,'occurredAt',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'lastId',id::text,'count',n,'events',events) ORDER BY occurred_at DESC,id DESC),'[]') FROM projected)) INTO response;
 IF octet_length(response::text)>20000000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='Audit result exceeds safe size; narrow filters'; END IF;
 RETURN response;
END;
$$;

-- Called only after bytes were completely generated on the server. Locks
-- authority through commit; does not claim client receipt/network atomicity.
CREATE FUNCTION public.audit_history_export_complete(p_account integer,p_person integer,p_version integer,p_expires timestamptz,
 p_operation uuid,p_request_digest text,p_artifact_digest text,p_format text,p_scope text,p_watermark text,p_groups integer,p_events integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer; previous _migration.audit_export_receipt; event bigint;
BEGIN
 PERFORM 1 FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.id=p_account FOR SHARE OF u,p;
 PERFORM 1 FROM _migration.audit_export_capability WHERE account_id=p_account FOR SHARE;
 actor:=_migration.audit_history_authorize(p_account,p_person,p_version,p_expires,true);
 IF public.audit_current_actor_id()<>actor OR p_operation IS NULL OR p_request_digest IS NULL OR p_request_digest !~ '^[a-f0-9]{64}$'
  OR p_artifact_digest IS NULL OR p_artifact_digest !~ '^[a-f0-9]{64}$' OR p_format IS NULL OR p_format NOT IN('xlsx','pdf') OR p_scope IS NULL
  OR p_scope !~ '^audit_history:(global|[a-z_]+:[1-9][0-9]{0,9})$' OR p_watermark !~ '^[0-9]{1,19}$'
  OR p_watermark IS NULL OR p_groups IS NULL OR p_events IS NULL
  OR p_groups NOT BETWEEN 0 AND 10000 OR p_events NOT BETWEEN 0 AND 100000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid audit export completion'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('audit-export:'||p_account::text||':'||p_operation::text,0));
 SELECT * INTO previous FROM _migration.audit_export_receipt WHERE account_id=p_account AND operation_id=p_operation;
 IF FOUND THEN
  IF previous.request_digest<>p_request_digest THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Export retry scope differs'; END IF;
  RETURN jsonb_build_object('duplicate',true,'eventId',previous.event_id::text);
 END IF;
 event:=public.audit_append_semantic_event_for_account('export_completed','succeeded',NULL,NULL,NULL,NULL,NULL,p_scope,
  jsonb_build_object('format',p_format,'watermark',p_watermark,'groups',p_groups,'events',p_events,
   'request_sha256',p_request_digest,'artifact_sha256',p_artifact_digest,'operation_id',p_operation::text),
  NULL,jsonb_build_object('emission','server_generation_completed_not_client_receipt'));
 INSERT INTO _migration.audit_export_receipt VALUES(p_account,p_operation,p_request_digest,p_artifact_digest,event);
 RETURN jsonb_build_object('duplicate',false,'eventId',event::text);
END;
$$;

CREATE FUNCTION _migration.audit_export_state_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(
  SELECT 1 FROM _migration.audit_export_capability c FULL JOIN
   (SELECT DISTINCT ON(account_id) account_id,enabled,event_id FROM _migration.audit_export_capability_change ORDER BY account_id,event_id DESC) h USING(account_id)
  WHERE c.account_id IS NULL OR h.account_id IS NULL OR (c.enabled,c.event_id) IS DISTINCT FROM (h.enabled,h.event_id)
 ) AND NOT EXISTS(
  SELECT 1 FROM (SELECT h.*,lag(enabled,1,false) OVER(PARTITION BY account_id ORDER BY event_id) expected_previous FROM _migration.audit_export_capability_change h) h
  LEFT JOIN public.audit_events e ON e.id=h.event_id LEFT JOIN public.audit_actors a ON a.id=e.target_actor_id
  WHERE h.previous_enabled<>h.expected_previous OR e.id IS NULL OR a.user_account_id IS DISTINCT FROM h.account_id
   OR e.action IS DISTINCT FROM CASE WHEN h.enabled THEN 'audit_export_granted' ELSE 'audit_export_revoked' END
   OR e.outcome<>'succeeded' OR e.actor_key_snapshot NOT IN('system_migration','system_administration')
   OR e.entity_table IS DISTINCT FROM 'user_accounts' OR e.entity_key IS DISTINCT FROM jsonb_build_object('id',h.account_id)
   OR e.changed_fields IS DISTINCT FROM ARRAY['audit_export_capability']::text[]
   OR e.before_values IS DISTINCT FROM jsonb_build_object('audit_export_capability',h.previous_enabled)
   OR e.after_values IS DISTINCT FROM jsonb_build_object('audit_export_capability',h.enabled)
   OR e.event_metadata IS DISTINCT FROM jsonb_build_object('reason',h.reason)
 ) AND NOT EXISTS(
  SELECT 1 FROM public.audit_events e WHERE e.action IN('audit_export_granted','audit_export_revoked')
   AND NOT EXISTS(SELECT 1 FROM _migration.audit_export_capability_change h WHERE h.event_id=e.id)
 ) AND NOT EXISTS(
  SELECT 1 FROM _migration.audit_export_receipt r LEFT JOIN public.audit_events e ON e.id=r.event_id
  LEFT JOIN public.audit_actors a ON a.id=e.actor_id
  WHERE e.id IS NULL OR e.action<>'export_completed' OR e.outcome<>'succeeded'
   OR a.user_account_id IS DISTINCT FROM r.account_id OR e.resource_identifier NOT LIKE 'audit_history:%'
   OR e.parameters->>'request_sha256' IS DISTINCT FROM r.request_digest
   OR e.parameters->>'artifact_sha256' IS DISTINCT FROM r.artifact_digest
   OR e.parameters->>'operation_id' IS DISTINCT FROM r.operation_id::text
 ) AND NOT EXISTS(
  SELECT 1 FROM public.audit_events e WHERE e.action='export_completed' AND e.resource_identifier LIKE 'audit_history:%'
   AND NOT EXISTS(SELECT 1 FROM _migration.audit_export_receipt r WHERE r.event_id=e.id)
 )
$$;
CREATE FUNCTION _migration.audit_export_assert_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT _migration.audit_export_state_valid() THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Audit export capability/receipt history differs'; END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER audit_export_current_consistency AFTER INSERT OR UPDATE ON _migration.audit_export_capability
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.audit_export_assert_state();
CREATE CONSTRAINT TRIGGER audit_export_change_consistency AFTER INSERT ON _migration.audit_export_capability_change
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.audit_export_assert_state();
CREATE CONSTRAINT TRIGGER audit_export_receipt_consistency AFTER INSERT ON _migration.audit_export_receipt
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.audit_export_assert_state();
REVOKE ALL ON FUNCTION _migration.audit_export_state_valid(),_migration.audit_export_assert_state() FROM PUBLIC,litigation_runtime;

REVOKE ALL ON FUNCTION _migration.audit_history_authorize(integer,integer,integer,timestamptz,boolean),
 _migration.audit_export_set_capability(integer,boolean,text),_migration.audit_history_values(jsonb),
 _migration.audit_history_event(public.audit_events),_migration.audit_history_group(public.audit_events),
 _migration.audit_history_parent(text,text,text),_migration.audit_history_association(public.audit_events,text),
 _migration.audit_history_in_scope(public.audit_events,text,text) FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.audit_history_authority(integer,integer,integer,timestamptz,boolean),
 public.audit_history_read(integer,integer,integer,timestamptz,jsonb),
 public.audit_history_export_complete(integer,integer,integer,timestamptz,uuid,text,text,text,text,text,integer,integer) FROM PUBLIC,litigation_runtime;
GRANT EXECUTE ON FUNCTION public.audit_history_authority(integer,integer,integer,timestamptz,boolean),
 public.audit_history_read(integer,integer,integer,timestamptz,jsonb),
 public.audit_history_export_complete(integer,integer,integer,timestamptz,uuid,text,text,text,text,text,integer,integer) TO litigation_runtime;

SELECT public.audit_set_migration_context();
SELECT public.audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,'controlled-maintenance:task49-initial-capability','system');
SELECT _migration.audit_export_set_capability(
 (SELECT u.id FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
  JOIN public.audit_actors a ON a.user_account_id=u.id
  WHERE u.username='KHelmy' AND u.username_normalized='khelmy' AND u.person_id=139
   AND u.role_code='Administrator' AND p.name_en='Khaled Helmy'
   AND a.actor_kind='human' AND a.actor_key='user_account:'||u.id::text),
 true,'D31 initial owner-approved audit export capability; Task 4.9');
COMMIT;
