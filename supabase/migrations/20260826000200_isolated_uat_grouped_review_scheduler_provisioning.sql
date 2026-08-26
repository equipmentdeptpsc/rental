BEGIN;
SET search_path=erp,pg_catalog;

CREATE FUNCTION erp.provision_isolated_uat_grouped_review_scheduler(
  target_company_id text,
  requested_local_send_time time without time zone,
  requested_grace_minutes integer,
  confirmation text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=erp,pg_catalog
AS $$
DECLARE
  database_owner name;
  target_company erp.companies;
  configuration_actor uuid;
  principal erp.system_principals;
  existing_configuration erp.grouped_review_scheduler_configurations;
  principal_changed boolean:=false;
  permission_inserted integer:=0;
  configuration_changed boolean:=false;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF session_user<>database_owner OR current_user<>database_owner THEN
    RAISE EXCEPTION 'database-owner session required' USING ERRCODE='42501';
  END IF;
  IF target_company_id IS DISTINCT FROM 'TENANT-LOCAL-001'
    OR confirmation IS DISTINCT FROM 'CONFIRM-ISOLATED-UAT-GROUPED-REVIEW-SCHEDULER:TENANT-LOCAL-001'
  THEN RAISE EXCEPTION 'exact isolated-UAT tenant confirmation required' USING ERRCODE='42501'; END IF;
  IF requested_local_send_time IS NULL OR requested_grace_minutes NOT BETWEEN 15 AND 180
    OR extract(epoch FROM requested_local_send_time)+requested_grace_minutes*60>=86400
  THEN RAISE EXCEPTION 'valid same-day scheduler window required' USING ERRCODE='22023'; END IF;

  SELECT * INTO target_company FROM erp.companies WHERE id=target_company_id FOR UPDATE;
  IF target_company.id IS NULL OR NOT target_company.active OR target_company.code<>'LOCAL'
    OR target_company.environment_class<>'compatibility'
  THEN RAISE EXCEPTION 'active isolated-UAT compatibility tenant required' USING ERRCODE='42501'; END IF;

  SELECT u.id INTO configuration_actor
  FROM erp.users u
  WHERE u.company_id=target_company_id AND u.status='active'
    AND EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=u.id AND p.permission_code='settings.update')
  ORDER BY u.created_at,u.id LIMIT 1;
  IF configuration_actor IS NULL OR (SELECT count(*) FROM erp.users u WHERE u.company_id=target_company_id AND u.status='active'
    AND EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=u.id AND p.permission_code='settings.update'))<>1
  THEN RAISE EXCEPTION 'exactly one active settings administrator required' USING ERRCODE='55000'; END IF;

  SELECT * INTO principal FROM erp.system_principals
  WHERE company_id=target_company_id AND principal_type='GROUPED_REVIEW_SCHEDULER' FOR UPDATE;
  IF principal.id IS NULL THEN
    INSERT INTO erp.system_principals(company_id,principal_type,display_name,active)
    VALUES(target_company_id,'GROUPED_REVIEW_SCHEDULER','Grouped Review Scheduler',true) RETURNING * INTO principal;
    principal_changed:=true;
  ELSIF NOT principal.active THEN
    UPDATE erp.system_principals SET active=true,updated_at=clock_timestamp() WHERE id=principal.id RETURNING * INTO principal;
    principal_changed:=true;
  END IF;
  INSERT INTO erp.system_principal_permissions(principal_id,permission_code)
  VALUES(principal.id,'grouped_review.schedule') ON CONFLICT(principal_id,permission_code) DO NOTHING;
  GET DIAGNOSTICS permission_inserted=ROW_COUNT;
  IF EXISTS(SELECT 1 FROM erp.system_principal_permissions WHERE principal_id=principal.id AND permission_code<>'grouped_review.schedule')
  THEN RAISE EXCEPTION 'scheduler principal excess authority rejected' USING ERRCODE='55000'; END IF;

  SELECT * INTO existing_configuration FROM erp.grouped_review_scheduler_configurations WHERE company_id=target_company_id FOR UPDATE;
  configuration_changed:=existing_configuration.company_id IS NULL OR NOT existing_configuration.automation_enabled
    OR existing_configuration.local_send_time IS DISTINCT FROM requested_local_send_time
    OR existing_configuration.grace_minutes IS DISTINCT FROM requested_grace_minutes;
  IF configuration_changed THEN
    INSERT INTO erp.grouped_review_scheduler_configurations(company_id,automation_enabled,local_send_time,grace_minutes,configured_by,row_version)
    VALUES(target_company_id,true,requested_local_send_time,requested_grace_minutes,configuration_actor,coalesce(existing_configuration.row_version,0)+1)
    ON CONFLICT(company_id) DO UPDATE SET automation_enabled=true,local_send_time=excluded.local_send_time,
      grace_minutes=excluded.grace_minutes,configured_by=excluded.configured_by,updated_at=clock_timestamp(),row_version=excluded.row_version;
  END IF;

  IF principal_changed OR permission_inserted=1 OR configuration_changed THEN
    INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,actor_name,occurred_at,correlation_id,new_values)
    VALUES(extensions.gen_random_uuid()::text,target_company_id,'GROUPED_REVIEW_SCHEDULER_CONFIGURATION',target_company_id,
      'ISOLATED_UAT_GROUPED_REVIEW_SCHEDULER_PROVISIONED',configuration_actor::text,'Isolated UAT Administrator',clock_timestamp(),confirmation,
      jsonb_build_object('principalId',principal.id,'principalType','GROUPED_REVIEW_SCHEDULER','permissionCode','grouped_review.schedule',
        'automationEnabled',true,'localSendTime',to_char(requested_local_send_time,'HH24:MI'),'graceMinutes',requested_grace_minutes,
        'provisioningAuthority','DATABASE_OWNER','environmentClass','compatibility'));
  END IF;
  RETURN jsonb_build_object('success',true,'disposition',CASE WHEN principal_changed OR permission_inserted=1 OR configuration_changed THEN 'ACCEPTED' ELSE 'REPLAYED' END,
    'value',jsonb_build_object('companyId',target_company_id,'principalId',principal.id,'principalType',principal.principal_type,
      'permissionCode','grouped_review.schedule','automationEnabled',true,'localSendTime',to_char(requested_local_send_time,'HH24:MI'),
      'graceMinutes',requested_grace_minutes,'configuredBy',configuration_actor));
END;
$$;

ALTER FUNCTION erp.provision_isolated_uat_grouped_review_scheduler(text,time without time zone,integer,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.provision_isolated_uat_grouped_review_scheduler(text,time without time zone,integer,text)
FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION erp.provision_isolated_uat_grouped_review_scheduler(text,time without time zone,integer,text) IS
'Owner-session-only, configuration-driven provisioning for the exact isolated-UAT compatibility tenant. Production provisioning restrictions remain unchanged.';
COMMIT;
