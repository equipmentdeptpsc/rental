BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.configure_uat_single_billing_fixture_customer_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); scenario_key text:=trim(command->>'scenarioKey'); rental_id text:=trim(command->>'rentalId'); customer_id text:=trim(command->>'customerId'); actor_id text:=trim(command->>'actorId');
  representative_name text:=btrim(command->>'representativeName'); representative_email text:=lower(btrim(command->>'representativeEmail')); target erp.rentals; scenario_row erp.uat_single_billing_fixture_scenarios;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR scenario_key<>'BILLING_SINGLE_RENTAL_V1' OR nullif(rental_id,'') IS NULL OR nullif(customer_id,'') IS NULL OR nullif(actor_id,'') IS NULL
     OR length(representative_name) NOT BETWEEN 1 AND 200 OR representative_name~'[\r\n]'
     OR representative_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO scenario_row FROM erp.uat_single_billing_fixture_scenarios WHERE company_id=tenant AND scenario_key=scenario_key FOR SHARE;
  IF scenario_row.scenario_key IS NULL OR scenario_row.state<>'PROVISIONING' OR scenario_row.scenario->>'rentalId'<>rental_id THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;
  SELECT * INTO target FROM erp.rentals WHERE company_id=tenant AND id=rental_id FOR UPDATE;
  IF target.id IS NULL OR target.customer_id<>customer_id OR target.status::text NOT IN('Released','Active','Returned') THEN RETURN jsonb_build_object('success',false,'code','FIXTURE_RELATIONSHIP_INVALID'); END IF;
  UPDATE erp.rentals SET timezone='Asia/Manila',customer_review_name_snapshot=representative_name,customer_review_email_snapshot=representative_email,customer_review_contact_captured_at=coalesce(customer_review_contact_captured_at,clock_timestamp()),updated_at=clock_timestamp(),updated_by=actor_id WHERE id=target.id;
  RETURN jsonb_build_object('success',true,'disposition','ACCEPTED','rentalId',target.id,'timezone','Asia/Manila');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'code','HELPER_ERROR','sqlstate',SQLSTATE);
END $$;

ALTER FUNCTION erp.configure_uat_single_billing_fixture_customer_review(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.configure_uat_single_billing_fixture_customer_review(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.configure_uat_single_billing_fixture_customer_review(jsonb) TO service_role;
COMMIT;
