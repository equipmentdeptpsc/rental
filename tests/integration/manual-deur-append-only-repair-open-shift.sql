-- Run only against the disposable local baseline after 00400 and 00500.
-- The fixture is rolled back so it never becomes persistent local evidence.
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
SET LOCAL erp.repair_expectation TO :'repair_expectation';
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000606';
SET LOCAL session_replication_role=replica;

INSERT INTO erp.companies(id,code,name,environment_class)
VALUES('LOCAL-REPAIR-00600','LOCAL-REPAIR-00600','Local repair proof','test');
INSERT INTO erp.users(id,username,display_name,status,company_id,email)
VALUES('00000000-0000-4000-8000-000000000606','local-repair-00600','Local Repair Proof','active','LOCAL-REPAIR-00600','local-repair-00600@example.test');
INSERT INTO erp.app_roles(id,code,name) VALUES('LOCAL-REPAIR-00600-ROLE','local-repair-00600','Local Repair Proof');
INSERT INTO erp.app_permissions(id,code,name) VALUES('LOCAL-REPAIR-00600-PERM','deur.correct','Correct DEUR');
INSERT INTO erp.role_permissions(role_id,permission_id) VALUES('LOCAL-REPAIR-00600-ROLE','LOCAL-REPAIR-00600-PERM');
INSERT INTO erp.user_roles(user_id,role_id) VALUES('00000000-0000-4000-8000-000000000606','LOCAL-REPAIR-00600-ROLE');
INSERT INTO erp.operators(id,name,status,company_id)
VALUES('LOCAL-OPERATOR','Local operator','Active','LOCAL-REPAIR-00600');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id)
VALUES('LOCAL-EQUIPMENT','LOCAL-REPAIR-00600-EQP','Local equipment','Engine Hours','LOCAL-REPAIR-00600');
INSERT INTO erp.rentals(id,rental_number,customer_snapshot,project_snapshot,date_out,status,company_id)
VALUES('LOCAL-RENTAL','LOCAL-REPAIR-00600-RENT','Local customer','Local project','2026-09-28','Active','LOCAL-REPAIR-00600');

INSERT INTO erp.deurs(id,deur_number,rental_id,equipment_id,operator_id,work_date,status,creation_source,operational_metadata,revision_chain_id,revision_number,created_at,updated_at,company_id)
VALUES
('LOCAL-REPAIR-00600-SOURCE','LOCAL-REPAIR-00600-SOURCE','LOCAL-RENTAL','LOCAL-EQUIPMENT','LOCAL-OPERATOR','2026-09-28','Rejected','MANUAL_WEB','{"sourceDocument":"PHYSICAL_DEUR"}','LOCAL-REPAIR-00600-CHAIN',1,'2026-09-28 13:35:00+00','2026-09-28 13:36:00+00','LOCAL-REPAIR-00600'),
('LOCAL-REPAIR-00600-TARGET','LOCAL-REPAIR-00600-TARGET','LOCAL-RENTAL','LOCAL-EQUIPMENT','LOCAL-OPERATOR','2026-09-28','In Progress','MANUAL_WEB','{"sourceDocument":"PHYSICAL_DEUR"}','LOCAL-REPAIR-00600-CHAIN',2,'2026-09-29 02:33:58+00','2026-09-29 02:33:58+00','LOCAL-REPAIR-00600');
UPDATE erp.deurs SET previous_revision_id='LOCAL-REPAIR-00600-SOURCE' WHERE id='LOCAL-REPAIR-00600-TARGET';

INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,is_open,company_id)
VALUES
('LOCAL-REPAIR-00600-S1','LOCAL-REPAIR-00600-SOURCE','shift','start','2026-09-28 13:35:00+00',1,'manual-web','00000000-0000-4000-8000-000000000606','2026-09-28 13:35:00+00',true,'LOCAL-REPAIR-00600'),
('LOCAL-REPAIR-00600-S2','LOCAL-REPAIR-00600-SOURCE','operation','start','2026-09-28 13:35:00+00',2,'manual-web','00000000-0000-4000-8000-000000000606','2026-09-28 13:35:00+00',false,'LOCAL-REPAIR-00600'),
('LOCAL-REPAIR-00600-S3','LOCAL-REPAIR-00600-SOURCE','operation','end','2026-09-28 13:36:00+00',3,'manual-web','00000000-0000-4000-8000-000000000606','2026-09-28 13:36:00+00',false,'LOCAL-REPAIR-00600'),
('LOCAL-REPAIR-00600-S4','LOCAL-REPAIR-00600-SOURCE','shift','end','2026-09-28 13:36:00+00',4,'manual-web','00000000-0000-4000-8000-000000000606','2026-09-28 13:36:00+00',false,'LOCAL-REPAIR-00600'),
('LOCAL-REPAIR-00600-T1','LOCAL-REPAIR-00600-TARGET','shift','start','2026-09-29 02:33:58+00',1,'manual-web','00000000-0000-4000-8000-000000000606','2026-09-29 02:33:58+00',true,'LOCAL-REPAIR-00600'),
('LOCAL-REPAIR-00600-T2','LOCAL-REPAIR-00600-TARGET','operation','start','2026-09-28 13:35:00+00',2,'manual-web','00000000-0000-4000-8000-000000000606','2026-09-28 13:35:00+00',false,'LOCAL-REPAIR-00600'),
('LOCAL-REPAIR-00600-T3','LOCAL-REPAIR-00600-TARGET','operation','end','2026-09-28 13:36:00+00',3,'manual-web','00000000-0000-4000-8000-000000000606','2026-09-28 13:36:00+00',false,'LOCAL-REPAIR-00600'),
('LOCAL-REPAIR-00600-T4','LOCAL-REPAIR-00600-TARGET','shift','end','2026-09-28 13:36:00+00',4,'manual-web','00000000-0000-4000-8000-000000000606','2026-09-28 13:36:00+00',false,'LOCAL-REPAIR-00600');
SET LOCAL session_replication_role=origin;

-- The caller supplies the assertion predicate from psql via repair_expectation.
DO $$
DECLARE result jsonb;
BEGIN
  BEGIN
    result:=erp.command_repair_manual_deur_correction_physical_occurrence(jsonb_build_object(
      'commandId','LOCAL-REPAIR-00600-CMD','idempotencyKey','LOCAL-REPAIR-00600-IDEM',
      'deurId','LOCAL-REPAIR-00600-TARGET','expectedVersion',1));
    IF current_setting('erp.repair_expectation',true)='failure' THEN
      RAISE EXCEPTION 'expected uq_deur_open_shift failure, got %',result;
    END IF;
    IF result->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'repair did not succeed: %',result; END IF;
  EXCEPTION WHEN unique_violation THEN
    IF current_setting('erp.repair_expectation',true)<>'failure' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%uq_deur_open_shift%' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE raw_count integer; effective_count integer; effective_open_count integer; supersession_count integer; audit_count integer; open_shift_count integer; validation text; calculated record;
BEGIN
  SELECT count(*) INTO raw_count FROM erp.deur_events WHERE deur_id='LOCAL-REPAIR-00600-TARGET';
  SELECT count(*) INTO effective_count FROM erp.effective_deur_events('LOCAL-REPAIR-00600-TARGET');
  SELECT count(*) INTO effective_open_count
  FROM erp.effective_deur_events('LOCAL-REPAIR-00600-TARGET')
  WHERE is_open;
  SELECT count(*) INTO supersession_count FROM erp.deur_event_supersessions WHERE deur_id='LOCAL-REPAIR-00600-TARGET';
  SELECT count(*) INTO audit_count FROM erp.audit_log WHERE aggregate_id='LOCAL-REPAIR-00600-TARGET' AND action='DEUR_CORRECTION_PHYSICAL_OCCURRENCE_REPAIRED';
  SELECT count(*) INTO open_shift_count FROM erp.deur_events WHERE deur_id='LOCAL-REPAIR-00600-TARGET' AND activity_type='shift' AND is_open;
  IF current_setting('erp.repair_expectation',true)='failure' THEN
    IF raw_count<>4 OR effective_count<>4 OR supersession_count<>0 OR audit_count<>0 OR open_shift_count<>1 THEN
      RAISE EXCEPTION 'failed repair was not atomic: raw %, effective %, supersession %, audit %, open shifts %',raw_count,effective_count,supersession_count,audit_count,open_shift_count;
    END IF;
  ELSE
    SELECT * INTO calculated FROM erp.recalculate_deur_event_totals('LOCAL-REPAIR-00600-TARGET');
    validation:=erp.validate_manual_deur_physical_timeline((SELECT d FROM erp.deurs d WHERE d.id='LOCAL-REPAIR-00600-TARGET'));
    IF raw_count<>5 OR effective_count<>4 OR effective_open_count<>0 OR supersession_count<>1 OR audit_count<>1 OR open_shift_count<>1
       OR validation IS NOT NULL OR calculated.operation_minutes<>1 THEN
      RAISE EXCEPTION 'repaired state invalid: raw %, effective %, effective open %, supersession %, audit %, open shifts %, validation %, operation %',raw_count,effective_count,effective_open_count,supersession_count,audit_count,open_shift_count,validation,calculated.operation_minutes;
    END IF;
  END IF;
END $$;
SET LOCAL session_replication_role=replica;
DO $$
DECLARE rejected_shift boolean:=false; rejected_operation boolean:=false;
BEGIN
  IF current_setting('erp.repair_expectation',true)<>'success' THEN RETURN; END IF;
  BEGIN
    INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,server_accepted_at,is_open,company_id)
    VALUES('LOCAL-REPAIR-00600-DUP-SHIFT','LOCAL-REPAIR-00600-TARGET','shift','start','2026-09-28 13:37:00+00',6,'live','2026-09-28 13:37:00+00',true,'LOCAL-REPAIR-00600');
  EXCEPTION WHEN unique_violation THEN rejected_shift:=true;
  END;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,server_accepted_at,is_open,company_id)
  VALUES('LOCAL-REPAIR-00600-OPEN-OPERATION','LOCAL-REPAIR-00600-TARGET','operation','start','2026-09-28 13:37:00+00',6,'live','2026-09-28 13:37:00+00',true,'LOCAL-REPAIR-00600');
  BEGIN
    INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,server_accepted_at,is_open,company_id)
    VALUES('LOCAL-REPAIR-00600-DUP-OPERATION','LOCAL-REPAIR-00600-TARGET','operation','start','2026-09-28 13:38:00+00',7,'live','2026-09-28 13:38:00+00',true,'LOCAL-REPAIR-00600');
  EXCEPTION WHEN unique_violation THEN rejected_operation:=true;
  END;
  IF NOT rejected_shift OR NOT rejected_operation THEN
    RAISE EXCEPTION 'live open-shift/open-operation uniqueness regressed: shift %, operation %',rejected_shift,rejected_operation;
  END IF;
END $$;
SET LOCAL session_replication_role=origin;
ROLLBACK;
