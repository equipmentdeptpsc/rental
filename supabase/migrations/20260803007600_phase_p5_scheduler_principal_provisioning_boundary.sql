BEGIN;
SET search_path=erp,pg_catalog;

CREATE FUNCTION erp.provision_grouped_review_scheduler_principal(target_company_id text,confirmation text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path=erp,pg_catalog
AS $$
DECLARE
  database_owner name;
  target_company erp.companies;
  principal erp.system_principals;
  principal_changed boolean:=false;
  permission_inserted integer:=0;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner
  FROM pg_database WHERE datname=current_database();

  IF session_user<>database_owner OR current_user<>database_owner THEN
    RAISE EXCEPTION 'database-owner session required' USING ERRCODE='42501';
  END IF;
  IF target_company_id IS NULL OR target_company_id<>btrim(target_company_id) OR target_company_id='' THEN
    RAISE EXCEPTION 'exact company identity required' USING ERRCODE='22023';
  END IF;
  IF target_company_id='TENANT-LOCAL-001' OR target_company_id LIKE 'TENANT-UAT-%' THEN
    RAISE EXCEPTION 'company is outside production provisioning boundary' USING ERRCODE='42501';
  END IF;
  IF confirmation IS DISTINCT FROM 'CONFIRM-P5-GROUPED-REVIEW-SCHEDULER:'||target_company_id THEN
    RAISE EXCEPTION 'tenant-bound provisioning confirmation required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO target_company FROM erp.companies
  WHERE id=target_company_id FOR UPDATE;
  IF target_company.id IS NULL THEN
    RAISE EXCEPTION 'existing company required' USING ERRCODE='23503';
  END IF;
  IF NOT target_company.active OR target_company.environment_class<>'approved' THEN
    RAISE EXCEPTION 'active approved company required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO principal FROM erp.system_principals
  WHERE company_id=target_company_id AND principal_type='GROUPED_REVIEW_SCHEDULER'
  FOR UPDATE;

  IF principal.id IS NULL THEN
    INSERT INTO erp.system_principals(company_id,principal_type,display_name,active)
    VALUES(target_company_id,'GROUPED_REVIEW_SCHEDULER','Grouped Review Scheduler',true)
    RETURNING * INTO principal;
    principal_changed:=true;
  ELSIF NOT principal.active THEN
    UPDATE erp.system_principals
    SET active=true,updated_at=clock_timestamp()
    WHERE id=principal.id
    RETURNING * INTO principal;
    principal_changed:=true;
  END IF;

  INSERT INTO erp.system_principal_permissions(principal_id,permission_code)
  VALUES(principal.id,'grouped_review.schedule')
  ON CONFLICT(principal_id,permission_code) DO NOTHING;
  GET DIAGNOSTICS permission_inserted=ROW_COUNT;

  IF (SELECT count(*) FROM erp.system_principals
      WHERE company_id=target_company_id AND principal_type='GROUPED_REVIEW_SCHEDULER')<>1
     OR (SELECT count(*) FROM erp.system_principal_permissions
         WHERE principal_id=principal.id AND permission_code='grouped_review.schedule')<>1
     OR EXISTS(SELECT 1 FROM erp.system_principal_permissions
               WHERE principal_id=principal.id AND permission_code<>'grouped_review.schedule') THEN
    RAISE EXCEPTION 'scheduler principal postcondition failed' USING ERRCODE='55000';
  END IF;

  IF principal_changed OR permission_inserted=1 THEN
    INSERT INTO erp.audit_log(
      id,company_id,aggregate_type,aggregate_id,action,actor_id,actor_name,
      occurred_at,correlation_id,new_values
    ) VALUES(
      extensions.gen_random_uuid()::text,target_company_id,'SYSTEM_PRINCIPAL',principal.id::text,
      'GROUPED_REVIEW_SCHEDULER_PRINCIPAL_PROVISIONED',principal.id::text,principal.display_name,
      clock_timestamp(),confirmation,
      jsonb_build_object(
        'actorType','SYSTEM','principalType','GROUPED_REVIEW_SCHEDULER',
        'permissionCode','grouped_review.schedule','provisioningAuthority','DATABASE_OWNER',
        'active',true
      )
    );
  END IF;

  RETURN principal.id;
END;
$$;

ALTER FUNCTION erp.provision_grouped_review_scheduler_principal(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.provision_grouped_review_scheduler_principal(text,text)
FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON FUNCTION erp.provision_grouped_review_scheduler_principal(text,text) IS
'Owner-session-only provisioning for one least-privileged grouped-review scheduler system principal on an existing active approved company. Does not configure or enable automation.';

COMMIT;
