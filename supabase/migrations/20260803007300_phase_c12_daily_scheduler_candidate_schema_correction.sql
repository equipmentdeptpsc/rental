BEGIN;
SET search_path=erp,pg_catalog;
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('erp.command_run_daily_grouped_customer_reviews(jsonb)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,'r.deleted_at IS NULL','')))/length('r.deleted_at IS NULL')<>3
 THEN RAISE EXCEPTION '07300 expected exactly three invalid Rental deleted_at predicates' USING ERRCODE='55000';END IF;
 definition:=replace(definition,'r.deleted_at IS NULL','r.status IN(''Released'',''Active'')');
 IF definition LIKE '%r.deleted_at%'
  OR definition NOT LIKE '%r.status IN(''Released'',''Active'')%'
  OR definition NOT LIKE '%l.deleted_at IS NULL%'
  OR definition NOT LIKE '%v_command_id%'
 THEN RAISE EXCEPTION '07300 Rental candidate schema correction did not match installed 07200 function' USING ERRCODE='55000';END IF;
 EXECUTE definition;
END $$;
ALTER FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) TO service_role;
COMMENT ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) IS 'Service-only canonical Rental/date discovery over Released or Active Rentals and non-deleted Rental lines; identifiers and safe failure codes only are returned.';
COMMIT;
