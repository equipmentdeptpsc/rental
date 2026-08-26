BEGIN;
SET search_path TO erp, auth, extensions, pg_catalog;

DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('erp.command_reserve_rental(jsonb)'::regprocedure) INTO definition;
  definition := replace(definition,
    'timezone=(SELECT l.operational_metadata#>>''{deurExpectationSnapshot,shiftWindows,0,timezone}'' FROM erp.rental_equipment_lines l WHERE l.rental_id=target.id ORDER BY l.id LIMIT 1)',
    'timezone=(SELECT coalesce(nullif(l.operational_metadata#>>''{deurExpectationSnapshot,policy,timezone}'',''''),nullif(l.operational_metadata#>>''{deurExpectationSnapshot,shiftWindows,0,timezone}'','''')) FROM erp.rental_equipment_lines l WHERE l.rental_id=target.id ORDER BY l.id LIMIT 1)');
  IF definition NOT LIKE '%coalesce(nullif(l.operational_metadata#>>''{deurExpectationSnapshot,policy,timezone}''%' THEN
    RAISE EXCEPTION 'reserve Rental timezone correction did not match the authoritative definition' USING ERRCODE='55000';
  END IF;
  EXECUTE definition;
END $$;

CREATE FUNCTION erp.command_configure_rental_customer_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text=erp.current_company_id(); actor text=auth.uid()::text; target erp.rentals; customer_record erp.customers;
  now_at timestamptz=clock_timestamp(); expected bigint; canonical_timezone text; timezone_count integer;
  representative_name text; representative_email text; idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('rental.customerContact.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN
    ('commandId','idempotencyKey','rentalId','customerId','expectedVersion','representativeName','representativeEmail'))
    OR nullif(command->>'commandId','') IS NULL OR nullif(command->>'idempotencyKey','') IS NULL
    OR nullif(command->>'rentalId','') IS NULL OR nullif(command->>'customerId','') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF target.customer_id IS DISTINCT FROM command->>'customerId' THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO customer_record FROM erp.customers WHERE id=target.customer_id AND company_id=tenant AND active AND deleted_at IS NULL;
  IF customer_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;

  idem=erp.begin_operational_command(command,'CONFIGURE_RENTAL_CUSTOMER_REVIEW','RENTAL',target.id,tenant,actor);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
  ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';

  BEGIN expected=(command->>'expectedVersion')::bigint; EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF expected<>target.row_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version); END IF;
  IF target.status NOT IN('Reserved','Released','Active','Returned') OR target.closed_at IS NOT NULL OR target.cancelled_at IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF EXISTS(SELECT 1 FROM erp.customer_review_requests q WHERE q.company_id=tenant AND q.rental_id=target.id AND q.status='Pending'
    AND q.superseded_at IS NULL AND q.revoked_at IS NULL AND q.consumed_at IS NULL)
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;

  representative_name=btrim(coalesce(command->>'representativeName',''));
  representative_email=lower(btrim(coalesce(command->>'representativeEmail','')));
  IF length(representative_name) NOT BETWEEN 1 AND 200 OR representative_name ~ '[\r\n]'
    OR length(representative_email) NOT BETWEEN 3 AND 254 OR representative_email ~ '[\r\n]'
    OR representative_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT count(DISTINCT nullif(l.operational_metadata#>>'{deurExpectationSnapshot,policy,timezone}','')),
    min(nullif(l.operational_metadata#>>'{deurExpectationSnapshot,policy,timezone}',''))
  INTO timezone_count,canonical_timezone FROM erp.rental_equipment_lines l
  WHERE l.company_id=tenant AND l.rental_id=target.id AND l.deleted_at IS NULL;
  IF timezone_count<>1 OR canonical_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=canonical_timezone)
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TIMEZONE'); END IF;

  UPDATE erp.rentals SET timezone=canonical_timezone,customer_review_name_snapshot=representative_name,
    customer_review_email_snapshot=representative_email,customer_review_contact_captured_at=now_at,
    updated_at=now_at,updated_by=actor WHERE id=target.id RETURNING * INTO target;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(gen_random_uuid()::text,tenant,'Rental',target.id,'RENTAL_CUSTOMER_REVIEW_CONFIGURED',actor,now_at,command->>'commandId',
    jsonb_build_object('customerId',target.customer_id,'timezone',canonical_timezone,'representativeName',representative_name,
      'recipientFingerprint',encode(digest(representative_email,'sha256'),'hex'),'version',target.row_version));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target.id,
    'rentalNumber',target.rental_number,'status',target.status,'version',target.row_version));
  RETURN erp.finish_operational_command(command,'CONFIGURE_RENTAL_CUSTOMER_REVIEW','RENTAL',target.id,tenant,actor,payload_hash,response,target.row_version);
EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
END $$;

ALTER FUNCTION erp.command_configure_rental_customer_review(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_configure_rental_customer_review(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_configure_rental_customer_review(jsonb) TO authenticated;
COMMENT ON FUNCTION erp.command_configure_rental_customer_review(jsonb) IS
  'Configures a Rental-specific Customer Review recipient and derives Rental timezone from immutable line policy evidence without changing DEUR, commercial, approval, Reserve, or Release evidence.';
COMMIT;
