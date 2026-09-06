BEGIN;
SET LOCAL TIME ZONE 'UTC';

LOCK TABLE public.people,public.person_name_alias,public.lookup_team,public.user_accounts IN ACCESS EXCLUSIVE MODE;
-- Block appenders while validating and capturing one atomic roster/event
-- boundary. A transaction which already wrote an event must finish first.
LOCK TABLE public.audit_events,public.audit_actors IN SHARE MODE;

-- Task 4.0a Phase 1 only. No business backfill, password provisioning,
-- external-person rewrite, Access cutover, route or UI is performed here.
DO $precondition$
BEGIN
  IF session_user<>current_user OR NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=session_user),false) THEN
    RAISE EXCEPTION 'D35 direct migration principal required';
  END IF;
  IF (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>60
     OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations
       WHERE migration_name='20260904180000_prepare_high_impact_application'
       AND checksum='7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5'
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND applied_steps_count=1)
     OR to_regclass('_migration.staff_roster_boundary') IS NOT NULL THEN
    RAISE EXCEPTION 'Exact migration-60 checkpoint required';
  END IF;
  -- These independently recorded projections are identical on the two
  -- accepted profiles. Timestamps are preserved below, not regenerated.
  -- can_login is derived by Task 3.1/3.4, not immutable roster evidence.
  -- Its actual value (and all timestamps/actors) is still snapshotted below.
  IF (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(p)-ARRAY['created_at','updated_at','created_by','updated_by','can_login'] ORDER BY id)::text,'UTF8')),'hex') FROM public.people p)
       IS DISTINCT FROM '073f4cf16867bf56f02366f908ee22fe025d0711a6130159428f2da09c2f2647'
     OR (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(a)-ARRAY['created_at','updated_at','created_by','updated_by'] ORDER BY id)::text,'UTF8')),'hex') FROM public.person_name_alias a)
       NOT IN ('a7466bda93ea6045822f55bed90e93f00561f3fc60dd2922cbb780d6d799091d','716fea9249b0faeda9285e3881bce60d9b5f5a73341a77b97d3dbec3e8eda6c8')
     OR (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(t)-ARRAY['created_at','updated_at','created_by','updated_by'] ORDER BY id)::text,'UTF8')),'hex') FROM public.lookup_team t)
       IS DISTINCT FROM '494f8d73dbe6da5bf4aa1aa0b170f06e21abf40caa7e064c8a6f37a1044bcb60' THEN
    RAISE EXCEPTION 'Original roster identity/state differs; no automatic correction is permitted';
  END IF;
  IF EXISTS(SELECT 1 FROM public.people p WHERE p.can_login IS DISTINCT FROM
       (p.is_active AND EXISTS(SELECT 1 FROM public.user_accounts u WHERE u.person_id=p.id AND u.is_enabled)))
     OR EXISTS(SELECT 1 FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
       WHERE u.is_enabled AND (NOT p.is_active OR NOT p.is_staff)) THEN
    RAISE EXCEPTION 'Current account-derived login eligibility is inconsistent';
  END IF;
END
$precondition$;

-- Canonical JSON must describe the same instant regardless of the caller's
-- session timezone. No stored timestamp or frozen historical digest changes.
CREATE FUNCTION _migration.staff_json_row(p_row anyelement) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
  SELECT to_jsonb(p_row);
$$;

CREATE TABLE _migration.staff_roster_person AS TABLE public.people;
ALTER TABLE _migration.staff_roster_person ADD PRIMARY KEY(id);
CREATE TABLE _migration.staff_roster_alias AS
  SELECT a.*,NOT p.is_application_native AS is_imported
  FROM public.person_name_alias a JOIN public.people p ON p.id=a.person_id;
ALTER TABLE _migration.staff_roster_alias ADD PRIMARY KEY(id);
CREATE TABLE _migration.staff_roster_team AS TABLE public.lookup_team;
ALTER TABLE _migration.staff_roster_team ADD PRIMARY KEY(id);
CREATE TABLE _migration.staff_roster_boundary (
  singleton boolean PRIMARY KEY CHECK(singleton),
  profile text NOT NULL CHECK(profile IN ('historical-full-state-upgrade','canonical-clean-replay')),
  extraction_sha256 text,
  source_inventory jsonb NOT NULL,
  roster_sources jsonb NOT NULL,
  people_sha256 text NOT NULL,
  aliases_sha256 text NOT NULL,
  teams_sha256 text NOT NULL,
  last_prior_event_id bigint NOT NULL,
  prior_event_count bigint NOT NULL,
  prior_events_sha256 text NOT NULL,
  established_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK((profile='canonical-clean-replay' AND extraction_sha256 IS NULL)
     OR (profile='historical-full-state-upgrade' AND extraction_sha256='40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979'))
);

DO $boundary$
DECLARE
  source record; n bigint; total_rows bigint:=0; digest text;
  inventory jsonb:='[]'; roster_sources jsonb:='{}'; payload jsonb;
  profile_name text; fingerprint text;
BEGIN
  FOR source IN SELECT tablename FROM pg_tables WHERE schemaname='staging' ORDER BY tablename COLLATE "C" LOOP
    EXECUTE format('SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,E''\n'' ORDER BY to_jsonb(s)::text COLLATE "C"),''''),''UTF8'')),''hex'') FROM staging.%I s',source.tablename)
      INTO n,digest;
    total_rows:=total_rows+n;
    inventory:=inventory||jsonb_build_array(jsonb_build_object('table',source.tablename,'count',n,'sha256',digest));
    IF source.tablename=ANY(ARRAY['lawyers','المحامين','فريق العمل']) THEN
      EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY src_record_key COLLATE "C"),''[]''::jsonb) FROM staging.%I s',source.tablename) INTO payload;
      roster_sources:=roster_sources||jsonb_build_object(source.tablename,payload);
    END IF;
  END LOOP;
  IF jsonb_array_length(inventory)<>20 OR (SELECT count(*) FROM jsonb_object_keys(roster_sources))<>3 THEN
    RAISE EXCEPTION 'Staging source inventory is incomplete';
  END IF;
  IF total_rows=0 THEN
    profile_name:='canonical-clean-replay';
    IF EXISTS(SELECT 1 FROM quarantine.review_value) OR EXISTS(SELECT 1 FROM quarantine.finding)
       OR EXISTS(SELECT 1 FROM _migration.high_impact_application)
       OR EXISTS(SELECT 1 FROM _migration.high_impact_resolution)
       OR EXISTS(SELECT 1 FROM _migration.high_impact_row_proof) THEN
      RAISE EXCEPTION 'Canonical replay contains unexpected historical artifacts';
    END IF;
  ELSE
    profile_name:='historical-full-state-upgrade';
    fingerprint:=_migration.current_staging_fingerprint();
    IF inventory IS DISTINCT FROM '[{"table":"Attendance","count":4022,"sha256":"411f2d56a3eaad2e322d22b328674769e32e84c8454f9be898c122bed0ac4655"},{"table":"Contacts","count":188,"sha256":"341a5c7e751713ca8d8eed4528a7b9e8267c5fe767daf2d1732cb56b21b5e608"},{"table":"Contacts__Attachments","count":0,"sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"table":"LawyerShare4Invoices","count":0,"sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"table":"admin work table","count":4238,"sha256":"e30ee604fcbc73756d96b988c72f592f1f92ec014e4b4738396e50b1c86163b5"},{"table":"lawyers","count":23,"sha256":"d664f8636b0d47a9e5e9d9f5441fde7d9ded1132efdf857bb83713c7b17c1181"},{"table":"إجراءات المهام","count":4252,"sha256":"b5b56c4308157eb7fb1fe836879bf4583b3cbe579de8e71add60a3f19a675ced"},{"table":"التوكيلات","count":752,"sha256":"a6a20c13e2ad45751b9e31f71d66b5abbc87997d4e94281ae22910b4c2fe77d0"},{"table":"الجلسات","count":13382,"sha256":"2fd07c91adf59f57572d9e9c9d5f7775e288e03bd65f2557e84e9345bb900be7"},{"table":"الدعاوى","count":1744,"sha256":"61bbd24ec6f60b47a91bd4ed74b29284712a2ada9034f6e00660d02c6a49675c"},{"table":"السداد","count":597,"sha256":"a9f9febea058c1bdfd164219b136e0c2289c91baa3c1554e73992f843f3796d4"},{"table":"العملاء","count":318,"sha256":"b607f9aba96242a90e89a4e63d78c179552f3338eed05c6a7f5afad161170187"},{"table":"العملاء__logo","count":54,"sha256":"8fa614e412c800313f6bfcf6f446a01b70f41737db631670225fa1518c6f1f75"},{"table":"الفواتير","count":543,"sha256":"578ef185a503fa2927b35a8f7c84647c5b50de675055601114a88fd0c3bf9044"},{"table":"المحامين","count":38,"sha256":"cb7110546e47069dc04623389499c09e57e14b5d9ea427f3ab8e44dbfc2dbcf4"},{"table":"المستندات","count":407,"sha256":"f685348dd01ca71c1bf0f7cae2ff6cd982f174ca990ecb1948f8d495763ad065"},{"table":"تقسيم التحصيلات","count":47,"sha256":"d47c6cae5713b81227905c86b182e4a2358c490dc436e49d3561b758a2466b2f"},{"table":"خطابات الأتعاب","count":331,"sha256":"270058d710030a7f40e53303e263d4c102b0c67da147309027b9bf5940b9ccc7"},{"table":"خطابات الأتعاب__Matter","count":288,"sha256":"ffaf59810b20b0e10b10554523df7054e463d4cf4092820be7dc703de5e5109e"},{"table":"فريق العمل","count":3,"sha256":"051893a2d606a237e9be3b550cfe20264753fc17258d4880f0f59c8601ba43fe"}]'::jsonb THEN
      RAISE EXCEPTION 'Historical staged source rows or durable identities differ';
    END IF;
    IF fingerprint<>'40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979'
       OR (SELECT count(*) FROM quarantine.review_value WHERE answered_at IS NOT NULL)
          +(SELECT count(*) FROM quarantine.finding WHERE answered_at IS NOT NULL)<>744
       OR (SELECT count(*) FROM _migration.high_impact_application)<>1
       OR (SELECT count(*) FROM _migration.high_impact_resolution)<>382 THEN
      RAISE EXCEPTION 'Historical profile evidence is absent, partial or unexpected';
    END IF;
  END IF;
  -- The live sequence has one historical consumed value: the final imported
  -- alias and the two native aliases are IDs 349/350/351 there, versus
  -- 348/349/350 in canonical replay. Spelling, ownership and primary state
  -- are identical. Preserve each profile's actual IDs; never renumber rows.
  IF (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(a)-ARRAY['created_at','updated_at','created_by','updated_by'] ORDER BY id)::text,'UTF8')),'hex') FROM public.person_name_alias a)
    IS DISTINCT FROM (CASE profile_name WHEN 'historical-full-state-upgrade'
      THEN 'a7466bda93ea6045822f55bed90e93f00561f3fc60dd2922cbb780d6d799091d'
      ELSE '716fea9249b0faeda9285e3881bce60d9b5f5a73341a77b97d3dbec3e8eda6c8' END) THEN
    RAISE EXCEPTION 'Alias identity projection belongs to the wrong historical/canonical profile';
  END IF;
  INSERT INTO _migration.staff_roster_boundary
  SELECT true,profile_name,fingerprint,inventory,roster_sources,
    (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_person p),
    (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_alias a),
    (SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'UTF8')),'hex') FROM _migration.staff_roster_team t),
    (SELECT max(id) FROM public.audit_events),
    (SELECT count(*) FROM public.audit_events),
    (SELECT encode(sha256(convert_to(string_agg(to_jsonb(e)::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM public.audit_events e),
    statement_timestamp();
END
$boundary$;

-- Positive validation, not a relaxed event-count threshold. The reviewed
-- historical prefix is fixed INCLUDING timestamps; later rows must obey the
-- existing structural capture and semantic gateway contracts. Sequence gaps
-- are legal (rolled-back transactions consume IDs), so max(id) is not a count.
-- As with D35/D43, the database superuser is trusted: this is not an external
-- signature capable of proving authenticity against a superuser who forges a
-- complete, internally consistent history and all its supporting state.
DO $prior_audit$
DECLARE
  boundary _migration.staff_roster_boundary%ROWTYPE;
  prefix_end bigint; event public.audit_events%ROWTYPE; actor record; target record;
  rule record; item record; side jsonb; expected_fields text[]; valid boolean;
  check_rule record; invalid boolean; identity record; expected_value jsonb;
  actual_value jsonb; timestamp_field boolean;
BEGIN
  SELECT * INTO STRICT boundary FROM _migration.staff_roster_boundary;
  prefix_end:=CASE boundary.profile WHEN 'historical-full-state-upgrade' THEN 824 ELSE 1 END;
  IF boundary.last_prior_event_id<prefix_end OR EXISTS(SELECT 1 FROM public.audit_events WHERE id<1)
     OR (SELECT count(*) FROM public.audit_event_checkpoints)<>1
     OR NOT EXISTS(SELECT 1 FROM public.audit_event_checkpoints c JOIN public.audit_events e ON e.id=c.first_event_id
       WHERE c.checkpoint_key='task_3_3b_baseline' AND c.event_count=1 AND c.first_event_id=1 AND c.through_event_id=1
       AND c.baseline_profile=CASE boundary.profile WHEN 'historical-full-state-upgrade' THEN 'historical-live' ELSE 'canonical-clean-replay' END
       AND c.event_digest=encode(sha256(convert_to((to_jsonb(e)-'occurred_at')::text,'UTF8')),'hex')
       AND e.action='audit_baseline_established' AND e.actor_key_snapshot='system_migration' AND e.outcome='succeeded'
       AND e.event_metadata->'access_history_available'='false'::jsonb
       AND e.event_metadata->'migrations_applied_before'='56'::jsonb)
     OR (SELECT count(*) FROM public.audit_events WHERE action='audit_baseline_established')<>1 THEN
    RAISE EXCEPTION 'Protected audit prefix baseline is invalid';
  END IF;
  IF boundary.profile='historical-full-state-upgrade' AND (
       (SELECT count(*) FROM public.audit_events WHERE id<=824)<>824
       OR (SELECT encode(sha256(convert_to(string_agg(to_jsonb(e)::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM public.audit_events e WHERE id<=824)
          IS DISTINCT FROM 'e49706d35eeae3dcb15bc08f1da8196528924d40495c7e092864ad71393cbf29') THEN
    RAISE EXCEPTION 'Protected historical audit prefix differs';
  END IF;
  -- Re-evaluate the installed CHECKs as data predicates; invalidity cannot be
  -- hidden merely by disabling a row trigger during an adversarial fixture.
  FOR check_rule IN SELECT pg_get_expr(conbin,conrelid) expression FROM pg_constraint
    WHERE conrelid='public.audit_events'::regclass AND contype='c' LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.audit_events WHERE (%s) IS FALSE)',check_rule.expression) INTO invalid;
    IF invalid THEN RAISE EXCEPTION 'Pre-boundary audit event violates structural constraints'; END IF;
  END LOOP;
  FOR event IN SELECT * FROM public.audit_events WHERE id>prefix_end ORDER BY id LOOP
    SELECT a.*,u.person_id,p.name_ar INTO actor FROM public.audit_actors a
      LEFT JOIN public.user_accounts u ON u.id=a.user_account_id LEFT JOIN public.people p ON p.id=u.person_id WHERE a.id=event.actor_id;
    SELECT a.*,u.person_id,p.name_ar INTO target FROM public.audit_actors a
      LEFT JOIN public.user_accounts u ON u.id=a.user_account_id LEFT JOIN public.people p ON p.id=u.person_id WHERE a.id=event.target_actor_id;
    IF actor.id IS NULL OR event.actor_key_snapshot IS DISTINCT FROM actor.actor_key
       OR event.actor_display_name_snapshot IS DISTINCT FROM coalesce(actor.name_ar,actor.identity_label)
       OR (actor.actor_kind<>'human' AND (event.actor_username_snapshot IS NOT NULL OR event.actor_role_snapshot IS NOT NULL))
       OR (actor.actor_kind='human' AND (event.actor_username_snapshot IS NULL OR event.actor_role_snapshot IS NULL))
       OR (event.target_actor_id IS NOT NULL AND (target.id IS NULL OR target.actor_kind<>'human'
         OR event.target_actor_key_snapshot IS DISTINCT FROM target.actor_key
         OR event.target_display_name_snapshot IS DISTINCT FROM target.name_ar))
       OR NOT public.audit_safe_flat_object(event.parameters) OR NOT public.audit_safe_flat_object(event.event_metadata)
       OR public.audit_contains_secret_pattern(concat_ws(' ',event.user_agent,event.attempted_username,event.resource_identifier)) THEN
      RAISE EXCEPTION 'Pre-boundary audit actor or metadata is invalid at event %',event.id;
    END IF;
    -- Resolve mutable username/role at event time, not at deployment time.
    -- The latest structural after-value wins, otherwise the next before-value,
    -- otherwise the unchanged account value. No old role is guessed from a
    -- current Administrator check (an approved later role change is legal).
    FOR identity IN SELECT * FROM (VALUES
      (actor.user_account_id,'username',to_jsonb(event.actor_username_snapshot)),
      (actor.user_account_id,'role_code',to_jsonb(event.actor_role_snapshot)),
      (target.user_account_id,'username',to_jsonb(event.target_username_snapshot)),
      (target.user_account_id,'role_code',to_jsonb(event.target_role_snapshot))) v(account_id,field,snapshot)
      WHERE account_id IS NOT NULL LOOP
      SELECT coalesce(
        (SELECT e.after_values->identity.field FROM public.audit_events e WHERE e.entity_table='user_accounts'
          AND e.entity_key=jsonb_build_object('id',identity.account_id) AND e.id<=event.id AND e.after_values ? identity.field ORDER BY e.id DESC LIMIT 1),
        (SELECT e.before_values->identity.field FROM public.audit_events e WHERE e.entity_table='user_accounts'
          AND e.entity_key=jsonb_build_object('id',identity.account_id) AND e.id>event.id AND e.before_values ? identity.field ORDER BY e.id LIMIT 1),
        (SELECT to_jsonb(u)->identity.field FROM public.user_accounts u WHERE u.id=identity.account_id)) INTO expected_value;
      IF identity.snapshot IS DISTINCT FROM expected_value THEN
        RAISE EXCEPTION 'Pre-boundary audit account snapshot is invalid at event %',event.id;
      END IF;
    END LOOP;
    SELECT * INTO rule FROM public.audit_event_table_rules r WHERE r.entity_schema=event.entity_schema AND r.entity_table=event.entity_table;
    IF event.entity_key IS NOT NULL AND (rule.entity_table IS NULL OR NOT public.audit_safe_flat_object(event.entity_key)) THEN
      RAISE EXCEPTION 'Pre-boundary audit entity is invalid at event %',event.id;
    END IF;
    IF event.action IN ('record_created','record_updated','relationship_added','relationship_updated','relationship_removed') THEN
      valid:=event.outcome='succeeded' AND rule.entity_table IS NOT NULL
        AND event.entity_key=jsonb_build_object('id',event.entity_key->'id') AND jsonb_typeof(event.entity_key->'id')='number'
        AND event.target_actor_id IS NULL AND event.attempted_username IS NULL AND event.resource_identifier IS NULL
        AND event.reason_code IS NULL AND event.parameters='{}' AND event.event_metadata='{}'
        AND event.action=CASE WHEN rule.entity_kind='record' THEN CASE WHEN event.action='record_created' THEN 'record_created' ELSE 'record_updated' END
          ELSE CASE WHEN event.action='relationship_added' THEN 'relationship_added' WHEN event.action='relationship_removed' THEN 'relationship_removed' ELSE 'relationship_updated' END END;
      IF event.action IN ('record_created','relationship_added','relationship_removed') THEN
        SELECT array_agg(field_name ORDER BY field_name) INTO expected_fields FROM public.audit_event_fields
          WHERE entity_schema=event.entity_schema AND entity_table=event.entity_table AND capture_mode IN ('value','redacted');
      ELSE
        SELECT array_agg(field ORDER BY field) INTO expected_fields FROM (SELECT DISTINCT unnest(event.changed_fields) field) f;
      END IF;
      valid:=valid AND cardinality(event.changed_fields)>0 AND event.changed_fields=expected_fields
        AND ARRAY(SELECT jsonb_object_keys(event.before_values) ORDER BY 1)=CASE WHEN event.action IN ('record_created','relationship_added') THEN ARRAY[]::text[] ELSE expected_fields END
        AND ARRAY(SELECT jsonb_object_keys(event.after_values) ORDER BY 1)=CASE WHEN event.action='relationship_removed' THEN ARRAY[]::text[] ELSE expected_fields END;
      FOREACH side IN ARRAY ARRAY[event.before_values,event.after_values] LOOP
        FOR item IN SELECT j.key,j.value,f.capture_mode,f.max_text_characters FROM jsonb_each(side) j LEFT JOIN public.audit_event_fields f
          ON f.entity_schema=event.entity_schema AND f.entity_table=event.entity_table AND f.field_name=j.key LOOP
          valid:=valid AND item.capture_mode IN ('value','redacted') AND CASE WHEN item.capture_mode='redacted'
            THEN item.value='{"$redacted":true,"$reason":"sensitive_field"}'::jsonb
            WHEN jsonb_typeof(item.value)<>'object' THEN item.value=public.audit_bound_json_value(item.value,item.max_text_characters,'value')
            ELSE item.value IN ('{"$redacted":true,"$reason":"structured_value"}'::jsonb,'{"$redacted":true,"$reason":"secret_pattern"}'::jsonb)
              OR (item.value=jsonb_build_object('$value',item.value->'$value','$truncated',true,'$original_characters',item.value->'$original_characters')
                AND jsonb_typeof(item.value->'$value')='string' AND char_length(item.value->>'$value')=item.max_text_characters
                AND jsonb_typeof(item.value->'$original_characters')='number' AND (item.value->>'$original_characters')::numeric>item.max_text_characters
                AND NOT public.audit_contains_secret_pattern(item.value->>'$value')) END;
        END LOOP;
      END LOOP;
      -- A bounded payload is not yet a truthful row event. Every captured
      -- after-value must lead to the next captured before-value, or to the
      -- actual final row if no later event changes that field. The most recent
      -- reviewed before-boundary after-value also anchors each known before.
      -- Compare timestamptz instants, not a writer's timezone spelling.
      FOR item IN SELECT j.key,j.value,f.capture_mode,f.max_text_characters FROM jsonb_each(event.after_values) j
        JOIN public.audit_event_fields f ON f.entity_schema=event.entity_schema AND f.entity_table=event.entity_table AND f.field_name=j.key LOOP
        SELECT e.before_values->item.key INTO expected_value FROM public.audit_events e
          WHERE e.entity_schema=event.entity_schema AND e.entity_table=event.entity_table AND e.entity_key=event.entity_key
            AND e.id>event.id AND e.before_values ? item.key ORDER BY e.id LIMIT 1;
        IF NOT FOUND THEN
          EXECUTE format('SELECT public.audit_bound_json_value(to_jsonb(t)->$1,$2,$3) FROM public.%I t WHERE to_jsonb(t)->''id''=$4',event.entity_table)
            INTO expected_value USING item.key,item.max_text_characters,item.capture_mode,event.entity_key->'id';
        END IF;
        SELECT a.atttypid='timestamptz'::regtype INTO timestamp_field FROM pg_attribute a
          WHERE a.attrelid=format('public.%I',event.entity_table)::regclass AND a.attname=item.key AND NOT a.attisdropped;
        actual_value:=item.value;
        IF timestamp_field AND jsonb_typeof(actual_value)='string' AND jsonb_typeof(expected_value)='string' THEN
          actual_value:=to_jsonb((actual_value#>>'{}')::timestamptz);
          expected_value:=to_jsonb((expected_value#>>'{}')::timestamptz);
        END IF;
        IF actual_value IS DISTINCT FROM expected_value THEN
          RAISE EXCEPTION 'Pre-boundary audit structural continuity is invalid at event %',event.id;
        END IF;
      END LOOP;
      FOR item IN SELECT * FROM jsonb_each(event.before_values) LOOP
        SELECT e.after_values->item.key INTO expected_value FROM public.audit_events e
          WHERE e.entity_schema=event.entity_schema AND e.entity_table=event.entity_table AND e.entity_key=event.entity_key
            AND e.id<event.id AND e.after_values ? item.key ORDER BY e.id DESC LIMIT 1;
        IF FOUND THEN
          SELECT a.atttypid='timestamptz'::regtype INTO timestamp_field FROM pg_attribute a
            WHERE a.attrelid=format('public.%I',event.entity_table)::regclass AND a.attname=item.key AND NOT a.attisdropped;
          actual_value:=item.value;
          IF timestamp_field AND jsonb_typeof(actual_value)='string' AND jsonb_typeof(expected_value)='string' THEN
            actual_value:=to_jsonb((actual_value#>>'{}')::timestamptz);
            expected_value:=to_jsonb((expected_value#>>'{}')::timestamptz);
          END IF;
          IF actual_value IS DISTINCT FROM expected_value THEN
            RAISE EXCEPTION 'Pre-boundary audit structural continuity is invalid at event %',event.id;
          END IF;
        END IF;
      END LOOP;
    ELSE
      valid:=event.changed_fields=ARRAY[]::text[] AND event.before_values='{}' AND event.after_values='{}';
      valid:=valid AND CASE event.action
        WHEN 'login_succeeded' THEN actor.actor_kind='human' AND event.outcome='succeeded' AND event.target_actor_id IS NULL AND event.attempted_username IS NULL
          AND event.entity_schema='public' AND event.entity_table='user_accounts' AND event.entity_key=jsonb_build_object('id',actor.user_account_id)
        WHEN 'login_failed' THEN actor.actor_key='system_authentication' AND event.outcome IN ('failed','blocked') AND event.attempted_username IS NOT NULL
          AND ((event.target_actor_id IS NULL AND event.entity_key IS NULL) OR (event.entity_schema='public' AND event.entity_table='user_accounts' AND event.entity_key=jsonb_build_object('id',target.user_account_id)))
        WHEN 'account_locked' THEN actor.actor_key='system_authentication' AND event.outcome='succeeded' AND target.actor_kind='human'
          AND event.entity_schema='public' AND event.entity_table='user_accounts' AND event.entity_key=jsonb_build_object('id',target.user_account_id)
        WHEN 'password_changed' THEN actor.actor_kind='human' AND event.outcome='succeeded' AND event.target_actor_id=event.actor_id
          AND event.entity_schema='public' AND event.entity_table='user_accounts' AND event.entity_key=jsonb_build_object('id',actor.user_account_id)
        WHEN 'password_initialized' THEN (actor.actor_key='system_administration' AND target.user_account_id BETWEEN 1 AND 4 OR actor.actor_kind='human' AND event.actor_role_snapshot='Administrator' AND actor.id<>target.id)
        WHEN 'password_reset' THEN (actor.actor_key='system_administration' AND target.user_account_id BETWEEN 1 AND 4 OR actor.actor_kind='human' AND event.actor_role_snapshot='Administrator' AND actor.id<>target.id)
        WHEN 'account_created' THEN actor.actor_kind='human' AND event.actor_role_snapshot='Administrator'
        WHEN 'account_enabled' THEN actor.actor_kind='human' AND event.actor_role_snapshot='Administrator'
        WHEN 'account_disabled' THEN actor.actor_kind='human' AND event.actor_role_snapshot='Administrator'
        WHEN 'username_changed' THEN actor.actor_kind='human' AND event.actor_role_snapshot='Administrator'
        WHEN 'role_changed' THEN actor.actor_kind='human' AND event.actor_role_snapshot='Administrator'
        WHEN 'archive' THEN actor.actor_kind='human' AND event.outcome='succeeded' AND event.target_actor_id IS NULL AND event.entity_key IS NOT NULL AND event.entity_table<>'user_accounts'
        WHEN 'restore' THEN actor.actor_kind='human' AND event.outcome='succeeded' AND event.target_actor_id IS NULL AND event.entity_key IS NOT NULL AND event.entity_table<>'user_accounts'
        WHEN 'report_executed' THEN actor.actor_kind='human' AND event.resource_identifier IS NOT NULL
        WHEN 'export_completed' THEN actor.actor_kind='human' AND event.resource_identifier IS NOT NULL
        WHEN 'download_completed' THEN actor.actor_kind='human' AND event.resource_identifier IS NOT NULL
        ELSE false END;
      IF event.action IN ('password_initialized','password_reset','account_created','account_enabled','account_disabled','username_changed','role_changed') THEN
        valid:=valid AND event.outcome='succeeded' AND target.actor_kind='human' AND event.entity_schema='public' AND event.entity_table='user_accounts'
          AND event.entity_key=jsonb_build_object('id',target.user_account_id);
      END IF;
      IF event.action IN ('password_initialized','password_reset','account_created','account_enabled','account_disabled','username_changed','role_changed','archive','restore') THEN
        valid:=valid AND event.attempted_username IS NULL AND event.resource_identifier IS NULL AND event.reason_code IS NULL AND event.parameters='{}' AND event.event_metadata='{}';
      END IF;
    END IF;
    IF valid IS NOT TRUE THEN RAISE EXCEPTION 'Pre-boundary audit action or payload is invalid at event %',event.id; END IF;
  END LOOP;
END
$prior_audit$;

CREATE FUNCTION _migration.refuse_staff_evidence_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Staff roster boundary evidence is immutable'; END;
$$;
DO $immutable$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['staff_roster_person','staff_roster_alias','staff_roster_team','staff_roster_boundary'] LOOP
    EXECUTE format('CREATE TRIGGER staff_evidence_no_change BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.refuse_staff_evidence_change()',name);
    EXECUTE format('REVOKE ALL ON _migration.%I FROM PUBLIC,litigation_runtime',name);
  END LOOP;
END
$immutable$;

-- A real row write, not just an advisory lock: stale REPEATABLE READ and
-- SERIALIZABLE snapshots conflict instead of admitting write skew. All four
-- tables participate, including the already established /users write paths.
CREATE TABLE _migration.staff_roster_mutex(singleton boolean PRIMARY KEY CHECK(singleton),revision bigint NOT NULL);
INSERT INTO _migration.staff_roster_mutex VALUES(true,0);
REVOKE ALL ON _migration.staff_roster_mutex FROM PUBLIC,litigation_runtime;
CREATE FUNCTION _migration.lock_staff_roster() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE _migration.staff_roster_mutex SET revision=revision+1 WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff serialization mutex is missing'; END IF;
END;
$$;
CREATE FUNCTION _migration.staff_roster_statement_lock() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM _migration.lock_staff_roster(); RETURN NULL; END;
$$;
DO $locks$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['people','person_name_alias','lookup_team','user_accounts'] LOOP
    EXECUTE format('CREATE TRIGGER aa_staff_roster_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.staff_roster_statement_lock()',name);
  END LOOP;
END
$locks$;

ALTER TABLE public.people
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
  ADD COLUMN alias_epoch bigint NOT NULL DEFAULT 0 CHECK(alias_epoch>=0),
  ADD COLUMN application_modified_at timestamptz(6),
  ADD COLUMN application_modified_by integer REFERENCES public.audit_actors(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT people_application_modification_pair CHECK((application_modified_at IS NULL)=(application_modified_by IS NULL)),
  ADD CONSTRAINT people_email_normalized_shape CHECK(email IS NULL OR (email=lower(btrim(email)) AND email<>''));
ALTER TABLE public.person_name_alias
  ADD COLUMN is_retired boolean NOT NULL DEFAULT false,
  ADD COLUMN retirement_reason text,
  ADD CONSTRAINT staff_alias_retirement_shape CHECK(
    (NOT is_retired OR NOT is_primary) AND
    (retirement_reason IS NULL OR (retirement_reason=btrim(retirement_reason) AND char_length(retirement_reason) BETWEEN 1 AND 2048)) AND
    (NOT is_retired OR retirement_reason IS NOT NULL)),
  DROP CONSTRAINT person_name_alias_person_id_fkey,
  ADD CONSTRAINT person_name_alias_person_id_fkey FOREIGN KEY(person_id) REFERENCES public.people(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.lookup_team ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0);
CREATE UNIQUE INDEX people_email_normalized_unique ON public.people(lower(btrim(email))) WHERE email IS NOT NULL;
CREATE INDEX person_name_alias_active_normalized_idx ON public.person_name_alias(alias_ar_normalised) WHERE NOT is_retired;

-- Extend, never reinterpret, the frozen 583-column classification. The old
-- baseline digest is checked over exactly its original field identities.
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason) VALUES
 ('public','people','row_version',64,'value','staff_database_version'),
 ('public','people','alias_epoch',64,'value','staff_database_alias_revision'),
 ('public','people','application_modified_at',64,'value','staff_application_modification_provenance'),
 ('public','people','application_modified_by',64,'value','staff_application_modification_provenance'),
 ('public','person_name_alias','is_retired',64,'value','staff_alias_lifecycle'),
 ('public','person_name_alias','retirement_reason',2048,'value','staff_alias_lifecycle_reason'),
 ('public','lookup_team','row_version',64,'value','staff_database_version');

CREATE FUNCTION _migration.staff_require_administrator() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE account_id integer;
BEGIN
  PERFORM _migration.lock_staff_roster();
  PERFORM public.audit_ensure_event_context();
  SELECT user_account_id INTO account_id FROM public.audit_actors
    WHERE id=public.audit_current_actor_id() AND actor_kind='human';
  IF account_id IS NULL OR NOT public.user_account_is_usable_administrator(account_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='A current usable human Administrator is required for staff changes';
  END IF;
  RETURN account_id;
END;
$$;

CREATE FUNCTION _migration.staff_assert_text(value text,maximum integer,required boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF (required AND coalesce(value,'')='') OR char_length(value)>maximum
     OR (value IS NOT NULL AND (value<>btrim(value) OR public.audit_contains_secret_pattern(value))) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid staff text; secrets and surrounding whitespace are not accepted';
  END IF;
END;
$$;

CREATE FUNCTION _migration.staff_person_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE business_changed boolean; acting_account integer;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'People cannot be physically deleted'; END IF;
  NEW.email:=nullif(lower(btrim(NEW.email)),'');
  PERFORM _migration.staff_assert_text(NEW.name_ar,256,true);
  PERFORM _migration.staff_assert_text(NEW.name_en,256,false);
  PERFORM _migration.staff_assert_text(NEW.email,254,false);
  NEW.name_ar_normalised:=public.ar_normalise(NEW.name_ar);
  IF coalesce(NEW.name_ar_normalised,'')='' THEN RAISE EXCEPTION 'An Arabic identity must not normalize to empty'; END IF;
  IF TG_OP='INSERT' THEN
    IF session_user='litigation_runtime' THEN PERFORM _migration.staff_require_administrator(); END IF;
    IF session_user='litigation_runtime' THEN NEW.is_application_native:=true; END IF;
    IF NOT NEW.is_staff THEN RAISE EXCEPTION 'New external identities require a separately approved migration'; END IF;
    NEW.row_version:=1; NEW.alias_epoch:=0;
    NEW.application_modified_at:=NULL; NEW.application_modified_by:=NULL;
  ELSE
    IF NEW.id<>OLD.id OR NEW.is_application_native<>OLD.is_application_native OR NEW.is_staff<>OLD.is_staff THEN
      RAISE EXCEPTION 'Person identity and imported/native/internal classification are immutable';
    END IF;
    business_changed:=ROW(NEW.name_ar,NEW.name_en,NEW.email,NEW.is_active,NEW.is_trainee,NEW.team_id,NEW.alias_epoch)
      IS DISTINCT FROM ROW(OLD.name_ar,OLD.name_en,OLD.email,OLD.is_active,OLD.is_trainee,OLD.team_id,OLD.alias_epoch);
    IF NOT OLD.is_staff AND (business_changed OR NEW.can_login<>OLD.can_login) THEN
      RAISE EXCEPTION 'External people are outside the staff mutation boundary';
    END IF;
    IF NOT business_changed AND NEW.can_login=OLD.can_login THEN RETURN NULL; END IF;
    NEW.row_version:=OLD.row_version+1;
    NEW.application_modified_at:=OLD.application_modified_at;
    NEW.application_modified_by:=OLD.application_modified_by;
    IF business_changed AND session_user='litigation_runtime' THEN
      PERFORM _migration.staff_require_administrator();
      NEW.application_modified_at:=statement_timestamp();
      NEW.application_modified_by:=public.audit_current_actor_id();
    END IF;
    IF OLD.is_active AND NOT NEW.is_active THEN
      SELECT user_account_id INTO acting_account FROM public.audit_actors
        WHERE id=public.audit_current_actor_id() AND actor_kind='human';
      IF EXISTS(SELECT 1 FROM public.user_accounts WHERE id=acting_account AND person_id=OLD.id) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='An Administrator cannot deactivate their own staff identity';
      END IF;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.people p WHERE p.id<>NEW.id AND public.ar_normalise(p.name_ar)=NEW.name_ar_normalised)
     OR EXISTS(SELECT 1 FROM public.person_name_alias a WHERE a.person_id<>NEW.id AND NOT a.is_retired AND public.ar_normalise(a.alias_ar)=NEW.name_ar_normalised) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Normalized staff identity belongs to another person; merging and invented suffixes are prohibited';
  END IF;
  IF EXISTS(SELECT 1 FROM public.lookup_team WHERE reviewer_id=NEW.id)
     AND (NOT NEW.is_active OR NOT NEW.is_staff OR NEW.is_trainee) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Replace every assigned reviewer before changing reviewer eligibility';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_staff_person_guard BEFORE INSERT OR UPDATE OR DELETE ON public.people FOR EACH ROW EXECUTE FUNCTION _migration.staff_person_guard();
CREATE TRIGGER staff_person_no_truncate BEFORE TRUNCATE ON public.people FOR EACH STATEMENT EXECUTE FUNCTION _migration.staff_person_guard();

CREATE FUNCTION _migration.staff_alias_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE canonical text; staff boolean; imported boolean;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Aliases cannot be physically deleted'; END IF;
  IF session_user='litigation_runtime' THEN PERFORM _migration.staff_require_administrator(); END IF;
  SELECT name_ar,is_staff INTO STRICT canonical,staff FROM public.people WHERE id=NEW.person_id;
  IF NOT staff THEN RAISE EXCEPTION 'External aliases are outside the staff mutation boundary'; END IF;
  PERFORM _migration.staff_assert_text(NEW.alias_ar,256,true);
  PERFORM _migration.staff_assert_text(NEW.retirement_reason,2048,false);
  NEW.alias_ar_normalised:=public.ar_normalise(NEW.alias_ar);
  IF coalesce(NEW.alias_ar_normalised,'')='' THEN RAISE EXCEPTION 'An alias must not normalize to empty'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.person_id<>OLD.person_id OR NEW.alias_ar<>OLD.alias_ar THEN
      RAISE EXCEPTION 'Alias spelling and ownership are immutable';
    END IF;
    SELECT coalesce((SELECT is_imported FROM _migration.staff_roster_alias WHERE id=OLD.id),false) INTO imported;
    IF imported AND (NEW.is_retired OR NEW.retirement_reason IS DISTINCT FROM OLD.retirement_reason) THEN
      RAISE EXCEPTION 'Imported aliases can never be retired or rewritten';
    END IF;
    IF OLD.is_primary AND (NEW.is_retired OR (NOT NEW.is_primary AND OLD.alias_ar=canonical)) THEN
      RAISE EXCEPTION 'Primary demotion is allowed only in an atomic canonical rename';
    END IF;
    IF NEW.is_retired<>OLD.is_retired AND coalesce(NEW.retirement_reason,'')='' THEN
      RAISE EXCEPTION 'Alias retirement and restoration both require an audit reason';
    END IF;
    IF ROW(NEW.is_primary,NEW.is_retired,NEW.retirement_reason)=ROW(OLD.is_primary,OLD.is_retired,OLD.retirement_reason)
       OR (NEW.is_primary=OLD.is_primary AND NEW.is_retired=OLD.is_retired AND NEW.retirement_reason IS NOT DISTINCT FROM OLD.retirement_reason) THEN RETURN NULL; END IF;
  ELSIF NEW.is_retired THEN RAISE EXCEPTION 'New aliases must be active';
  END IF;
  IF NEW.is_primary AND (NEW.is_retired OR NEW.alias_ar<>canonical) THEN RAISE EXCEPTION 'Primary alias must match the canonical spelling exactly'; END IF;
  IF NOT NEW.is_retired AND (
    EXISTS(SELECT 1 FROM public.people p WHERE p.id<>NEW.person_id AND public.ar_normalise(p.name_ar)=NEW.alias_ar_normalised)
    OR EXISTS(SELECT 1 FROM public.person_name_alias a WHERE a.person_id<>NEW.person_id AND NOT a.is_retired AND public.ar_normalise(a.alias_ar)=NEW.alias_ar_normalised)
  ) THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Normalized alias belongs to another person'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_staff_alias_guard BEFORE INSERT OR UPDATE OR DELETE ON public.person_name_alias FOR EACH ROW EXECUTE FUNCTION _migration.staff_alias_guard();
CREATE TRIGGER staff_alias_no_truncate BEFORE TRUNCATE ON public.person_name_alias FOR EACH STATEMENT EXECUTE FUNCTION _migration.staff_alias_guard();

CREATE FUNCTION _migration.staff_primary_constraint() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.people p LEFT JOIN public.person_name_alias a ON a.person_id=p.id AND a.is_primary AND NOT a.is_retired
    GROUP BY p.id,p.name_ar HAVING count(a.id)<>1 OR bool_and(a.alias_ar=p.name_ar) IS NOT TRUE) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Every person must have exactly one active primary matching their canonical name at transaction completion';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER staff_people_primary_complete AFTER INSERT OR UPDATE ON public.people DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.staff_primary_constraint();
CREATE CONSTRAINT TRIGGER staff_alias_primary_complete AFTER INSERT OR UPDATE OR DELETE ON public.person_name_alias DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.staff_primary_constraint();

CREATE FUNCTION _migration.staff_alias_touch_person() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.people SET alias_epoch=alias_epoch+1 WHERE id=NEW.person_id;
  IF TG_OP='UPDATE' AND NEW.is_retired<>OLD.is_retired THEN
    PERFORM public.audit_append_semantic_event(CASE WHEN NEW.is_retired THEN 'archive' ELSE 'restore' END,
      'succeeded','public','person_name_alias',jsonb_build_object('id',NEW.id),NULL,NULL,NULL,'{}',NULL,'{}');
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER zz_staff_alias_touch AFTER INSERT OR UPDATE ON public.person_name_alias FOR EACH ROW EXECUTE FUNCTION _migration.staff_alias_touch_person();

CREATE FUNCTION _migration.staff_team_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'The two team identities are fixed'; END IF;
  IF session_user='litigation_runtime' THEN PERFORM _migration.staff_require_administrator(); END IF;
  IF ROW(NEW.id,NEW.code,NEW.label_ar,NEW.specialisms,NEW.sort_order,NEW.is_active)
       IS DISTINCT FROM ROW(OLD.id,OLD.code,OLD.label_ar,OLD.specialisms,OLD.sort_order,OLD.is_active) THEN
    RAISE EXCEPTION 'Team identity, naming and active state are fixed';
  END IF;
  IF NEW.reviewer_id IS NOT DISTINCT FROM OLD.reviewer_id THEN RETURN NULL; END IF;
  IF NEW.reviewer_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.people WHERE id=NEW.reviewer_id AND is_staff AND is_active AND NOT is_trainee) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Team reviewer must be active internal non-trainee staff';
  END IF;
  NEW.row_version:=OLD.row_version+1; RETURN NEW;
END;
$$;
CREATE TRIGGER zz_staff_team_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lookup_team FOR EACH ROW EXECUTE FUNCTION _migration.staff_team_guard();
CREATE TRIGGER staff_team_no_truncate BEFORE TRUNCATE ON public.lookup_team FOR EACH STATEMENT EXECUTE FUNCTION _migration.staff_team_guard();

CREATE FUNCTION _migration.staff_account_eligibility() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.is_enabled AND NOT EXISTS(SELECT 1 FROM public.people WHERE id=NEW.person_id AND is_staff AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='An enabled account requires an active internal person';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_staff_account_eligibility BEFORE INSERT OR UPDATE OF is_enabled ON public.user_accounts FOR EACH ROW EXECUTE FUNCTION _migration.staff_account_eligibility();

-- Preserve the original function body and trigger surface. Only its execution
-- privilege changes: /users may still update this derived field after direct
-- roster UPDATE is revoked. There is no callable row-writing argument path.
ALTER FUNCTION public.sync_user_account_person_login() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.sync_user_account_person_login() FROM PUBLIC,litigation_runtime;

CREATE FUNCTION _migration.staff_person_lifecycle() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE account_id integer;
BEGIN
  IF NEW.is_active=OLD.is_active THEN RETURN NULL; END IF;
  IF NOT NEW.is_active THEN
    UPDATE public.user_accounts SET is_enabled=false,failed_login_attempts=0,locked_until=NULL,session_version=session_version+1
      WHERE person_id=NEW.id RETURNING id INTO account_id;
    IF account_id IS NOT NULL THEN
      PERFORM public.audit_append_semantic_event_for_account('account_disabled','succeeded','public','user_accounts',jsonb_build_object('id',account_id),account_id,NULL,NULL,'{}',NULL,'{}');
    END IF;
  END IF;
  PERFORM public.audit_append_semantic_event(CASE WHEN NEW.is_active THEN 'restore' ELSE 'archive' END,
    'succeeded','public','people',jsonb_build_object('id',NEW.id),NULL,NULL,NULL,'{}',NULL,'{}');
  RETURN NULL;
END;
$$;
CREATE TRIGGER zz_staff_person_lifecycle AFTER UPDATE OF is_active ON public.people FOR EACH ROW EXECUTE FUNCTION _migration.staff_person_lifecycle();

CREATE FUNCTION _migration.staff_lock_person(p_person_id integer,p_expected_version bigint) RETURNS public.people
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE person public.people%ROWTYPE;
BEGIN
  PERFORM _migration.staff_require_administrator();
  SELECT * INTO person FROM public.people WHERE id=p_person_id FOR UPDATE;
  IF NOT FOUND OR NOT person.is_staff THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Existing internal staff identity required'; END IF;
  IF p_expected_version IS NULL OR person.row_version<>p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Staff row version is stale';
  END IF;
  RETURN person;
END;
$$;

CREATE FUNCTION public.staff_create_person(p_name_ar text,p_name_en text,p_email text,p_is_trainee boolean,p_team_id smallint) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE person_id integer;
BEGIN
  PERFORM _migration.staff_require_administrator();
  INSERT INTO public.people(name_ar,name_en,email,is_staff,is_active,is_trainee,is_application_native,team_id,updated_at)
    VALUES(p_name_ar,p_name_en,p_email,true,true,p_is_trainee,true,p_team_id,statement_timestamp()) RETURNING id INTO person_id;
  INSERT INTO public.person_name_alias(person_id,alias_ar,is_primary) VALUES(person_id,p_name_ar,true);
  RETURN person_id;
END;
$$;

CREATE FUNCTION public.staff_update_person(p_person_id integer,p_expected_version bigint,p_name_en text,p_email text,p_is_active boolean,p_is_trainee boolean,p_team_id smallint) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM _migration.staff_lock_person(p_person_id,p_expected_version);
  UPDATE public.people SET name_en=p_name_en,email=p_email,is_active=p_is_active,is_trainee=p_is_trainee,team_id=p_team_id WHERE id=p_person_id;
  RETURN (SELECT row_version FROM public.people WHERE id=p_person_id);
END;
$$;

CREATE FUNCTION public.staff_rename_person(p_person_id integer,p_expected_version bigint,p_name_ar text) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE person public.people%ROWTYPE; existing_alias public.person_name_alias%ROWTYPE;
BEGIN
  person:=_migration.staff_lock_person(p_person_id,p_expected_version);
  IF person.name_ar=p_name_ar THEN RETURN person.row_version; END IF;
  IF EXISTS(SELECT 1 FROM public.person_name_alias WHERE alias_ar=p_name_ar AND (person_id<>p_person_id OR is_retired)) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Canonical target is ambiguous or retired; explicit alias restoration is required';
  END IF;
  UPDATE public.people SET name_ar=p_name_ar WHERE id=p_person_id;
  UPDATE public.person_name_alias SET is_primary=false WHERE person_id=p_person_id AND is_primary;
  SELECT * INTO existing_alias FROM public.person_name_alias WHERE person_id=p_person_id AND alias_ar=p_name_ar;
  IF FOUND THEN UPDATE public.person_name_alias SET is_primary=true WHERE id=existing_alias.id;
  ELSE INSERT INTO public.person_name_alias(person_id,alias_ar,is_primary) VALUES(p_person_id,p_name_ar,true);
  END IF;
  RETURN (SELECT row_version FROM public.people WHERE id=p_person_id);
END;
$$;

CREATE FUNCTION public.staff_add_alias(p_person_id integer,p_expected_version bigint,p_alias_ar text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE alias_id integer;
BEGIN
  PERFORM _migration.staff_lock_person(p_person_id,p_expected_version);
  INSERT INTO public.person_name_alias(person_id,alias_ar,is_primary) VALUES(p_person_id,p_alias_ar,false) RETURNING id INTO alias_id;
  RETURN alias_id;
END;
$$;

CREATE FUNCTION public.staff_set_alias_retired(p_person_id integer,p_expected_version bigint,p_alias_id integer,p_retired boolean,p_reason text) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE alias public.person_name_alias%ROWTYPE;
BEGIN
  PERFORM _migration.staff_lock_person(p_person_id,p_expected_version);
  PERFORM _migration.staff_assert_text(p_reason,2048,true);
  SELECT * INTO alias FROM public.person_name_alias WHERE id=p_alias_id AND person_id=p_person_id FOR UPDATE;
  IF NOT FOUND OR alias.is_primary OR EXISTS(SELECT 1 FROM _migration.staff_roster_alias WHERE id=p_alias_id AND is_imported) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='An application-created non-primary alias is required';
  END IF;
  IF p_retired IS NULL THEN RAISE EXCEPTION 'Explicit alias lifecycle state required'; END IF;
  IF alias.is_retired<>p_retired THEN
    UPDATE public.person_name_alias SET is_retired=p_retired,retirement_reason=p_reason WHERE id=p_alias_id;
  END IF;
  RETURN (SELECT row_version FROM public.people WHERE id=p_person_id);
END;
$$;

CREATE FUNCTION public.staff_set_team_reviewer(p_team_id smallint,p_expected_version bigint,p_reviewer_id integer) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE version bigint;
BEGIN
  PERFORM _migration.staff_require_administrator();
  SELECT row_version INTO version FROM public.lookup_team WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'One of the two fixed team identities is required'; END IF;
  IF p_expected_version IS NULL OR version<>p_expected_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Team row version is stale'; END IF;
  UPDATE public.lookup_team SET reviewer_id=p_reviewer_id WHERE id=p_team_id;
  RETURN (SELECT row_version FROM public.lookup_team WHERE id=p_team_id);
END;
$$;

-- Full-row continuity is separate from immutable imported evidence. Every
-- changed roster row must link to the structural event created in that same
-- statement. This detects unaudited edits even when a fixture temporarily
-- disables and then restores the ordinary table guards.
CREATE TABLE _migration.staff_roster_change (
  entity_table text NOT NULL CHECK(entity_table IN ('people','person_name_alias','lookup_team')),
  entity_id integer NOT NULL,
  revision bigint NOT NULL CHECK(revision>0),
  row_value jsonb NOT NULL,
  row_sha256 text NOT NULL CHECK(row_sha256 ~ '^[a-f0-9]{64}$'),
  audit_event_id bigint NOT NULL UNIQUE REFERENCES public.audit_events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  event_sha256 text NOT NULL CHECK(event_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(entity_table,entity_id,revision)
);
CREATE TRIGGER staff_change_no_change BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.staff_roster_change FOR EACH STATEMENT EXECUTE FUNCTION _migration.refuse_staff_evidence_change();
REVOKE ALL ON _migration.staff_roster_change FROM PUBLIC,litigation_runtime;
CREATE FUNCTION _migration.staff_record_change() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE event public.audit_events%ROWTYPE; revision_number bigint; value jsonb:=_migration.staff_json_row(NEW);
BEGIN
  IF TG_TABLE_NAME='person_name_alias' THEN
    SELECT coalesce(max(revision),0)+1 INTO revision_number FROM _migration.staff_roster_change WHERE entity_table=TG_TABLE_NAME AND entity_id=NEW.id;
  ELSE revision_number:=(value->>'row_version')::bigint;
  END IF;
  SELECT * INTO event FROM public.audit_events
    WHERE entity_schema='public' AND entity_table=TG_TABLE_NAME AND entity_key=jsonb_build_object('id',NEW.id)
      AND action IN ('record_created','record_updated')
      AND id>(SELECT last_prior_event_id FROM _migration.staff_roster_boundary)
      AND (TG_TABLE_NAME='person_name_alias' OR after_values->>'row_version'=revision_number::text)
    ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Roster mutation has no corresponding structural audit event'; END IF;
  INSERT INTO _migration.staff_roster_change VALUES(TG_TABLE_NAME,NEW.id,revision_number,value,
    encode(sha256(convert_to(value::text,'UTF8')),'hex'),event.id,
    encode(sha256(convert_to(_migration.staff_json_row(event)::text,'UTF8')),'hex'));
  RETURN NULL;
END;
$$;
CREATE TRIGGER zzzz_staff_record_change AFTER INSERT OR UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION _migration.staff_record_change();
CREATE TRIGGER zzzz_staff_record_change AFTER INSERT OR UPDATE ON public.person_name_alias FOR EACH ROW EXECUTE FUNCTION _migration.staff_record_change();
CREATE TRIGGER zzzz_staff_record_change AFTER INSERT OR UPDATE ON public.lookup_team FOR EACH ROW EXECUTE FUNCTION _migration.staff_record_change();

-- Physical deletion and ordinary table writes are denied even before a row
-- trigger can run. Sequence access cannot be used to allocate fake identities.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.people,public.person_name_alias,public.lookup_team FROM PUBLIC,litigation_runtime;
REVOKE ALL ON SEQUENCE public.people_id_seq,public.person_name_alias_id_seq,public.lookup_team_id_seq FROM PUBLIC,litigation_runtime;
DO $execution_boundary$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='_migration' AND (p.proname LIKE 'staff_%' OR p.proname IN ('lock_staff_roster','refuse_staff_evidence_change')))
       OR (n.nspname='public' AND p.proname LIKE 'staff_%') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',fn.signature);
    IF fn.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO litigation_runtime',fn.signature); END IF;
  END LOOP;
END
$execution_boundary$;

DO $preservation$
BEGIN
  IF EXISTS(SELECT 1 FROM _migration.staff_roster_person s FULL JOIN public.people p ON p.id=s.id
    WHERE s.id IS NULL OR p.id IS NULL OR to_jsonb(s) IS DISTINCT FROM to_jsonb(p)-ARRAY['row_version','alias_epoch','application_modified_at','application_modified_by'])
    OR EXISTS(SELECT 1 FROM _migration.staff_roster_alias s FULL JOIN public.person_name_alias a ON a.id=s.id
    WHERE s.id IS NULL OR a.id IS NULL OR to_jsonb(s)-'is_imported' IS DISTINCT FROM to_jsonb(a)-ARRAY['is_retired','retirement_reason'])
    OR EXISTS(SELECT 1 FROM _migration.staff_roster_team s FULL JOIN public.lookup_team t ON t.id=s.id
    WHERE s.id IS NULL OR t.id IS NULL OR to_jsonb(s) IS DISTINCT FROM to_jsonb(t)-'row_version') THEN
    RAISE EXCEPTION 'Migration changed existing roster values or timestamps';
  END IF;
END
$preservation$;

COMMIT;
