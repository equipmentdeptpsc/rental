BEGIN;
SET search_path TO erp, pg_catalog;

CREATE OR REPLACE FUNCTION reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name; target_company text; row_data jsonb=to_jsonb(OLD);
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  target_company=row_data->>'company_id';
  IF target_company IS NULL AND TG_TABLE_NAME='commercial_snapshots' THEN
    SELECT company_id INTO target_company FROM rentals WHERE id=row_data->>'rental_id';
  ELSIF target_company IS NULL AND TG_TABLE_NAME='deur_activity_logs' THEN
    SELECT company_id INTO target_company FROM deurs WHERE id=row_data->>'deur_id';
  ELSIF target_company IS NULL AND TG_TABLE_NAME='equipment_history' THEN
    SELECT company_id INTO target_company FROM equipment WHERE id=row_data->>'equipment_id';
  END IF;
  IF TG_OP='DELETE'
     AND TG_TABLE_SCHEMA='erp'
     AND TG_TABLE_NAME IN('commercial_snapshots','deur_activity_logs','deur_review_history','equipment_history','audit_log','recovery_compensations')
     AND session_user=database_owner AND current_user=database_owner
     AND current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001'
     AND target_company='TENANT-UAT-C7-RELEASE-001' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'immutable historical record cannot be changed' USING ERRCODE='55000';
END $$;
ALTER FUNCTION reject_immutable_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION reject_immutable_change() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION reject_customer_review_evidence_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner
     AND current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001'
     AND OLD.company_id='TENANT-UAT-C7-RELEASE-001' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'customer review evidence is immutable' USING ERRCODE='55000';
END $$;
ALTER FUNCTION reject_customer_review_evidence_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION reject_customer_review_evidence_change() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION reject_manager_review_outcome_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner
     AND current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001'
     AND OLD.company_id='TENANT-UAT-C7-RELEASE-001' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'manager review evidence is immutable' USING ERRCODE='55000';
END $$;
ALTER FUNCTION reject_manager_review_outcome_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION reject_manager_review_outcome_change() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION reject_terminal_notification_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner
     AND current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001'
     AND OLD.company_id='TENANT-UAT-C7-RELEASE-001' THEN RETURN OLD; END IF;
  IF OLD.status='ProviderAccepted' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'provider-accepted notification evidence is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION reject_terminal_notification_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION reject_terminal_notification_change() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION protect_statement_line() RETURNS trigger
LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE state billing_approval_status; database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner
     AND current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001'
     AND OLD.company_id='TENANT-UAT-C7-RELEASE-001' THEN RETURN OLD; END IF;
  SELECT approval_status INTO state FROM billing_statements WHERE id=coalesce(OLD.billing_statement_id,NEW.billing_statement_id);
  IF state<>'Draft' THEN RAISE EXCEPTION 'non-draft billing evidence is immutable' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION protect_statement_line() OWNER TO postgres;
REVOKE ALL ON FUNCTION protect_statement_line() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
