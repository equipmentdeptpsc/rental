\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('11111111-1111-1111-1111-111111111111','rental.requester@example.test'),
 ('22222222-2222-2222-2222-222222222222','rental.approver@example.test'),
 ('33333333-3333-3333-3333-333333333333','rental.unprivileged@example.test'),
 ('44444444-4444-4444-4444-444444444444','rental.foreign@example.test');
INSERT INTO erp.companies(id,code,name) VALUES('TENANT-FOREIGN-001','CERT-FOREIGN','Certification foreign tenant');
INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES
 ('11111111-1111-1111-1111-111111111111','rental.requester','Rental Requester','active','TENANT-LOCAL-001'),
 ('22222222-2222-2222-2222-222222222222','rental.approver','Rental Approver','active','TENANT-LOCAL-001'),
 ('33333333-3333-3333-3333-333333333333','rental.unprivileged','Rental Unprivileged','active','TENANT-LOCAL-001'),
 ('44444444-4444-4444-4444-444444444444','rental.foreign','Rental Foreign','active','TENANT-FOREIGN-001');
-- Draft creation and commercial preparation still use legacy permissions outside
-- the scoped Reserve remediation. Grant only those prerequisites transactionally;
-- Reserve itself must resolve through the Catalog 2.0 rental.update mapping.
INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM erp.app_roles r
JOIN erp.app_permissions p ON p.code IN('rental.manage','rental.commercialTerms.manage')
WHERE r.code='system-administrator'
ON CONFLICT DO NOTHING;
INSERT INTO erp.user_roles(user_id,role_id) SELECT '11111111-1111-1111-1111-111111111111',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '22222222-2222-2222-2222-222222222222',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '44444444-4444-4444-4444-444444444444',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.cost_codes(id,code,name) VALUES('CERT-COST','CERT-COST','Certification Cost');
INSERT INTO erp.activity_codes(id,code,name) VALUES('CERT-ACT','CERT-ACT','Certification Activity');
INSERT INTO erp.work_descriptions(id,code,name,requires_remarks) VALUES('CERT-WORK','CERT-WORK','Certification Work',false);
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES('CERT-CUSTOMER','CERT-CUSTOMER','Certification Customer','TENANT-LOCAL-001');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES('CERT-PROJECT','CERT-PROJECT','Certification Project','CERT-CUSTOMER','TENANT-LOCAL-001');
INSERT INTO erp.operators(id,name,status,company_id) VALUES('CERT-OPERATOR','Certification Operator','Active','TENANT-LOCAL-001');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading,status_id,cost_code_id,company_id)
VALUES('CERT-EQUIPMENT','CERT-EQ-001','Certification Equipment','Engine Hours',0,'equipment-status-available','CERT-COST','TENANT-LOCAL-001');
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,status,company_id)
VALUES('CERT-ASSIGNMENT','CERT-EQUIPMENT','CERT-OPERATOR','CERT-PROJECT','CERT-ACT','2026-08-22','2026-08-23','Active','TENANT-LOCAL-001');

DO $$
DECLARE created jsonb;terms_result jsonb;submitted jsonb;decided jsonb;reserved jsonb;released jsonb;replayed jsonb;mismatch jsonb;stale_new jsonb;unauthorized jsonb;cross_tenant jsonb;readiness jsonb;stored_fingerprint text;recomputed_fingerprint text;line_id text;released_at_before timestamptz;line_version_before bigint;line_status_before erp.rental_status;snapshot_before jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
 created=erp.command_create_draft_rental('{"commandId":"CERT-RENTAL","idempotencyKey":"CERT-CREATE","customerId":"CERT-CUSTOMER","projectId":"CERT-PROJECT","dateOut":"2026-08-22","expectedReturn":"2026-08-23","rentalType":"Operated Rental","lines":[{"assignmentId":"CERT-ASSIGNMENT"}]}'::jsonb);
 IF created->>'success' IS DISTINCT FROM 'true' OR created#>>'{value,status}' IS DISTINCT FROM 'Draft' OR created#>>'{value,approvalStatus}' IS DISTINCT FROM 'NotSubmitted' THEN RAISE EXCEPTION 'draft create failed: %',created;END IF;
 IF erp.command_create_draft_rental('{"commandId":"CERT-RENTAL","idempotencyKey":"CERT-CREATE","customerId":"CERT-CUSTOMER","projectId":"CERT-PROJECT","dateOut":"2026-08-22","expectedReturn":"2026-08-23","rentalType":"Operated Rental","lines":[{"assignmentId":"CERT-ASSIGNMENT"}]}'::jsonb)->>'disposition' IS DISTINCT FROM 'REPLAYED' THEN RAISE EXCEPTION 'create replay failed';END IF;
 IF erp.command_create_draft_rental('{"commandId":"CERT-OTHER","idempotencyKey":"CERT-CREATE","customerId":"CERT-CUSTOMER","projectId":"CERT-PROJECT","dateOut":"2026-08-22","expectedReturn":"2026-08-24","rentalType":"Operated Rental","lines":[{"assignmentId":"CERT-ASSIGNMENT"}]}'::jsonb)->>'code' IS DISTINCT FROM 'IDEMPOTENCY_MISMATCH' THEN RAISE EXCEPTION 'create mismatch classification failed';END IF;
 SELECT id INTO line_id FROM erp.rental_equipment_lines WHERE rental_id='CERT-RENTAL';
 terms_result=erp.command_update_draft_rental_terms(jsonb_build_object('commandId','CERT-TERMS','idempotencyKey','CERT-TERMS','rentalId','CERT-RENTAL','expectedVersion',1,'lines',jsonb_build_array(jsonb_build_object('lineId',line_id,'commercialTerms',jsonb_build_object('billingMethod','Per Hour','currency','PHP','unitRate',100,'operatorIncluded',true,'transactionRelationship','Non-Affiliate','vatApplicability','Applicable'),'costCodeId','CERT-COST','activityCodeId','CERT-ACT','workDescriptionId','CERT-WORK','deurPolicy',jsonb_build_object('frequency','PER_WORKDAY','effectiveFrom','2026-08-22'),'shiftWindows','[]'::jsonb,'workDate','2026-08-22','meterRequirement','hourMeter'))));
 IF terms_result->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'terms failed: %',terms_result;END IF;
 submitted=erp.command_submit_rental_approval(jsonb_build_object('commandId','CERT-SUBMIT','idempotencyKey','CERT-SUBMIT','rentalId','CERT-RENTAL','expectedVersion',(terms_result#>>'{value,version}')::bigint));
 IF submitted#>>'{value,approvalStatus}' IS DISTINCT FROM 'Pending' THEN RAISE EXCEPTION 'submit failed: %',submitted;END IF;
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
 decided=erp.command_decide_rental_approval(jsonb_build_object('commandId','CERT-DECIDE','idempotencyKey','CERT-DECIDE','rentalId','CERT-RENTAL','expectedVersion',(submitted#>>'{value,version}')::bigint,'decision','Approved','remarks','Certified'));
 IF decided#>>'{value,approvalStatus}' IS DISTINCT FROM 'Approved' THEN RAISE EXCEPTION 'decision failed: %',decided;END IF;
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
 reserved=erp.command_reserve_rental(jsonb_build_object('commandId','CERT-RESERVE','idempotencyKey','CERT-RESERVE','rentalId','CERT-RENTAL','expectedVersion',(decided#>>'{value,version}')::bigint));
 IF reserved#>>'{value,status}' IS DISTINCT FROM 'Reserved' THEN RAISE EXCEPTION 'reserve failed: %',reserved;END IF;
 SELECT operational_metadata#>>'{deurExpectationSnapshot,sourceFingerprint}',erp.current_deur_expectation_fingerprint(id) INTO stored_fingerprint,recomputed_fingerprint FROM erp.rental_equipment_lines WHERE id=line_id;
 RAISE NOTICE 'stored fingerprint: %',stored_fingerprint;
 RAISE NOTICE 'recomputed fingerprint: %',recomputed_fingerprint;
 IF stored_fingerprint IS DISTINCT FROM recomputed_fingerprint THEN RAISE EXCEPTION 'fresh snapshot fingerprint mismatch: stored=%, recomputed=%',stored_fingerprint,recomputed_fingerprint;END IF;
 readiness=erp.rental_release_readiness('CERT-RENTAL');
 RAISE NOTICE 'release readiness: %',readiness;
 IF readiness->>'eligible' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'fresh snapshot readiness failed: %',readiness;END IF;
 released=erp.command_release_rental(jsonb_build_object('commandId','CERT-RELEASE','idempotencyKey','CERT-RELEASE','rentalId','CERT-RENTAL','expectedVersion',(reserved#>>'{value,version}')::bigint));
 RAISE NOTICE 'release result: %',released;
 IF released#>>'{value,status}' IS DISTINCT FROM 'Released' THEN RAISE EXCEPTION 'release failed: %',released;END IF;
 IF (SELECT count(*) FROM erp.audit_log WHERE aggregate_id='CERT-RENTAL' AND action='RELEASE_RENTAL')<>1 THEN RAISE EXCEPTION 'release audit cardinality failed';END IF;
 SELECT released_at INTO released_at_before FROM erp.rentals WHERE id='CERT-RENTAL';
 SELECT row_version,status,operational_metadata->'deurExpectationSnapshot' INTO line_version_before,line_status_before,snapshot_before FROM erp.rental_equipment_lines WHERE id=line_id;
 replayed=erp.command_release_rental(jsonb_build_object('commandId','CERT-RELEASE','idempotencyKey','CERT-RELEASE','rentalId','CERT-RENTAL','expectedVersion',(reserved#>>'{value,version}')::bigint));
 IF replayed->>'disposition' IS DISTINCT FROM 'REPLAYED' THEN RAISE EXCEPTION 'release replay failed: %',replayed;END IF;
 IF replayed-'disposition' IS DISTINCT FROM released-'disposition' THEN RAISE EXCEPTION 'release replay value differs: accepted=%, replayed=%',released,replayed;END IF;
 mismatch=erp.command_release_rental(jsonb_build_object('commandId','CERT-RELEASE-MISMATCH','idempotencyKey','CERT-RELEASE','rentalId','CERT-RENTAL','expectedVersion',999));
 IF mismatch->>'code' IS DISTINCT FROM 'IDEMPOTENCY_MISMATCH' THEN RAISE EXCEPTION 'release mismatch failed: %',mismatch;END IF;
 stale_new=erp.command_release_rental(jsonb_build_object('commandId','CERT-RELEASE-STALE','idempotencyKey','CERT-RELEASE-STALE','rentalId','CERT-RENTAL','expectedVersion',(reserved#>>'{value,version}')::bigint));
 IF stale_new->>'code' IS DISTINCT FROM 'CONFLICT' OR stale_new->>'currentVersion' IS DISTINCT FROM '6' THEN RAISE EXCEPTION 'new stale release failed: %',stale_new;END IF;
 PERFORM set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);
 unauthorized=erp.command_release_rental(jsonb_build_object('commandId','CERT-RELEASE','idempotencyKey','CERT-RELEASE','rentalId','CERT-RENTAL','expectedVersion',(reserved#>>'{value,version}')::bigint));
 IF unauthorized->>'code' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'unauthorized replay leaked: %',unauthorized;END IF;
 PERFORM set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true);
 cross_tenant=erp.command_release_rental(jsonb_build_object('commandId','CERT-RELEASE','idempotencyKey','CERT-RELEASE','rentalId','CERT-RENTAL','expectedVersion',(reserved#>>'{value,version}')::bigint));
 IF cross_tenant->>'code' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'cross-tenant replay leaked: %',cross_tenant;END IF;
 IF (SELECT row_version FROM erp.rentals WHERE id='CERT-RENTAL')<>6 OR (SELECT released_at FROM erp.rentals WHERE id='CERT-RENTAL') IS DISTINCT FROM released_at_before THEN RAISE EXCEPTION 'release retry mutated Rental';END IF;
 IF (SELECT row_version FROM erp.rental_equipment_lines WHERE id=line_id)<>line_version_before OR (SELECT status FROM erp.rental_equipment_lines WHERE id=line_id) IS DISTINCT FROM line_status_before OR (SELECT operational_metadata->'deurExpectationSnapshot' FROM erp.rental_equipment_lines WHERE id=line_id) IS DISTINCT FROM snapshot_before THEN RAISE EXCEPTION 'release retry mutated line or snapshot';END IF;
 IF (SELECT count(*) FROM erp.audit_log WHERE aggregate_id='CERT-RENTAL' AND action='RELEASE_RENTAL')<>1 OR (SELECT count(*) FROM erp.operational_command_idempotency WHERE target_aggregate_id='CERT-RENTAL' AND command_type='RELEASE_RENTAL' AND command_status='COMPLETED')<>1 THEN RAISE EXCEPTION 'release retry cardinality failed';END IF;
 IF (SELECT count(*) FROM erp.audit_log WHERE aggregate_id='CERT-RENTAL' AND action IN('RENTAL_DRAFT_CREATED','RENTAL_TERMS_UPDATED','RENTAL_APPROVAL_SUBMITTED','RENTAL_APPROVED','RENTAL_RESERVED'))<>5 THEN RAISE EXCEPTION 'audit cardinality failed';END IF;
 IF (SELECT count(*) FROM erp.commercial_snapshots WHERE rental_id='CERT-RENTAL')<>1 THEN RAISE EXCEPTION 'snapshot cardinality failed';END IF;
END $$;
ROLLBACK;
