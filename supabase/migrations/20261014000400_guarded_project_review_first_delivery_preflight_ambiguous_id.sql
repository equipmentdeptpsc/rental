BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE OR REPLACE FUNCTION erp.preflight_guarded_project_review_first_delivery(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  actor_id uuid; target_batch_id uuid; tenant text; batch erp.customer_review_batches;
  expected_ids uuid[]; actual_ids uuid[]; active_envelopes integer; target_deur_number text;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN
      ('actorId','batchId','deurNumber','notificationIds','phase'))
    OR coalesce(command->>'actorId','') !~ '^[0-9a-f-]{36}$'
    OR coalesce(command->>'batchId','') !~ '^[0-9a-f-]{36}$'
    OR coalesce(command->>'deurNumber','') !~ '^DEUR-[0-9]{4}-[0-9]{6}$'
    OR command->>'phase' NOT IN('BEFORE_PREPARATION','AFTER_PREPARATION')
    OR coalesce(jsonb_typeof(command->'notificationIds'),'')<>'array'
    OR jsonb_array_length(command->'notificationIds')<>2
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN
    actor_id=(command->>'actorId')::uuid; target_batch_id=(command->>'batchId')::uuid;
    SELECT array_agg(value::uuid ORDER BY value::uuid) INTO expected_ids
    FROM jsonb_array_elements_text(command->'notificationIds');
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END;
  IF cardinality(expected_ids)<>2 OR expected_ids[1]=expected_ids[2]
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT users.company_id INTO tenant FROM erp.users users
  JOIN erp.companies company ON company.id=users.company_id AND company.active
  WHERE users.id=actor_id AND users.status='active';
  IF tenant IS NULL
    OR NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions permission
      WHERE permission.user_id=actor_id AND permission.permission_code='settings.update')
    OR NOT EXISTS(SELECT 1 FROM erp.user_roles membership JOIN erp.app_roles role ON role.id=membership.role_id
      WHERE membership.user_id=actor_id AND role.code='system-administrator'
        AND role.active AND role.deprecated_at IS NULL)
  THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;

  SELECT * INTO batch FROM erp.customer_review_batches
  WHERE id=target_batch_id AND company_id=tenant AND group_scope='PROJECT'
    AND finalized_at IS NOT NULL AND superseded_at IS NULL AND retired_no_actionable_at IS NULL
    AND expires_at>clock_timestamp();
  IF batch.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','BATCH_NOT_ACTIONABLE'); END IF;
  IF batch.project_id IS NULL OR batch.customer_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM erp.projects project WHERE project.company_id=tenant
      AND project.id=batch.project_id AND project.customer_id=batch.customer_id
      AND project.active AND project.deleted_at IS NULL)
  THEN RETURN jsonb_build_object('success',false,'code','PROJECT_SCOPE_INVALID'); END IF;

  SELECT deur.deur_number INTO target_deur_number FROM erp.customer_review_batch_items item
  JOIN erp.deurs deur ON deur.company_id=item.company_id AND deur.id=item.deur_id
  WHERE item.batch_id=batch.id AND item.company_id=tenant AND item.customer_id=batch.customer_id
    AND item.project_id=batch.project_id AND deur.deur_number=command->>'deurNumber'
    AND deur.customer_id=batch.customer_id AND deur.project_id=batch.project_id
    AND deur.status='Submitted' AND deur.superseded_by_revision_id IS NULL;
  IF target_deur_number IS NULL THEN RETURN jsonb_build_object('success',false,'code','DEUR_SCOPE_INVALID'); END IF;
  IF EXISTS(SELECT 1 FROM erp.customer_review_batch_items item
    WHERE item.batch_id=batch.id AND (item.company_id IS DISTINCT FROM tenant
      OR item.customer_id IS DISTINCT FROM batch.customer_id OR item.project_id IS DISTINCT FROM batch.project_id))
  THEN RETURN jsonb_build_object('success',false,'code','BATCH_MEMBERSHIP_INVALID'); END IF;

  SELECT array_agg(intent.id ORDER BY intent.id) INTO actual_ids FROM erp.notification_outbox intent
  WHERE intent.company_id=tenant AND intent.source_aggregate_type='CUSTOMER_REVIEW_BATCH'
    AND intent.source_aggregate_id=batch.id::text AND intent.notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED'
    AND intent.status NOT IN('Cancelled','Superseded','DeadLetter','FailedCredentialLost');
  IF actual_ids IS DISTINCT FROM expected_ids
  THEN RETURN jsonb_build_object('success',false,'code','NOTIFICATION_MEMBERSHIP_MISMATCH'); END IF;
  IF jsonb_array_length(batch.recipient_snapshot)<>2
    OR EXISTS(SELECT 1
      FROM unnest(expected_ids) AS expected_notification(expected_notification_id)
      JOIN erp.notification_outbox intent ON intent.id=expected_notification.expected_notification_id
      WHERE intent.company_id<>tenant OR intent.status<>'Pending' OR intent.attempt_count<>0
        OR intent.provider_name IS NOT NULL OR intent.provider_message_id IS NOT NULL OR intent.sent_at IS NOT NULL
        OR intent.claimed_by IS NOT NULL OR intent.claimed_at IS NOT NULL OR intent.lease_expires_at IS NOT NULL
        OR NOT intent.requires_review_credential
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(batch.recipient_snapshot) recipient
          WHERE recipient->>'email'=intent.recipient_destination AND recipient->>'name'=intent.recipient_display_name))
    OR EXISTS(SELECT 1 FROM erp.notification_delivery_attempts attempt WHERE attempt.notification_id=ANY(expected_ids))
  THEN RETURN jsonb_build_object('success',false,'code','NOTIFICATION_NOT_ELIGIBLE'); END IF;
  IF (SELECT count(DISTINCT recipient->>'email') FROM jsonb_array_elements(batch.recipient_snapshot) recipient)<>2
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(batch.recipient_snapshot) recipient
      WHERE coalesce(recipient->>'name','')='' OR coalesce(recipient->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  THEN RETURN jsonb_build_object('success',false,'code','RECIPIENT_SNAPSHOT_INVALID'); END IF;

  SELECT count(*) INTO active_envelopes FROM erp.notification_delivery_envelopes envelope
  WHERE envelope.notification_id=ANY(expected_ids) AND envelope.retired_at IS NULL;
  IF (command->>'phase'='BEFORE_PREPARATION' AND active_envelopes NOT IN(0,2))
    OR (command->>'phase'='AFTER_PREPARATION' AND active_envelopes<>2)
  THEN RETURN jsonb_build_object('success',false,'code','DELIVERY_ENVELOPE_NOT_EXACT'); END IF;
  RETURN jsonb_build_object('success',true,'disposition','READY','value',jsonb_build_object(
    'batchId',batch.id,'notificationCount',2,'attemptCount',0,'activeEnvelopeCount',active_envelopes,
    'groupScope',batch.group_scope,'recipientSnapshotFrozen',true));
END $$;

ALTER FUNCTION erp.preflight_guarded_project_review_first_delivery(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.preflight_guarded_project_review_first_delivery(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.preflight_guarded_project_review_first_delivery(jsonb) TO service_role;
COMMENT ON FUNCTION erp.preflight_guarded_project_review_first_delivery(jsonb) IS
  'Read-only fail-closed preflight for an explicitly pinned Project-review batch and two notification intents. Returns no recipient PII or delivery credential.';
COMMIT;
