BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

-- Operational monitoring is deliberately separate from the public bearer-link
-- projection. Neither credentials nor encrypted delivery envelopes are read.
CREATE FUNCTION erp.read_project_customer_review_for_rental(target_rental_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); rental erp.rentals; project erp.projects; customer erp.customers;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
    SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
    WHERE u.id=auth.uid() AND u.company_id=tenant AND u.status='active' AND c.active)
  THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT (erp.current_user_has_permission('rental.read')
    AND erp.current_user_has_permission('project.read')
    AND erp.current_user_has_permission('deur.read'))
  THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(target_rental_id),'') IS NULL THEN RAISE EXCEPTION 'RENTAL_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO rental FROM erp.rentals WHERE company_id=tenant AND id=target_rental_id;
  IF rental.id IS NULL THEN RAISE EXCEPTION 'RENTAL_NOT_FOUND' USING ERRCODE='02000'; END IF;
  SELECT * INTO project FROM erp.projects WHERE company_id=tenant AND id=rental.project_id;
  SELECT * INTO customer FROM erp.customers WHERE company_id=tenant AND id=rental.customer_id;
  IF project.id IS NULL OR project.customer_id IS DISTINCT FROM rental.customer_id OR customer.id IS NULL
  THEN RAISE EXCEPTION 'PROJECT_RELATIONSHIP_INVALID' USING ERRCODE='55000'; END IF;

  RETURN jsonb_build_object('rentalId',rental.id,'customerId',customer.id,'customerName',customer.name,
    'projectId',project.id,'projectName',project.name,
    'configuredReviewers',coalesce((SELECT contacts.recipients FROM erp.project_customer_review_recipients contacts
      WHERE contacts.company_id=tenant AND contacts.project_id=project.id),'[]'::jsonb),
    'batches',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'batchId',batch.id,'scope',batch.group_scope,'reviewDate',batch.review_date,
      'businessTimezone',batch.business_timezone,'finalizedAt',batch.finalized_at,
      'supersededAt',batch.superseded_at,'supersededByBatchId',batch.superseded_by_batch_id,
      'recipientSnapshot',batch.recipient_snapshot,'recipientVersion',batch.recipient_version,
      'notifications',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'recipient',notice.recipient_destination,'state',notice.status,'createdAt',notice.created_at,
        'sentAt',notice.sent_at) ORDER BY notice.created_at,notice.id)
        FROM erp.notification_outbox notice WHERE notice.company_id=tenant
          AND notice.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND notice.source_aggregate_id=batch.id::text),'[]'::jsonb),
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'rentalId',item.rental_id,'rentalLineId',item.rental_equipment_line_id,
        'deurId',item.deur_id,'deurNumber',deur.deur_number,'deurStatus',deur.status,
        'revisionId',item.revision_id,'workDate',deur.work_date,
        'reviewStatus',coalesce(request.status,'InProgress'),
        'submittedAt',deur.submitted_at,'acknowledgedAt',deur.acknowledged_at,
        'requestIssuedAt',request.issued_at,'requestConsumedAt',request.consumed_at)
        ORDER BY item.created_at,item.id)
        FROM erp.customer_review_batch_items item
        LEFT JOIN erp.deurs deur ON deur.company_id=item.company_id AND deur.id=item.revision_id
        LEFT JOIN erp.customer_review_requests request ON request.company_id=item.company_id
          AND request.id=item.customer_review_request_id
        WHERE item.batch_id=batch.id),'[]'::jsonb)) ORDER BY batch.review_date DESC,batch.created_at DESC,batch.id DESC)
      FROM erp.customer_review_batches batch
      WHERE batch.company_id=tenant AND batch.customer_id=rental.customer_id
        AND batch.project_id=rental.project_id
        AND (batch.rental_id=rental.id OR EXISTS(SELECT 1 FROM erp.customer_review_batch_items member
          WHERE member.batch_id=batch.id AND member.rental_id=rental.id))),'[]'::jsonb));
END $$;
ALTER FUNCTION erp.read_project_customer_review_for_rental(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_project_customer_review_for_rental(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_project_customer_review_for_rental(text) TO authenticated;
COMMIT;
