BEGIN;
SET search_path=erp,auth,pg_catalog;

DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
 IF position('IF requested_date<local_today OR requested_date>local_today+1 THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_BUSINESS_DATE''); END IF;' IN definition)=0
   OR (length(definition)-length(replace(definition,'WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL;','')))/length('WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL;')<>2
 THEN RAISE EXCEPTION 'canonical grouped-review scheduler business-date correction did not match the authoritative definition' USING ERRCODE='55000'; END IF;
 definition:=replace(definition,
   'IF requested_date<local_today OR requested_date>local_today+1 THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_BUSINESS_DATE''); END IF;',
   'IF (coalesce(current_setting(''erp.scheduler_preparation'',true),'''')<>''true'' AND (requested_date<local_today OR requested_date>local_today+1)) OR (current_setting(''erp.scheduler_preparation'',true)=''true'' AND requested_date>local_today+1) THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_BUSINESS_DATE''); END IF;');
 definition:=replace(definition,
   'WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL;',
   'WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL AND work_date=requested_date;');
 IF definition NOT LIKE '%current_setting(''erp.scheduler_preparation'',true)%'
   OR (length(definition)-length(replace(definition,'AND work_date=requested_date;','')))/length('AND work_date=requested_date;')<2
 THEN RAISE EXCEPTION 'canonical grouped-review scheduler business-date replacement verification failed' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
END $$;

ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_generate_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated;
COMMIT;
