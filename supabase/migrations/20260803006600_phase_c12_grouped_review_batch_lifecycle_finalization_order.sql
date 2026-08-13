BEGIN;
SET search_path=erp,pg_catalog;
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('erp.command_supersede_customer_review_batch(jsonb)'::regprocedure) INTO definition;
  definition:=replace(definition,'summary_snapshot,finalized_at)','summary_snapshot)');
  definition:=replace(definition,'source.summary_snapshot,now_at) RETURNING * INTO successor;','source.summary_snapshot) RETURNING * INTO successor;');
  definition:=replace(definition,
    'FROM erp.customer_review_batch_items WHERE batch_id=source.id;',
    'FROM erp.customer_review_batch_items WHERE batch_id=source.id;
  UPDATE erp.customer_review_batches SET finalized_at=now_at WHERE id=successor.id RETURNING * INTO successor;');
  IF definition NOT LIKE '%UPDATE erp.customer_review_batches SET finalized_at=now_at WHERE id=successor.id%'
    OR definition LIKE '%summary_snapshot,finalized_at)%' THEN RAISE EXCEPTION '06600 lifecycle finalization correction did not match 06500' USING ERRCODE='55000'; END IF;
  EXECUTE definition;
END $$;
ALTER FUNCTION erp.command_supersede_customer_review_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_supersede_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_supersede_customer_review_batch(jsonb) TO authenticated;
COMMIT;
