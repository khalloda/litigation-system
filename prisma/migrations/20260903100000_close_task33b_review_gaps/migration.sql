BEGIN;

-- Task 3.3B correction: preserve the frozen migration-57 allowlist while
-- making the current column classification exhaustive and evolvable, require
-- explicit event metadata, and resolve semantic targets by the immutable
-- audit_actors.user_account_id relationship.

DO $PRECONDITION$
DECLARE
    baseline_allowlist_digest text;
    audited_schema_digest text;
BEGIN
    IF session_user IS DISTINCT FROM current_user
       OR NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=session_user),false) THEN
        RAISE EXCEPTION 'Task 3.3B correction requires D35 direct-superuser migration identity';
    END IF;
    IF (SELECT count(*) FROM public.audit_actors)<>7 THEN
        RAISE EXCEPTION 'Task 3.3B correction expected the original seven audit actors';
    END IF;
    IF (SELECT count(*) FROM public.audit_events)<>1
       OR (SELECT count(*) FROM public.audit_event_checkpoints)<>1
       OR (SELECT count(*) FROM public.audit_event_fields)<>262
       OR EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='audit_event_fields'
              AND column_name='classification_reason'
       )
       OR to_regprocedure(
           'public.audit_append_semantic_event_for_account(text,text,text,text,jsonb,integer,text,text,jsonb,text,jsonb)'
          ) IS NOT NULL THEN
        RAISE EXCEPTION 'Task 3.3B correction requires the unmodified migration-57 event foundation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public._prisma_migrations
         WHERE migration_name='20260902180000_append_only_audit_events'
           AND checksum='81f42f19bcae73b38805391d0ad80b87d92e4270adbd9578db46016907e04ab0'
           AND finished_at IS NOT NULL AND rolled_back_at IS NULL
           AND applied_steps_count=1
    ) THEN
        RAISE EXCEPTION 'Task 3.3B migration-57 provenance differs';
    END IF;
    SELECT encode(sha256(convert_to(string_agg(
        entity_schema||E'\x1f'||entity_table||E'\x1f'||field_name||E'\x1f'||
        max_text_characters::text||E'\x1f'||capture_mode,
        E'\n' ORDER BY entity_schema,entity_table,field_name),'UTF8')),'hex')
      INTO baseline_allowlist_digest
      FROM public.audit_event_fields;
    IF baseline_allowlist_digest<>'9e271a6e23bc03e55223db3c0a9be1b0e34867da0af8c6f0acab5614506de11b'
       OR baseline_allowlist_digest IS DISTINCT FROM (
           SELECT allowlist_digest::text FROM public.audit_event_checkpoints
            WHERE checkpoint_key='task_3_3b_baseline'
       ) THEN
        RAISE EXCEPTION 'Task 3.3B frozen baseline allowlist differs';
    END IF;
    SELECT encode(sha256(convert_to(string_agg(
        c.table_schema||E'\x1f'||c.table_name||E'\x1f'||c.column_name||E'\x1f'||
        c.data_type||E'\x1f'||c.is_nullable,
        E'\n' ORDER BY c.table_schema,c.table_name,c.ordinal_position),'UTF8')),'hex')
      INTO audited_schema_digest
      FROM information_schema.columns c
      JOIN public.audit_event_table_rules r
        ON r.entity_schema=c.table_schema AND r.entity_table=c.table_name;
    IF audited_schema_digest<>'e02abc02a658a7cd360c3ad5e9c7faa2a9c95a4c6b0ca56d1d20ff8d1dc4a4cc'
       OR (SELECT count(*) FROM information_schema.columns c
            JOIN public.audit_event_table_rules r
              ON r.entity_schema=c.table_schema AND r.entity_table=c.table_name)<>583 THEN
        RAISE EXCEPTION 'Task 3.3B exact 38-table column inventory differs';
    END IF;
END
$PRECONDITION$;

ALTER TABLE public.audit_event_fields
    ADD COLUMN classification_reason text NOT NULL
        DEFAULT 'frozen_task_3_3b_baseline_rule';
ALTER TABLE public.audit_event_fields
    ALTER COLUMN classification_reason DROP DEFAULT,
    ALTER COLUMN max_text_characters DROP DEFAULT,
    DROP CONSTRAINT audit_event_fields_bound,
    DROP CONSTRAINT audit_event_fields_capture_mode,
    ADD CONSTRAINT audit_event_fields_bound CHECK (
        (capture_mode IN ('value','redacted') AND max_text_characters BETWEEN 64 AND 2048)
        OR
        (capture_mode IN ('entity_key','structural','excluded') AND max_text_characters=0)
    ),
    ADD CONSTRAINT audit_event_fields_capture_mode CHECK (
        capture_mode IN ('value','redacted','entity_key','structural','excluded')),
    ADD CONSTRAINT audit_event_fields_reason_shape CHECK (
        classification_reason ~ '^[a-z][a-z0-9_]{2,127}$'
        AND classification_reason NOT IN ('excluded','other','unknown'));

INSERT INTO public.audit_event_fields(
    entity_schema,entity_table,field_name,max_text_characters,capture_mode,
    classification_reason
)
SELECT r.entity_schema,r.entity_table,key_name,0,'entity_key',
       'entity_key_recorded_separately'
  FROM public.audit_event_table_rules r
 CROSS JOIN LATERAL unnest(r.key_fields) key_name
 ORDER BY r.entity_schema,r.entity_table,key_name;

INSERT INTO public.audit_event_fields(
    entity_schema,entity_table,field_name,max_text_characters,capture_mode,
    classification_reason
)
SELECT c.table_schema,c.table_name,c.column_name,0,'structural',
       'audit_actor_timestamp_managed_by_database'
  FROM information_schema.columns c
  JOIN public.audit_event_table_rules r
    ON r.entity_schema=c.table_schema AND r.entity_table=c.table_name
 WHERE c.column_name IN ('created_at','created_by','updated_at','updated_by')
 ORDER BY c.table_schema,c.table_name,c.ordinal_position;

INSERT INTO public.audit_event_fields(
    entity_schema,entity_table,field_name,max_text_characters,capture_mode,
    classification_reason
)
SELECT 'public',entry.entity_table,entry.field_name,0,'excluded',entry.reason
  FROM (VALUES
    ('admin_tasks','legacy_assignee_raw','immutable_legacy_source_evidence'),
    ('admin_tasks','legacy_circuit_raw','immutable_legacy_source_evidence'),
    ('admin_tasks','legacy_court_raw','immutable_legacy_source_evidence'),
    ('admin_tasks','legacy_destination_raw','immutable_legacy_source_evidence'),
    ('admin_tasks','legacy_id','immutable_legacy_source_evidence'),
    ('admin_tasks','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('admin_tasks','legacy_source_payload','immutable_legacy_source_evidence'),
    ('admin_tasks','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('attendance','legacy_id','immutable_legacy_source_evidence'),
    ('attendance','legacy_person_raw','immutable_legacy_source_evidence'),
    ('attendance','legacy_situation_raw','immutable_legacy_source_evidence'),
    ('attendance','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('attendance','legacy_source_payload','immutable_legacy_source_evidence'),
    ('attendance','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('clients','full_name_normalised','derived_search_projection'),
    ('clients','legacy_branch_raw','immutable_legacy_source_evidence'),
    ('clients','legacy_contact_lawyer_raw','immutable_legacy_source_evidence'),
    ('clients','legacy_id','immutable_legacy_source_evidence'),
    ('clients','name_ar_normalised','derived_search_projection'),
    ('contacts','contact_name_normalised','derived_search_projection'),
    ('contacts','legacy_id','immutable_legacy_source_evidence'),
    ('documents','legacy_client_name_raw','immutable_legacy_source_evidence'),
    ('documents','legacy_id','immutable_legacy_source_evidence'),
    ('documents','legacy_matter_ref_raw','immutable_legacy_source_evidence'),
    ('documents','legacy_mfiles_id_raw','immutable_legacy_source_evidence'),
    ('documents','legacy_page_count_raw','immutable_legacy_source_evidence'),
    ('documents','legacy_responsible_raw','immutable_legacy_source_evidence'),
    ('documents','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('documents','legacy_source_payload','immutable_legacy_source_evidence'),
    ('documents','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('fee_letter_matters','legacy_matter_ref','immutable_legacy_source_evidence'),
    ('fee_letter_matters','legacy_parent_contract_id_raw','immutable_legacy_source_evidence'),
    ('fee_letter_matters','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('fee_letter_matters','legacy_source_payload','immutable_legacy_source_evidence'),
    ('fee_letter_matters','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('fee_letters','legacy_mfiles_id_raw','immutable_legacy_source_evidence'),
    ('fee_letters','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('fee_letters','legacy_source_payload','immutable_legacy_source_evidence'),
    ('fee_letters','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('hearing_attendees','legacy_name_raw','immutable_legacy_source_evidence'),
    ('hearing_attendees','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('hearing_attendees','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('hearing_attendees','source_cell_id','immutable_transformation_provenance'),
    ('hearing_attendees','source_column','immutable_transformation_provenance'),
    ('hearing_attendees','source_column_ordinal','immutable_transformation_provenance'),
    ('hearing_attendees','source_span_id','immutable_transformation_provenance'),
    ('hearing_attendees','source_span_sequence','immutable_transformation_provenance'),
    ('hearings','legacy_action_raw','immutable_legacy_source_evidence'),
    ('hearings','legacy_circuit_raw','immutable_legacy_source_evidence'),
    ('hearings','legacy_court_raw','immutable_legacy_source_evidence'),
    ('hearings','legacy_destination_raw','immutable_legacy_source_evidence'),
    ('hearings','legacy_id','immutable_legacy_source_evidence'),
    ('hearings','legacy_notes_raw','immutable_legacy_source_evidence'),
    ('hearings','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('hearings','legacy_source_payload','immutable_legacy_source_evidence'),
    ('hearings','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('hearings','next_attendance_raw','immutable_legacy_source_evidence'),
    ('invoice_allocations','legacy_id','immutable_legacy_source_evidence'),
    ('invoice_allocations','legacy_invoice_no','immutable_legacy_source_evidence'),
    ('invoice_allocations','legacy_lawyer_as_raw','immutable_legacy_source_evidence'),
    ('invoice_allocations','legacy_lawyer_raw','immutable_legacy_source_evidence'),
    ('invoice_allocations','legacy_percent_raw','immutable_legacy_source_evidence'),
    ('invoice_allocations','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('invoice_allocations','legacy_source_payload','immutable_legacy_source_evidence'),
    ('invoice_allocations','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('invoices','legacy_contract_id','immutable_legacy_source_evidence'),
    ('invoices','legacy_currency_raw','immutable_legacy_source_evidence'),
    ('invoices','legacy_id','immutable_legacy_source_evidence'),
    ('invoices','legacy_receipt_currency_raw','immutable_legacy_source_evidence'),
    ('invoices','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('invoices','legacy_source_payload','immutable_legacy_source_evidence'),
    ('invoices','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('invoices','legacy_status_raw','immutable_legacy_source_evidence'),
    ('invoices','legacy_type_raw','immutable_legacy_source_evidence'),
    ('matter_fee_letter_references','legacy_reference_raw','immutable_legacy_source_evidence'),
    ('matter_fee_letter_references','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('matter_fee_letter_references','legacy_source_payload','immutable_legacy_source_evidence'),
    ('matter_fee_letter_references','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('matter_lawyers','legacy_source','immutable_legacy_source_evidence'),
    ('matter_lawyers','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('matter_lawyers','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('matter_lawyers','reviewed_rule_id','immutable_transformation_provenance'),
    ('matter_lawyers','source_field','immutable_transformation_provenance'),
    ('matter_lawyers','source_member_ordinal','immutable_transformation_provenance'),
    ('matter_parties','legacy_raw','immutable_legacy_source_evidence'),
    ('matter_parties','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('matter_parties','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('matter_parties','source_field','immutable_transformation_provenance'),
    ('matter_parties','source_fragment_ordinal','immutable_transformation_provenance'),
    ('matter_party_roles','legacy_role_raw','immutable_legacy_source_evidence'),
    ('matters','case_number_ar_normalised','derived_search_projection'),
    ('matters','legacy_branch_raw','immutable_legacy_source_evidence'),
    ('matters','legacy_category_raw','immutable_legacy_source_evidence'),
    ('matters','legacy_client_type_raw','immutable_legacy_source_evidence'),
    ('matters','legacy_contract_id_raw','immutable_legacy_source_evidence'),
    ('matters','legacy_court_raw','immutable_legacy_source_evidence'),
    ('matters','legacy_degree_raw','immutable_legacy_source_evidence'),
    ('matters','legacy_financial_allocation_raw','immutable_legacy_source_evidence'),
    ('matters','legacy_id','immutable_legacy_source_evidence'),
    ('matters','legacy_partner_raw','immutable_legacy_source_evidence'),
    ('matters','legacy_selected','immutable_legacy_source_evidence'),
    ('matters','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('matters','legacy_source_payload','immutable_legacy_source_evidence'),
    ('matters','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('matters','subject_normalised','derived_search_projection'),
    ('payments','legacy_currency_raw','immutable_legacy_source_evidence'),
    ('payments','legacy_id','immutable_legacy_source_evidence'),
    ('payments','legacy_invoice_no','immutable_legacy_source_evidence'),
    ('payments','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('payments','legacy_source_payload','immutable_legacy_source_evidence'),
    ('payments','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('people','name_ar_normalised','derived_search_projection'),
    ('person_name_alias','alias_ar_normalised','derived_search_projection'),
    ('power_of_attorney_lawyers','legacy_lawyers_raw','immutable_legacy_source_evidence'),
    ('power_of_attorney_lawyers','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('power_of_attorney_lawyers','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('power_of_attorney_lawyers','reviewed_rule_id','immutable_transformation_provenance'),
    ('power_of_attorney_lawyers','source_member_ordinal','immutable_transformation_provenance'),
    ('powers_of_attorney','legacy_id','immutable_legacy_source_evidence'),
    ('powers_of_attorney','legacy_lawyers_raw','immutable_legacy_source_evidence'),
    ('powers_of_attorney','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('powers_of_attorney','legacy_source_payload','immutable_legacy_source_evidence'),
    ('powers_of_attorney','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('task_actions','legacy_id','immutable_legacy_source_evidence'),
    ('task_actions','legacy_performed_by_raw','immutable_legacy_source_evidence'),
    ('task_actions','legacy_source_extraction_sha256','immutable_legacy_source_evidence'),
    ('task_actions','legacy_source_payload','immutable_legacy_source_evidence'),
    ('task_actions','legacy_source_record_key','immutable_legacy_source_evidence'),
    ('task_actions','legacy_task_id_raw','immutable_legacy_source_evidence'),
    ('task_actions','source_ordinal','immutable_transformation_provenance'),
    ('user_accounts','username_normalized','derived_search_projection')
  ) AS entry(entity_table,field_name,reason)
 ORDER BY entry.entity_table,entry.field_name;

CREATE OR REPLACE FUNCTION public.audit_ensure_event_context()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $ENSURE_CONTEXT$
DECLARE
    request_value text := current_setting('litigation.audit_request_id',true);
    correlation_value text := current_setting('litigation.audit_correlation_id',true);
    session_value text := current_setting('litigation.audit_session_id',true);
    ip_value text := current_setting('litigation.audit_ip_address',true);
    agent_value text := current_setting('litigation.audit_user_agent',true);
    truncated_value text := current_setting('litigation.audit_user_agent_truncated',true);
    device_value text := current_setting('litigation.audit_device_class',true);
BEGIN
    IF coalesce(request_value,'')='' AND coalesce(correlation_value,'')=''
       AND coalesce(session_value,'')='' AND coalesce(ip_value,'')=''
       AND coalesce(agent_value,'')='' AND coalesce(truncated_value,'')=''
       AND coalesce(device_value,'')='' THEN
        RAISE EXCEPTION USING ERRCODE='42501',
            MESSAGE='Explicit transaction-local audit event context is required';
    END IF;
    IF coalesce(request_value,'')='' OR coalesce(correlation_value,'')=''
       OR coalesce(session_value,'')='' OR coalesce(truncated_value,'')=''
       OR coalesce(device_value,'')='' THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Partial audit event context is refused';
    END IF;
    BEGIN
        PERFORM request_value::uuid,correlation_value::uuid,session_value::uuid;
        IF request_value::uuid='00000000-0000-0000-0000-000000000000'::uuid
           OR correlation_value::uuid='00000000-0000-0000-0000-000000000000'::uuid
           OR session_value::uuid='00000000-0000-0000-0000-000000000000'::uuid THEN
            RAISE invalid_parameter_value;
        END IF;
        IF coalesce(ip_value,'')<>'' THEN PERFORM ip_value::inet; END IF;
        IF truncated_value NOT IN ('true','false')
           OR device_value NOT IN ('system','desktop','mobile','tablet','bot','unknown')
           OR char_length(coalesce(agent_value,''))>512
           OR (coalesce(agent_value,'')<>'[redacted]'
               AND public.audit_contains_secret_pattern(coalesce(agent_value,''))) THEN
            RAISE invalid_parameter_value;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Invalid transaction-local audit event context';
    END;
    RETURN jsonb_build_object(
        'request_id',request_value,
        'correlation_id',correlation_value,
        'audit_session_id',session_value,
        'ip_address',nullif(ip_value,''),
        'user_agent',nullif(agent_value,''),
        'user_agent_truncated',truncated_value::boolean,
        'device_class',device_value
    );
END;
$ENSURE_CONTEXT$;

CREATE OR REPLACE FUNCTION public.audit_capture_row_event()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $ROW_EVENT$
DECLARE
    table_rule public.audit_event_table_rules%ROWTYPE;
    old_value jsonb;
    new_value jsonb;
    key_source jsonb;
    entity_key jsonb;
    fields text[];
    before_payload jsonb := '{}'::jsonb;
    after_payload jsonb := '{}'::jsonb;
    action_name text;
    unclassified_field text;
BEGIN
    SELECT * INTO STRICT table_rule
      FROM public.audit_event_table_rules
     WHERE entity_schema=TG_TABLE_SCHEMA AND entity_table=TG_TABLE_NAME;
    old_value := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
    new_value := CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
    key_source := coalesce(new_value,old_value);

    SELECT keys.column_name INTO unclassified_field
      FROM jsonb_object_keys(key_source) AS keys(column_name)
      LEFT JOIN public.audit_event_fields f
        ON f.entity_schema=TG_TABLE_SCHEMA AND f.entity_table=TG_TABLE_NAME
       AND f.field_name=keys.column_name
     WHERE f.field_name IS NULL
     ORDER BY keys.column_name LIMIT 1;
    IF unclassified_field IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='55000',
            MESSAGE=format('Unclassified audited column %I.%I.%I',
                           TG_TABLE_SCHEMA,TG_TABLE_NAME,unclassified_field);
    END IF;

    SELECT jsonb_object_agg(key_name,key_source->key_name ORDER BY ordinal)
      INTO entity_key
      FROM unnest(table_rule.key_fields) WITH ORDINALITY AS keys(key_name,ordinal);

    IF TG_OP='INSERT' THEN
        SELECT array_agg(f.field_name ORDER BY f.field_name),
               jsonb_object_agg(
                   f.field_name,
                    public.audit_bound_json_value(
                        new_value->f.field_name,f.max_text_characters,f.capture_mode)
                   ORDER BY f.field_name)
          INTO fields,after_payload
          FROM public.audit_event_fields f
         WHERE f.entity_schema=TG_TABLE_SCHEMA AND f.entity_table=TG_TABLE_NAME
           AND f.capture_mode IN ('value','redacted');
        action_name := CASE WHEN table_rule.entity_kind='relationship'
                            THEN 'relationship_added' ELSE 'record_created' END;
    ELSIF TG_OP='UPDATE' THEN
        SELECT array_agg(f.field_name ORDER BY f.field_name),
               coalesce(jsonb_object_agg(
                   f.field_name,
                    public.audit_bound_json_value(
                        old_value->f.field_name,f.max_text_characters,f.capture_mode)
                   ORDER BY f.field_name),'{}'::jsonb),
               coalesce(jsonb_object_agg(
                   f.field_name,
                    public.audit_bound_json_value(
                        new_value->f.field_name,f.max_text_characters,f.capture_mode)
                   ORDER BY f.field_name),'{}'::jsonb)
          INTO fields,before_payload,after_payload
          FROM public.audit_event_fields f
         WHERE f.entity_schema=TG_TABLE_SCHEMA AND f.entity_table=TG_TABLE_NAME
           AND f.capture_mode IN ('value','redacted')
           AND (old_value->f.field_name) IS DISTINCT FROM (new_value->f.field_name);
        IF fields IS NULL OR cardinality(fields)=0 THEN RETURN NEW; END IF;
        action_name := CASE WHEN table_rule.entity_kind='relationship'
                            THEN 'relationship_updated' ELSE 'record_updated' END;
    ELSE
        IF table_rule.entity_kind<>'relationship' THEN
            RAISE EXCEPTION 'Physical record deletion is outside the Task 3.3B/D25 contract';
        END IF;
        SELECT array_agg(f.field_name ORDER BY f.field_name),
               jsonb_object_agg(
                   f.field_name,
                    public.audit_bound_json_value(
                        old_value->f.field_name,f.max_text_characters,f.capture_mode)
                   ORDER BY f.field_name)
          INTO fields,before_payload
          FROM public.audit_event_fields f
         WHERE f.entity_schema=TG_TABLE_SCHEMA AND f.entity_table=TG_TABLE_NAME
           AND f.capture_mode IN ('value','redacted');
        action_name := 'relationship_removed';
    END IF;
    PERFORM public.audit_write_event(
        action_name,'succeeded',TG_TABLE_SCHEMA,TG_TABLE_NAME,entity_key,
        fields,before_payload,after_payload,NULL,NULL,NULL,'{}'::jsonb,NULL,'{}'::jsonb
    );
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$ROW_EVENT$;

CREATE FUNCTION public.audit_append_semantic_event_for_account(
    p_action text,
    p_outcome text,
    p_entity_schema text,
    p_entity_table text,
    p_entity_key jsonb,
    p_target_user_account_id integer,
    p_attempted_username text,
    p_resource_identifier text,
    p_parameters jsonb,
    p_reason_code text,
    p_event_metadata jsonb
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $ACCOUNT_SEMANTIC_EVENT$
DECLARE
    resolved_target_actor_id integer;
BEGIN
    IF p_target_user_account_id IS NOT NULL THEN
        SELECT id INTO resolved_target_actor_id
          FROM public.audit_actors
         WHERE user_account_id=p_target_user_account_id;
        IF resolved_target_actor_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='42501',
                MESSAGE='Semantic target account has no immutable audit actor';
        END IF;
    END IF;
    RETURN public.audit_append_semantic_event(
        p_action,p_outcome,p_entity_schema,p_entity_table,p_entity_key,
        resolved_target_actor_id,p_attempted_username,p_resource_identifier,
        p_parameters,p_reason_code,p_event_metadata
    );
END;
$ACCOUNT_SEMANTIC_EVENT$;

REVOKE ALL ON FUNCTION public.audit_append_semantic_event(
    text,text,text,text,jsonb,integer,text,text,jsonb,text,jsonb
) FROM litigation_runtime;
REVOKE ALL ON FUNCTION public.audit_append_semantic_event_for_account(
    text,text,text,text,jsonb,integer,text,text,jsonb,text,jsonb
) FROM PUBLIC,litigation_runtime;
GRANT EXECUTE ON FUNCTION public.audit_append_semantic_event_for_account(
    text,text,text,text,jsonb,integer,text,text,jsonb,text,jsonb
) TO litigation_runtime;

DO $POSTCONDITION$
DECLARE
    baseline_allowlist_digest text;
    current_classification_digest text;
BEGIN
    IF (SELECT count(*) FROM public.audit_events)<>1
       OR (SELECT count(*) FROM public.audit_event_checkpoints)<>1 THEN
        RAISE EXCEPTION 'Task 3.3B correction altered historical event evidence';
    END IF;
    SELECT encode(sha256(convert_to(string_agg(
        entity_schema||E'\x1f'||entity_table||E'\x1f'||field_name||E'\x1f'||
        max_text_characters::text||E'\x1f'||capture_mode,
        E'\n' ORDER BY entity_schema,entity_table,field_name),'UTF8')),'hex')
      INTO baseline_allowlist_digest
      FROM public.audit_event_fields
     WHERE capture_mode IN ('value','redacted');
    SELECT encode(sha256(convert_to(string_agg(
        entity_schema||E'\x1f'||entity_table||E'\x1f'||field_name||E'\x1f'||
        max_text_characters::text||E'\x1f'||capture_mode||E'\x1f'||classification_reason,
        E'\n' ORDER BY entity_schema,entity_table,field_name),'UTF8')),'hex')
      INTO current_classification_digest
      FROM public.audit_event_fields;
    IF baseline_allowlist_digest<>'9e271a6e23bc03e55223db3c0a9be1b0e34867da0af8c6f0acab5614506de11b'
       OR baseline_allowlist_digest IS DISTINCT FROM (
           SELECT allowlist_digest::text FROM public.audit_event_checkpoints
            WHERE checkpoint_key='task_3_3b_baseline'
       )
       OR current_classification_digest<>'4ebad0a7bc5862dbd537abac05727f4968598c3b30336ee8e9236ba6b653bf0d' THEN
        RAISE EXCEPTION 'Task 3.3B baseline/current classification evidence differs';
    END IF;
    IF (SELECT count(*) FROM public.audit_event_fields)<>583
       OR (SELECT count(*) FROM public.audit_event_fields WHERE capture_mode='value')<>261
       OR (SELECT count(*) FROM public.audit_event_fields WHERE capture_mode='redacted')<>1
       OR (SELECT count(*) FROM public.audit_event_fields WHERE capture_mode='entity_key')<>38
       OR (SELECT count(*) FROM public.audit_event_fields WHERE capture_mode='structural')<>152
       OR (SELECT count(*) FROM public.audit_event_fields WHERE capture_mode='excluded')<>131
       OR EXISTS (
           SELECT 1 FROM information_schema.columns c
           JOIN public.audit_event_table_rules r
             ON r.entity_schema=c.table_schema AND r.entity_table=c.table_name
           LEFT JOIN public.audit_event_fields f
             ON f.entity_schema=c.table_schema AND f.entity_table=c.table_name
            AND f.field_name=c.column_name
          WHERE f.field_name IS NULL
       )
       OR EXISTS (
           SELECT 1 FROM public.audit_event_fields f
           LEFT JOIN information_schema.columns c
             ON c.table_schema=f.entity_schema AND c.table_name=f.entity_table
            AND c.column_name=f.field_name
          WHERE c.column_name IS NULL
       ) THEN
        RAISE EXCEPTION 'Task 3.3B exhaustive column classification differs';
    END IF;
    IF has_table_privilege('litigation_runtime','public.audit_actors','SELECT')
       OR has_function_privilege(
           'litigation_runtime',
           'public.audit_append_semantic_event(text,text,text,text,jsonb,integer,text,text,jsonb,text,jsonb)',
           'EXECUTE')
       OR NOT has_function_privilege(
           'litigation_runtime',
           'public.audit_append_semantic_event_for_account(text,text,text,text,jsonb,integer,text,text,jsonb,text,jsonb)',
           'EXECUTE') THEN
        RAISE EXCEPTION 'Task 3.3B target-account gateway boundary differs';
    END IF;
END
$POSTCONDITION$;

COMMIT;
