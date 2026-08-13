BEGIN;
SET search_path=erp,pg_catalog;
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('erp.command_run_daily_grouped_customer_reviews(jsonb)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,'command_run_daily_grouped_customer_reviews.command_id','')))/length('command_run_daily_grouped_customer_reviews.command_id')<>2
 THEN RAISE EXCEPTION '07200 expected exactly two invalid command variable qualifications' USING ERRCODE='55000';END IF;
 definition:=replace(definition,'run_at timestamptz;command_id uuid;','run_at timestamptz;v_command_id uuid;');
 definition:=replace(definition,'command_id=(command->>''commandId'')::uuid;','v_command_id=(command->>''commandId'')::uuid;');
 definition:=replace(definition,'command_run_daily_grouped_customer_reviews.command_id','v_command_id');
 definition:=replace(definition,'SELECT command_id,idem,e.company_id','SELECT v_command_id,idem,e.company_id');
 definition:=replace(definition,'''runId'',command_id,','''runId'',v_command_id,');
 IF definition LIKE '%command_run_daily_grouped_customer_reviews.command_id%'
  OR definition NOT LIKE '%v_command_id uuid%'
  OR definition NOT LIKE '%g.command_id=v_command_id%'
  OR definition NOT LIKE '%SELECT v_command_id,idem,e.company_id%'
  OR definition NOT LIKE '%''runId'',v_command_id%'
 THEN RAISE EXCEPTION '07200 command variable correction did not match installed 07000 function' USING ERRCODE='55000';END IF;
 EXECUTE definition;
END $$;
ALTER FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) TO service_role;
COMMENT ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) IS 'Service-only canonical Rental/date discovery. The local command identity is explicitly named v_command_id; identifiers and safe failure codes only are returned.';
COMMIT;
