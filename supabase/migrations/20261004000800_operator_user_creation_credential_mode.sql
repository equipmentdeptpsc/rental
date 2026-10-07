BEGIN;
SET LOCAL search_path = erp, pg_catalog;

ALTER FUNCTION erp.command_provision_application_user(jsonb) RENAME TO command_provision_application_user_legacy;

CREATE FUNCTION erp.command_provision_application_user(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = erp, pg_catalog AS $$
DECLARE response jsonb; tenant text = command->>'companyId'; target uuid;
BEGIN
  IF coalesce(command->'roleCodes','[]'::jsonb) ? 'operator' AND nullif(trim(command->>'operatorId'),'') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','OPERATOR_REQUIRED','message','Select the operator account this user should be linked to.');
  END IF;
  response := erp.command_provision_application_user_legacy(command);
  IF response->>'success' <> 'true' OR NOT (coalesce(command->'roleCodes','[]'::jsonb) ? 'operator') THEN RETURN response; END IF;
  target := nullif(response->'value'->>'id','')::uuid;
  UPDATE erp.users SET credential_mode = 'OPERATOR_PIN', updated_at = clock_timestamp(), row_version = row_version + 1
  WHERE id = target AND company_id = tenant AND status = 'active' AND operator_id IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_NOT_AVAILABLE','message','The selected Operator is not available.'); END IF;
  RETURN response;
END $$;

REVOKE ALL ON FUNCTION erp.command_provision_application_user_legacy(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION erp.command_provision_application_user(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION erp.command_provision_application_user(jsonb) TO service_role;
COMMIT;
