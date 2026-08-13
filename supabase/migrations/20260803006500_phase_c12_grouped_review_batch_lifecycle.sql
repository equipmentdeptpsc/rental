BEGIN;
SET search_path=erp,auth,pg_catalog;

ALTER TABLE erp.customer_review_batches DROP CONSTRAINT customer_review_batches_superseded_by_fk;
ALTER TABLE erp.customer_review_batches ADD CONSTRAINT customer_review_batches_superseded_by_fk
  FOREIGN KEY(superseded_by_batch_id) REFERENCES erp.customer_review_batches(id)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE FUNCTION erp.command_supersede_customer_review_batch(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); source erp.customer_review_batches; successor erp.customer_review_batches;
  successor_id uuid=extensions.gen_random_uuid(); raw_credential text; now_at timestamptz=clock_timestamp();
BEGIN
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('deur.review') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('sourceBatchId','commandId','idempotencyKey'))
    OR coalesce(command->>'sourceBatchId','') !~ '^[0-9a-f-]{36}$' OR nullif(command->>'commandId','') IS NULL OR nullif(command->>'idempotencyKey','') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO source FROM erp.customer_review_batches WHERE id=(command->>'sourceBatchId')::uuid AND company_id=tenant FOR UPDATE;
  IF source.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF source.superseded_at IS NOT NULL OR source.superseded_by_batch_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','ALREADY_SUPERSEDED'); END IF;
  IF source.expires_at<=now_at THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;
  raw_credential=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  SET CONSTRAINTS customer_review_batches_superseded_by_fk DEFERRED;
  UPDATE erp.customer_review_batches SET superseded_at=now_at,superseded_by_batch_id=successor_id,row_version=row_version+1 WHERE id=source.id;
  INSERT INTO erp.customer_review_batches(id,company_id,customer_id,project_id,rental_id,review_date,business_timezone,credential_hash,expires_at,summary_snapshot,finalized_at)
  VALUES(successor_id,source.company_id,source.customer_id,source.project_id,source.rental_id,source.review_date,source.business_timezone,
    pg_catalog.encode(extensions.digest(raw_credential,'sha256'),'hex'),now_at+interval '7 days',source.summary_snapshot,now_at) RETURNING * INTO successor;
  INSERT INTO erp.customer_review_batch_items(batch_id,company_id,customer_id,project_id,rental_id,rental_equipment_line_id,equipment_id,operator_id,deur_id,revision_id,customer_review_request_id,item_snapshot)
  SELECT successor.id,company_id,customer_id,project_id,rental_id,rental_equipment_line_id,equipment_id,operator_id,deur_id,revision_id,customer_review_request_id,item_snapshot
  FROM erp.customer_review_batch_items WHERE batch_id=source.id;
  RETURN jsonb_build_object('success',true,'disposition','SUPERSEDED','value',jsonb_build_object('sourceBatchId',source.id,'successorBatchId',successor.id,'credential',raw_credential));
END $$;

CREATE OR REPLACE FUNCTION erp.reject_finalized_customer_review_batch_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF session_user=database_owner AND current_user=database_owner
    AND current_setting('erp.c12_grouped_expiry_certification',true)='TENANT-UAT-C12-GROUPED-CUSTOMER-001'
    AND OLD.company_id='TENANT-UAT-C12-GROUPED-CUSTOMER-001'
    AND NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NEW.expires_at>OLD.created_at AND NEW.expires_at<=clock_timestamp()
    AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
    AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id AND NEW.rental_id IS NOT DISTINCT FROM OLD.rental_id
    AND NEW.review_date IS NOT DISTINCT FROM OLD.review_date AND NEW.business_timezone IS NOT DISTINCT FROM OLD.business_timezone
    AND NEW.credential_hash IS NOT DISTINCT FROM OLD.credential_hash AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    AND NEW.superseded_at IS NOT DISTINCT FROM OLD.superseded_at AND NEW.superseded_by_batch_id IS NOT DISTINCT FROM OLD.superseded_by_batch_id
    AND NEW.summary_snapshot IS NOT DISTINCT FROM OLD.summary_snapshot AND NEW.row_version IS NOT DISTINCT FROM OLD.row_version
    AND NEW.finalized_at IS NOT DISTINCT FROM OLD.finalized_at THEN RETURN NEW;
  END IF;
  IF OLD.finalized_at IS NOT NULL AND (
    NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
    NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.rental_id IS DISTINCT FROM OLD.rental_id OR
    NEW.review_date IS DISTINCT FROM OLD.review_date OR NEW.business_timezone IS DISTINCT FROM OLD.business_timezone OR
    NEW.credential_hash IS DISTINCT FROM OLD.credential_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR
    NEW.summary_snapshot IS DISTINCT FROM OLD.summary_snapshot OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
  ) THEN RAISE EXCEPTION 'finalized grouped Customer Review batch is immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp.certify_c12_grouped_customer_review_batch_expired(target_batch_id uuid,target_tenant_id text,confirmation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF session_user<>database_owner OR current_user<>database_owner THEN RAISE EXCEPTION 'database-owner session required' USING ERRCODE='42501'; END IF;
  IF target_tenant_id<>'TENANT-UAT-C12-GROUPED-CUSTOMER-001' OR confirmation<>'CONFIRM-C12-GROUPED-EXPIRY-CERTIFICATION' THEN RAISE EXCEPTION 'invalid expiry certification scope' USING ERRCODE='42501'; END IF;
  IF target_tenant_id='TENANT-LOCAL-001' THEN RAISE EXCEPTION 'protected local tenant' USING ERRCODE='42501'; END IF;
  PERFORM set_config('erp.c12_grouped_expiry_certification',target_tenant_id,true);
  UPDATE erp.customer_review_batches SET expires_at=greatest(created_at+interval '1 millisecond',clock_timestamp()-interval '1 millisecond')
    WHERE id=target_batch_id AND company_id=target_tenant_id AND finalized_at IS NOT NULL AND superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'eligible grouped batch not found' USING ERRCODE='P0002'; END IF;
END $$;

ALTER FUNCTION erp.command_supersede_customer_review_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.certify_c12_grouped_customer_review_batch_expired(uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_supersede_customer_review_batch(jsonb),erp.certify_c12_grouped_customer_review_batch_expired(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_supersede_customer_review_batch(jsonb) TO authenticated;
COMMENT ON FUNCTION erp.command_supersede_customer_review_batch(jsonb) IS 'Canonical same-business-date grouped batch replacement. Clones frozen batch evidence and reuses unresolved per-DEUR request identities.';
COMMENT ON FUNCTION erp.certify_c12_grouped_customer_review_batch_expired(uuid,text,text) IS 'Owner-only exact-UAT deterministic natural-expiry certification boundary; unavailable to application roles.';
COMMIT;
