-- Task 4.1a. Apply only under a separate deployment authorization.
-- Version/submission rows are immutable provenance, not editable business tables.
BEGIN;
CREATE TABLE public.client_logo_versions (
  id uuid PRIMARY KEY,
  client_id integer NOT NULL REFERENCES public.clients(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  relative_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  original_name text NOT NULL,
  content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/gif')),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 2097152),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  origin text NOT NULL CHECK(origin IN ('import','upload')),
  registered_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  registered_by integer NOT NULL REFERENCES public.audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT client_logo_versions_path CHECK(relative_path=client_id::text||'/'||file_name AND file_name !~ '[/\\\\<>:"|?*[:cntrl:]]' AND file_name NOT IN ('.','..') AND file_name !~ '[. ]$'),
  UNIQUE(client_id,relative_path)
);
CREATE INDEX client_logo_versions_client_time_idx ON public.client_logo_versions(client_id,registered_at,id);
CREATE INDEX client_logo_versions_actor_idx ON public.client_logo_versions(registered_by);
CREATE TABLE public.client_logo_submissions (
  submission_id uuid PRIMARY KEY,
  actor_id integer NOT NULL REFERENCES public.audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  client_id integer NOT NULL REFERENCES public.clients(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  request_payload jsonb NOT NULL,
  result_version bigint NOT NULL,
  result_id uuid NOT NULL REFERENCES public.client_logo_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX client_logo_submissions_actor_idx ON public.client_logo_submissions(actor_id);
CREATE INDEX client_logo_submissions_client_idx ON public.client_logo_submissions(client_id);
CREATE INDEX client_logo_submissions_result_idx ON public.client_logo_submissions(result_id);

INSERT INTO public.client_logo_versions(id,client_id,relative_path,file_name,original_name,content_type,byte_size,sha256,origin,registered_by)
SELECT md5('task41a-import:'||l.id::text)::uuid,l.client_id,l.relative_path,l.file_name,l.file_name,l.content_type,l.byte_size,l.sha256,'import',l.created_by
FROM public.client_logos l JOIN public.migration_client_logo_import i ON i.client_logo_id=l.id AND i.client_id=l.client_id
 AND i.destination_relative_path=l.relative_path AND i.source_file_name=l.file_name AND i.detected_content_type=l.content_type AND i.byte_size=l.byte_size AND i.sha256=l.sha256;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.client_logos)<>(SELECT count(*) FROM public.client_logo_versions) OR
     (SELECT count(*) FROM public.migration_client_logo_import)<>(SELECT count(*) FROM public.client_logo_versions) THEN
    RAISE EXCEPTION 'Logo upgrade requires exact original import/current association';
  END IF;
END; $$;
ALTER TABLE public.client_logos ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT client_logos_retained_version_fkey FOREIGN KEY(client_id,relative_path) REFERENCES public.client_logo_versions(client_id,relative_path) ON UPDATE RESTRICT ON DELETE RESTRICT;
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason)
VALUES ('public','client_logos','row_version',64,'value','client_logo_operational_version'),
       ('public','client_logos','is_archived',64,'value','client_logo_archive_lifecycle');

CREATE FUNCTION public.client_logo_refuse_evidence_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Retained logo versions and submission evidence are immutable'; END; $$;
CREATE TRIGGER client_logo_version_immutable BEFORE UPDATE OR DELETE ON public.client_logo_versions FOR EACH ROW EXECUTE FUNCTION public.client_logo_refuse_evidence_change();
CREATE TRIGGER client_logo_version_no_truncate BEFORE TRUNCATE ON public.client_logo_versions FOR EACH STATEMENT EXECUTE FUNCTION public.client_logo_refuse_evidence_change();
CREATE TRIGGER client_logo_submission_immutable BEFORE UPDATE OR DELETE ON public.client_logo_submissions FOR EACH ROW EXECUTE FUNCTION public.client_logo_refuse_evidence_change();
CREATE TRIGGER client_logo_submission_no_truncate BEFORE TRUNCATE ON public.client_logo_submissions FOR EACH STATEMENT EXECUTE FUNCTION public.client_logo_refuse_evidence_change();

CREATE FUNCTION public.client_logo_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE retained public.client_logo_versions%ROWTYPE;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Client logos cannot be physically deleted'; END IF;
  PERFORM _migration.client_contact_require_actor(TG_OP='UPDATE' AND NEW.is_archived IS DISTINCT FROM OLD.is_archived);
  PERFORM 1 FROM public.clients WHERE id=NEW.client_id AND NOT is_archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restore parent client before logo maintenance'; END IF;
  SELECT * INTO retained FROM public.client_logo_versions WHERE client_id=NEW.client_id AND relative_path=NEW.relative_path;
  IF NOT FOUND OR ROW(retained.file_name,retained.content_type,retained.byte_size,retained.sha256) IS DISTINCT FROM ROW(NEW.file_name,NEW.content_type,NEW.byte_size,NEW.sha256) THEN RAISE EXCEPTION 'Current logo must match immutable retained bytes'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.client_id<>OLD.client_id OR NEW.row_version<>OLD.row_version THEN RAISE EXCEPTION 'Logo identity and version are database owned'; END IF;
    IF ROW(NEW.relative_path,NEW.is_archived) IS NOT DISTINCT FROM ROW(OLD.relative_path,OLD.is_archived) THEN RETURN NULL; END IF;
    NEW.row_version:=OLD.row_version+1;
  ELSE
    IF NEW.row_version<>1 OR NEW.is_archived THEN RAISE EXCEPTION 'New logo must begin active at version one'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER zz_client_logo_guard BEFORE INSERT OR UPDATE OR DELETE ON public.client_logos FOR EACH ROW EXECUTE FUNCTION public.client_logo_guard();
CREATE TRIGGER client_logo_no_truncate BEFORE TRUNCATE ON public.client_logos FOR EACH STATEMENT EXECUTE FUNCTION public.client_logo_guard();

CREATE FUNCTION public.client_logo_mutate(p_client integer,p_expected bigint,p_client_version bigint,p_submission uuid,p_action text,p_target uuid,p_metadata jsonb,p_session_version integer,p_role text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer; account public.user_accounts%ROWTYPE; parent public.clients%ROWTYPE; current_logo public.client_logos%ROWTYPE;
  retained public.client_logo_versions%ROWTYPE; receipt public.client_logo_submissions%ROWTYPE; payload jsonb; changed boolean; result_version bigint;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('create','update','archive','restore') OR p_submission IS NULL OR p_expected IS NULL OR p_expected<0 OR p_client_version IS NULL OR p_metadata IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid logo request'; END IF;
  actor:=_migration.client_contact_require_actor(p_action IN ('archive','restore'));
  SELECT u.* INTO account FROM public.user_accounts u JOIN public.audit_actors a ON a.user_account_id=u.id WHERE a.id=actor FOR SHARE OF u;
  IF account.session_version IS DISTINCT FROM p_session_version OR account.role_code IS DISTINCT FROM p_role THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current logo session required'; END IF;
  SELECT * INTO parent FROM public.clients WHERE id=p_client FOR UPDATE;
  IF NOT FOUND OR parent.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore parent client before logo maintenance'; END IF;
  payload:=jsonb_build_object('client',p_client,'expected',p_expected,'client_version',p_client_version,'action',p_action,'target',p_target,'metadata',p_metadata);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_submission::text,411));
  SELECT * INTO receipt FROM public.client_logo_submissions WHERE submission_id=p_submission;
  IF FOUND THEN
    IF receipt.actor_id<>actor OR receipt.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Logo submission reused with conflicting input'; END IF;
    RETURN jsonb_build_object('id',receipt.result_id,'version',receipt.result_version::text,'changed',false,'replayed',true);
  END IF;
  IF parent.row_version<>p_client_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Logo parent version is stale'; END IF;
  SELECT * INTO current_logo FROM public.client_logos WHERE client_id=p_client FOR UPDATE;
  IF coalesce(current_logo.row_version,0)<>p_expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Logo row version is stale'; END IF;
  IF p_action IN ('create','update') THEN
    IF (p_action='create') IS DISTINCT FROM (current_logo.id IS NULL) OR p_target IS NOT NULL OR jsonb_typeof(p_metadata)<>'object' OR
      (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_metadata) k) IS DISTINCT FROM ARRAY['byteSize','contentType','fileName','inputSha256','originalName','sha256'] THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid logo upload metadata'; END IF;
    IF p_metadata->>'contentType' NOT IN ('image/png','image/jpeg') OR
      p_metadata->>'fileName' IS DISTINCT FROM (p_submission::text||(CASE p_metadata->>'contentType' WHEN 'image/png' THEN '.png' ELSE '.jpg' END)) OR
      coalesce(p_metadata->>'inputSha256','') !~ '^[a-f0-9]{64}$' OR
      length(coalesce(p_metadata->>'originalName','')) NOT BETWEEN 1 AND 180 OR
      p_metadata->>'originalName' ~ '[/\\\\<>:"|?*[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid logo upload metadata'; END IF;
    IF current_logo.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived logo before replacement'; END IF;
    IF current_logo.id IS NOT NULL AND NOT current_logo.is_archived AND current_logo.sha256=p_metadata->>'sha256' THEN
      SELECT * INTO retained FROM public.client_logo_versions WHERE relative_path=current_logo.relative_path;
      RETURN jsonb_build_object('id',retained.id,'version',current_logo.row_version::text,'changed',false,'replayed',false);
    END IF;
    INSERT INTO public.client_logo_versions(id,client_id,relative_path,file_name,original_name,content_type,byte_size,sha256,origin,registered_by)
    VALUES(p_submission,p_client,p_client::text||'/'||(p_metadata->>'fileName'),p_metadata->>'fileName',p_metadata->>'originalName',p_metadata->>'contentType',(p_metadata->>'byteSize')::integer,p_metadata->>'sha256','upload',actor) RETURNING * INTO retained;
  ELSE
    IF p_metadata<>'{}' OR current_logo.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid logo lifecycle request'; END IF;
    SELECT * INTO retained FROM public.client_logo_versions WHERE id=p_target AND client_id=p_client;
    IF NOT FOUND OR (p_action='archive' AND retained.relative_path<>current_logo.relative_path) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Logo version does not belong to this selection'; END IF;
    IF retained.relative_path=current_logo.relative_path AND current_logo.is_archived=(p_action='archive') THEN RETURN jsonb_build_object('id',retained.id,'version',current_logo.row_version::text,'changed',false,'replayed',false); END IF;
  END IF;
  IF current_logo.id IS NULL THEN
    INSERT INTO public.client_logos(client_id,relative_path,file_name,content_type,byte_size,sha256,updated_at)
    VALUES(p_client,retained.relative_path,retained.file_name,retained.content_type,retained.byte_size,retained.sha256,statement_timestamp()) RETURNING row_version,id INTO result_version,current_logo.id;
  ELSE
    UPDATE public.client_logos SET relative_path=retained.relative_path,file_name=retained.file_name,content_type=retained.content_type,byte_size=retained.byte_size,sha256=retained.sha256,is_archived=(p_action='archive') WHERE id=current_logo.id RETURNING row_version INTO result_version;
  END IF;
  IF p_action IN ('archive','restore') THEN
    -- Existing semantic-event contract permits no custom lifecycle parameters.
    -- The atomic row event and immutable submission identify the exact version.
    PERFORM public.audit_append_semantic_event(p_action,'succeeded','public','client_logos',jsonb_build_object('id',current_logo.id),NULL,NULL,NULL,'{}',NULL,'{}');
  END IF;
  INSERT INTO public.client_logo_submissions(submission_id,actor_id,client_id,request_payload,result_version,result_id) VALUES(p_submission,actor,p_client,payload,result_version,retained.id);
  RETURN jsonb_build_object('id',retained.id,'version',result_version::text,'changed',true,'replayed',false);
END; $$;

CREATE FUNCTION public.client_logo_state(p_account integer,p_session_version integer,p_role text,p_client integer,p_offset integer,p_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.id=p_account AND u.session_version=p_session_version AND u.role_code=p_role AND u.role_code IN ('Administrator','Litigation Assistant','Lawyer','Paralegal') AND u.is_enabled AND u.password_hash IS NOT NULL AND NOT u.must_change_password AND p.is_staff AND p.is_active AND p.can_login) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current logo viewer required'; END IF;
  IF p_target IS NOT NULL AND p_role<>'Administrator' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrator logo recovery required'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR p_offset>100000 THEN RAISE EXCEPTION 'Invalid history page'; END IF;
  RETURN (SELECT jsonb_build_object('clientId',c.id,'clientName',c.name_ar,'clientVersion',c.row_version::text,'clientArchived',c.is_archived,
    'version',coalesce(l.row_version,0)::text,'archived',coalesce(l.is_archived,false),
    'current',(SELECT to_jsonb(v) FROM public.client_logo_versions v WHERE v.client_id=c.id AND v.relative_path=l.relative_path),
    'selected',(SELECT to_jsonb(v) FROM public.client_logo_versions v WHERE v.client_id=c.id AND v.id=p_target),
    'total',CASE WHEN p_role='Administrator' THEN (SELECT count(*) FROM public.client_logo_versions WHERE client_id=c.id) ELSE 0 END,
    'rows',CASE WHEN p_role='Administrator' THEN coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM (SELECT * FROM public.client_logo_versions WHERE client_id=c.id ORDER BY registered_at DESC,id LIMIT 25 OFFSET p_offset) v),'[]') ELSE '[]'::jsonb END)
    FROM public.clients c LEFT JOIN public.client_logos l ON l.client_id=c.id WHERE c.id=p_client);
END; $$;
REVOKE ALL ON public.client_logo_versions,public.client_logo_submissions FROM PUBLIC,litigation_runtime;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.client_logos FROM litigation_runtime;
REVOKE ALL ON SEQUENCE public.client_logos_id_seq FROM litigation_runtime;
REVOKE ALL ON FUNCTION public.client_logo_refuse_evidence_change(),public.client_logo_guard(),public.client_logo_mutate(integer,bigint,bigint,uuid,text,uuid,jsonb,integer,text),public.client_logo_state(integer,integer,text,integer,integer,uuid) FROM PUBLIC,litigation_runtime;
GRANT EXECUTE ON FUNCTION public.client_logo_mutate(integer,bigint,bigint,uuid,text,uuid,jsonb,integer,text),public.client_logo_state(integer,integer,text,integer,integer,uuid) TO litigation_runtime;
COMMIT;
