BEGIN;
SET search_path TO erp, public;

INSERT INTO erp.app_permissions(id,code,name,resource,action,catalog_version,active,deprecated_at,replacement_permission,risk_class)
VALUES(extensions.gen_random_uuid()::text,'deur.expectation.waive','Waive historical DEUR expectation','deur','expectation.waive','2.0-extension',true,NULL,ARRAY[]::text[],'APPROVAL')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,resource=EXCLUDED.resource,action=EXCLUDED.action,catalog_version=EXCLUDED.catalog_version,active=true,deprecated_at=NULL,replacement_permission=ARRAY[]::text[],risk_class=EXCLUDED.risk_class;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM erp.app_roles role CROSS JOIN erp.app_permissions permission
WHERE role.code='system-administrator' AND role.active AND role.deprecated_at IS NULL AND permission.code='deur.expectation.waive'
ON CONFLICT DO NOTHING;

CREATE TABLE erp.deur_expectation_dispositions(
 id text PRIMARY KEY DEFAULT extensions.gen_random_uuid()::text,
 company_id text NOT NULL REFERENCES erp.companies(id),
 rental_id text NOT NULL,
 rental_equipment_line_id text NOT NULL,
 work_date date NOT NULL,
 expectation_fingerprint text NOT NULL,
 disposition text NOT NULL CHECK(disposition='WAIVED'),
 reason text NOT NULL CHECK(length(btrim(reason))>0),
 command_id text NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT deur_expectation_dispositions_rental_fk FOREIGN KEY(company_id,rental_id) REFERENCES erp.rentals(company_id,id),
 CONSTRAINT deur_expectation_dispositions_line_fk FOREIGN KEY(company_id,rental_equipment_line_id) REFERENCES erp.rental_equipment_lines(company_id,id),
 CONSTRAINT deur_expectation_dispositions_identity_unique UNIQUE(company_id,rental_id,rental_equipment_line_id,work_date,expectation_fingerprint),
 CONSTRAINT deur_expectation_dispositions_command_unique UNIQUE(company_id,command_id)
);
CREATE INDEX ix_deur_expectation_dispositions_rental ON erp.deur_expectation_dispositions(company_id,rental_id,work_date);
ALTER TABLE erp.deur_expectation_dispositions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.deur_expectation_dispositions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp.read_deur_expectation_dispositions(target_rental_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();
BEGIN
 IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('deur.read') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.rentals WHERE id=target_rental_id AND company_id=tenant) THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('success',true,'dispositions',(
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'rentalId',d.rental_id,'rentalEquipmentLineId',d.rental_equipment_line_id,'workDate',d.work_date,'expectationFingerprint',d.expectation_fingerprint,'disposition',d.disposition,'reason',d.reason,'createdAt',d.created_at,'createdBy',d.created_by) ORDER BY d.work_date,d.id),'[]'::jsonb)
  FROM erp.deur_expectation_dispositions d WHERE d.company_id=tenant AND d.rental_id=target_rental_id));
END $$;

CREATE FUNCTION erp.command_waive_deur_expectation(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();actor uuid=auth.uid();target erp.rentals;line erp.rental_equipment_lines;snapshot jsonb;work_day date;timezone_name text;fingerprint text;reason_text text;idem jsonb;payload_hash text;response jsonb;waiver erp.deur_expectation_dispositions;now_at timestamptz=clock_timestamp();
BEGIN
 IF tenant IS NULL OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('deur.expectation.waive') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF command ? 'companyId' OR nullif(btrim(command->>'rentalId'),'') IS NULL OR nullif(btrim(command->>'rentalEquipmentLineId'),'') IS NULL OR nullif(btrim(command->>'workDate'),'') IS NULL OR nullif(btrim(command->>'expectationFingerprint'),'') IS NULL OR nullif(btrim(command->>'reason'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN work_day=(command->>'workDate')::date;EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR SHARE;
 SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=command->>'rentalEquipmentLineId' AND rental_id=target.id AND company_id=tenant FOR SHARE;
 IF target.id IS NULL OR line.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 snapshot=line.operational_metadata->'deurExpectationSnapshot';fingerprint=snapshot->>'sourceFingerprint';reason_text=btrim(command->>'reason');timezone_name=coalesce(nullif(snapshot#>>'{policy,timezone}',''),'UTC');
 IF target.status::text NOT IN('Released','Active','Returned','Closed') OR snapshot#>>'{policy,frequency}'<>'PER_WORKDAY' OR fingerprint IS NULL OR fingerprint<>command->>'expectationFingerprint' OR work_day<greatest((snapshot#>>'{policy,effectiveFrom}')::date,(timezone(timezone_name,target.released_at))::date) OR work_day>=(timezone(timezone_name,now_at))::date OR coalesce(snapshot#>'{policy,excludeDates}','[]'::jsonb) ? work_day::text THEN RETURN jsonb_build_object('success',false,'code','EXPECTATION_NOT_WAIVABLE');END IF;
 IF EXISTS(SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_id=target.id AND d.rental_equipment_line_id=line.id AND d.work_date=work_day AND d.deleted_at IS NULL) THEN RETURN jsonb_build_object('success',false,'code','EXPECTATION_HAS_DEUR');END IF;
 idem=erp.begin_operational_command(command,'WAIVE_DEUR_EXPECTATION','DEUR_EXPECTATION',line.id||':'||work_day::text,tenant,actor::text);
 IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');ELSIF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');END IF;payload_hash=idem->>'payloadHash';
 IF EXISTS(SELECT 1 FROM erp.deur_expectation_dispositions d WHERE d.company_id=tenant AND d.rental_id=target.id AND d.rental_equipment_line_id=line.id AND d.work_date=work_day AND d.expectation_fingerprint=fingerprint) THEN RETURN jsonb_build_object('success',false,'code','ALREADY_WAIVED');END IF;
 INSERT INTO erp.deur_expectation_dispositions(company_id,rental_id,rental_equipment_line_id,work_date,expectation_fingerprint,disposition,reason,command_id,created_by,created_at)
 VALUES(tenant,target.id,line.id,work_day,fingerprint,'WAIVED',reason_text,command->>'commandId',actor,now_at) RETURNING * INTO waiver;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
 VALUES(extensions.gen_random_uuid()::text,tenant,'DeurExpectation',line.id||':'||work_day::text,'DEUR_EXPECTATION_WAIVED',actor::text,now_at,command->>'commandId',jsonb_build_object('status','MISSING','dueState','DUE'),jsonb_build_object('disposition','WAIVED','reason',reason_text),jsonb_build_object('rentalId',target.id,'rentalEquipmentLineId',line.id,'workDate',work_day,'expectationFingerprint',fingerprint));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('waiverId',waiver.id,'rentalId',target.id,'rentalEquipmentLineId',line.id,'workDate',work_day,'expectationFingerprint',fingerprint,'status','WAIVED'));
 RETURN erp.finish_operational_command(command,'WAIVE_DEUR_EXPECTATION','DEUR_EXPECTATION',line.id||':'||work_day::text,tenant,actor::text,payload_hash,response,1);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','ALREADY_WAIVED');
END $$;

ALTER FUNCTION erp.read_deur_expectation_dispositions(text) OWNER TO postgres;
ALTER FUNCTION erp.command_waive_deur_expectation(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_deur_expectation_dispositions(text),erp.command_waive_deur_expectation(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_deur_expectation_dispositions(text),erp.command_waive_deur_expectation(jsonb) TO authenticated;
COMMIT;
