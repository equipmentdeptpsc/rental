BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Read-only lineage evidence for the one isolated-UAT provisioning residue.
-- It deliberately derives every downstream count from the residue's immutable
-- scenario identities; it never uses tenant-wide artifact counts.
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_scenario_lineage(target_tenant text, target_scenario text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  s erp.uat_multi_equipment_provisioning_scenarios;
  rental_ids text[]; line_ids text[]; deur_ids text[];
  batch_count integer; membership_count integer; request_count integer; outcome_count integer;
  notification_count integer; delivery_attempt_count integer;
  statement_count integer; statement_line_count integer; invoice_count integer;
  return_transition_count integer;
  review_statuses jsonb; notification_statuses jsonb; billing_statuses jsonb; return_statuses jsonb;
  result_status text; blockers jsonb='[]'::jsonb; unproven jsonb='[]'::jsonb;
BEGIN
  IF target_tenant<>'TENANT-LOCAL-001' OR target_scenario<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29'
     OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=target_tenant AND c.active AND c.environment_class='compatibility') THEN
    RETURN jsonb_build_object('success',false,'code','UAT_TENANT_REQUIRED');
  END IF;

  SELECT * INTO s FROM erp.uat_multi_equipment_provisioning_scenarios
  WHERE company_id=target_tenant AND scenario_key=target_scenario;
  IF s.scenario_key IS NULL THEN
    RETURN jsonb_build_object('success',true,'status','UNPROVEN','reason','SCENARIO_NOT_FOUND',
      'blockers','[]'::jsonb,'unproven',jsonb_build_array('scenarioIdentity'));
  END IF;

  SELECT array_agg(value ORDER BY value) INTO rental_ids
  FROM jsonb_array_elements_text(jsonb_build_array(s.scenario->>'rentalAId',s.scenario->>'rentalBId')) value
  WHERE nullif(value,'') IS NOT NULL;
  SELECT array_agg(value ORDER BY value) INTO line_ids
  FROM jsonb_array_elements_text(coalesce(s.scenario->'rentalALineIds','[]'::jsonb) || jsonb_build_array(s.scenario->>'rentalBLineId')) value
  WHERE nullif(value,'') IS NOT NULL;
  IF coalesce(cardinality(rental_ids),0)<>2 OR cardinality(ARRAY(SELECT DISTINCT unnest(rental_ids)))<>2
     OR coalesce(cardinality(line_ids),0)<>3 OR cardinality(ARRAY(SELECT DISTINCT unnest(line_ids)))<>3 THEN
    RETURN jsonb_build_object('success',true,'status','UNPROVEN','reason','SCENARIO_IDENTITY_INCOMPLETE',
      'blockers','[]'::jsonb,'unproven',jsonb_build_array('scenarioIdentity'));
  END IF;

  SELECT coalesce(array_agg(d.id ORDER BY d.id),ARRAY[]::text[]) INTO deur_ids
  FROM erp.deurs d WHERE d.company_id=target_tenant AND d.rental_id=ANY(rental_ids)
    AND d.rental_equipment_line_id=ANY(line_ids);

  SELECT count(*) INTO batch_count FROM erp.customer_review_batches b
  WHERE b.company_id=target_tenant AND b.rental_id=ANY(rental_ids);
  SELECT count(*) INTO membership_count FROM erp.customer_review_batch_items i
  JOIN erp.customer_review_batches b ON b.id=i.batch_id AND b.company_id=i.company_id
  WHERE i.company_id=target_tenant AND b.rental_id=ANY(rental_ids)
    AND i.rental_equipment_line_id=ANY(line_ids);
  SELECT count(*),coalesce(jsonb_agg(DISTINCT r.status),'[]'::jsonb) INTO request_count,review_statuses
  FROM erp.customer_review_requests r WHERE r.company_id=target_tenant
    AND r.rental_id=ANY(rental_ids) AND r.rental_equipment_line_id=ANY(line_ids);
  SELECT count(*) INTO outcome_count FROM erp.customer_review_outcomes o
  WHERE o.company_id=target_tenant AND o.rental_id=ANY(rental_ids) AND o.deur_id=ANY(deur_ids);

  WITH scoped_notifications AS (
    SELECT n.id,n.status FROM erp.notification_outbox n
    WHERE n.company_id=target_tenant AND n.rental_id=ANY(rental_ids)
    UNION
    SELECT n.id,n.status FROM erp.notification_outbox n JOIN erp.customer_review_batches b
      ON n.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND n.source_aggregate_id=b.id::text
    WHERE n.company_id=target_tenant AND b.company_id=target_tenant AND b.rental_id=ANY(rental_ids)
  ) SELECT count(*),coalesce(jsonb_agg(DISTINCT status),'[]'::jsonb),
      (SELECT count(*) FROM erp.notification_delivery_attempts a JOIN scoped_notifications n ON n.id=a.notification_id)
    INTO notification_count,notification_statuses,delivery_attempt_count FROM scoped_notifications;

  WITH scoped_statements AS (
    SELECT b.id,b.invoice_status,b.approval_status FROM erp.billing_statements b
    WHERE b.company_id=target_tenant AND b.deleted_at IS NULL AND b.rental_id=ANY(rental_ids)
    UNION
    SELECT b.id,b.invoice_status,b.approval_status FROM erp.billing_statements b JOIN erp.billing_statement_lines l ON l.billing_statement_id=b.id
    WHERE b.company_id=target_tenant AND b.deleted_at IS NULL AND l.company_id=target_tenant
      AND (l.rental_equipment_line_id=ANY(line_ids) OR l.deur_id=ANY(deur_ids))
  ) SELECT count(*),coalesce(jsonb_agg(DISTINCT jsonb_build_object('approvalStatus',approval_status,'invoiceStatus',invoice_status)),'[]'::jsonb),
      count(*) FILTER (WHERE invoice_status IN ('Invoiced','Partially Collected','Fully Collected')),
      (SELECT count(*) FROM erp.billing_statement_lines l JOIN scoped_statements b ON b.id=l.billing_statement_id)
    INTO statement_count,billing_statuses,invoice_count,statement_line_count FROM scoped_statements;

  SELECT count(*),coalesce(jsonb_agg(DISTINCT jsonb_build_object('commandType',o.command_type,'commandStatus',o.command_status)),'[]'::jsonb)
    INTO return_transition_count,return_statuses
  FROM erp.operational_command_idempotency o
  WHERE o.company_id=target_tenant AND (
    (o.target_aggregate_type='RENTAL' AND o.target_aggregate_id=ANY(rental_ids)
      AND o.command_type IN ('RETURN_ALL_RENTAL_LINES','REVERSE_RENTAL_RETURN'))
    OR (o.target_aggregate_type='RENTAL_LINE' AND o.target_aggregate_id=ANY(line_ids)
      AND o.command_type='RETURN_RENTAL_LINE')
  );
  -- Current persisted Return state is canonical evidence even if an old idempotency row has expired.
  SELECT return_transition_count + count(*) INTO return_transition_count
  FROM erp.rentals r WHERE r.company_id=target_tenant AND r.id=ANY(rental_ids)
    AND (r.status='Returned' OR r.returned_at IS NOT NULL);
  SELECT return_transition_count + count(*) INTO return_transition_count
  FROM erp.rental_equipment_lines l WHERE l.company_id=target_tenant AND l.id=ANY(line_ids) AND l.status='Returned';

  IF batch_count>0 OR membership_count>0 OR request_count>0 OR outcome_count>0 THEN blockers:=blockers||jsonb_build_array('reviewArtifacts'); END IF;
  IF notification_count>0 THEN blockers:=blockers||jsonb_build_array('notificationArtifacts'); END IF;
  IF delivery_attempt_count>0 THEN blockers:=blockers||jsonb_build_array('deliveryAttempts'); END IF;
  IF statement_count>0 OR statement_line_count>0 THEN blockers:=blockers||jsonb_build_array('billingStatements'); END IF;
  IF invoice_count>0 THEN blockers:=blockers||jsonb_build_array('invoices'); END IF;
  IF return_transition_count>0 THEN blockers:=blockers||jsonb_build_array('returnTransitions'); END IF;
  result_status:=CASE WHEN jsonb_array_length(blockers)>0 THEN 'BLOCKED' ELSE 'SAFE' END;
  RETURN jsonb_build_object('success',true,'status',result_status,'reason',CASE WHEN result_status='SAFE' THEN 'ALL_SCENARIO_LINEAGE_COUNTS_ZERO' ELSE blockers->>0 END,
    'blockers',blockers,'unproven',unproven,
    'review',jsonb_build_object('batchCount',batch_count,'membershipCount',membership_count,'requestCount',request_count,'outcomeCount',outcome_count,'status',review_statuses),
    'notification',jsonb_build_object('notificationCount',notification_count,'deliveryAttemptCount',delivery_attempt_count,'status',notification_statuses),
    'billing',jsonb_build_object('statementCount',statement_count,'statementLineCount',statement_line_count,'invoiceCount',invoice_count,'status',billing_statuses),
    'return',jsonb_build_object('transitionCount',return_transition_count,'status',return_statuses));
END $$;

ALTER FUNCTION erp.inspect_isolated_uat_scenario_lineage(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_scenario_lineage(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_scenario_lineage(text,text) TO service_role;
COMMIT;
