BEGIN;

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Billing lineage certification failed: %',label; END IF;
  RETURN 1;
END $$;

INSERT INTO erp.companies(id,code,name,environment_class) VALUES
('TENANT-LINEAGE-A','LINEAGE-A','Lineage A','test'),
('TENANT-LINEAGE-B','LINEAGE-B','Lineage B','test');
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES
('LINEAGE-CUSTOMER-A','LINEAGE-CUST-A','Customer A','TENANT-LINEAGE-A'),
('LINEAGE-CUSTOMER-B','LINEAGE-CUST-B','Customer B','TENANT-LINEAGE-B');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES
('LINEAGE-PROJECT-A','LINEAGE-PROJ-A','Project A','LINEAGE-CUSTOMER-A','TENANT-LINEAGE-A'),
('LINEAGE-PROJECT-B','LINEAGE-PROJ-B','Project B','LINEAGE-CUSTOMER-B','TENANT-LINEAGE-B');
INSERT INTO erp.operators(id,name,status,company_id) VALUES
('LINEAGE-OP-A','Original Operator','Active','TENANT-LINEAGE-A'),
('LINEAGE-OP-A2','Replacement Operator','Active','TENANT-LINEAGE-A'),
('LINEAGE-OP-B','Foreign Operator','Active','TENANT-LINEAGE-B');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES
('LINEAGE-EQ-A','ASSET-ORIGINAL','Original Equipment','None','TENANT-LINEAGE-A'),
('LINEAGE-EQ-A2','ASSET-SECOND','Second Equipment','None','TENANT-LINEAGE-A'),
('LINEAGE-EQ-B','ASSET-FOREIGN','Foreign Equipment','None','TENANT-LINEAGE-B');
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,status,company_id) VALUES
('LINEAGE-ASG-A','LINEAGE-EQ-A','LINEAGE-OP-A','LINEAGE-PROJECT-A','2026-08-26','Active','TENANT-LINEAGE-A'),
('LINEAGE-ASG-A2','LINEAGE-EQ-A2','LINEAGE-OP-A2','LINEAGE-PROJECT-A','2026-08-26','Active','TENANT-LINEAGE-A'),
('LINEAGE-ASG-B','LINEAGE-EQ-B','LINEAGE-OP-B','LINEAGE-PROJECT-B','2026-08-26','Active','TENANT-LINEAGE-B');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id) VALUES
('LINEAGE-RENTAL-A','RNT-LINEAGE-A','LINEAGE-CUSTOMER-A','LINEAGE-PROJECT-A','Customer A','Project A','2026-08-26','Operated Rental','Active','TENANT-LINEAGE-A'),
('LINEAGE-RENTAL-B','RNT-LINEAGE-B','LINEAGE-CUSTOMER-B','LINEAGE-PROJECT-B','Customer B','Project B','2026-08-26','Operated Rental','Active','TENANT-LINEAGE-B');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id) VALUES
('LINEAGE-LINE-A','LINEAGE-RENTAL-A','LINEAGE-EQ-A','LINEAGE-ASG-A','LINEAGE-OP-A','Active','TENANT-LINEAGE-A'),
('LINEAGE-LINE-A2','LINEAGE-RENTAL-A','LINEAGE-EQ-A2','LINEAGE-ASG-A2','LINEAGE-OP-A2','Active','TENANT-LINEAGE-A'),
('LINEAGE-LINE-B','LINEAGE-RENTAL-B','LINEAGE-EQ-B','LINEAGE-ASG-B','LINEAGE-OP-B','Active','TENANT-LINEAGE-B');
INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at,snapshot_hash) VALUES
('LINEAGE-SNAP-A','LINEAGE-RENTAL-A','LINEAGE-LINE-A','Per Hour',100,true,'PHP',now(),'LINEAGE-HASH-A'),
('LINEAGE-SNAP-A2','LINEAGE-RENTAL-A','LINEAGE-LINE-A2','Per Hour',200,true,'PHP',now(),'LINEAGE-HASH-A2'),
('LINEAGE-SNAP-B','LINEAGE-RENTAL-B','LINEAGE-LINE-B','Per Hour',300,true,'PHP',now(),'LINEAGE-HASH-B');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,assignment_id,operator_id,project_id,customer_id,commercial_snapshot_id,work_date,status,evidence_mode,billing_method_snapshot,billing_locked,superseded_by_revision_id,company_id) VALUES
('LINEAGE-DEUR-A','DEUR-LINEAGE-A','LINEAGE-RENTAL-A','LINEAGE-LINE-A','LINEAGE-EQ-A','LINEAGE-ASG-A','LINEAGE-OP-A','LINEAGE-PROJECT-A','LINEAGE-CUSTOMER-A','LINEAGE-SNAP-A','2026-08-26','Acknowledged','TIME_TIMELINE','Per Hour',false,NULL,'TENANT-LINEAGE-A'),
('LINEAGE-DEUR-A2','DEUR-LINEAGE-A2','LINEAGE-RENTAL-A','LINEAGE-LINE-A2','LINEAGE-EQ-A2','LINEAGE-ASG-A2','LINEAGE-OP-A2','LINEAGE-PROJECT-A','LINEAGE-CUSTOMER-A','LINEAGE-SNAP-A2','2026-08-27','Acknowledged','TIME_TIMELINE','Per Hour',false,NULL,'TENANT-LINEAGE-A'),
('LINEAGE-DEUR-B','DEUR-LINEAGE-B','LINEAGE-RENTAL-B','LINEAGE-LINE-B','LINEAGE-EQ-B','LINEAGE-ASG-B','LINEAGE-OP-B','LINEAGE-PROJECT-B','LINEAGE-CUSTOMER-B','LINEAGE-SNAP-B','2026-08-26','Acknowledged','TIME_TIMELINE','Per Hour',false,NULL,'TENANT-LINEAGE-B');
INSERT INTO erp.billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,subtotal,grand_total,approval_status,invoice_status,created_by,company_id) VALUES
('LINEAGE-STMT-A','BS-LINEAGE-A','LINEAGE-RENTAL-A','Customer A','Project A','2026-08-26','2026-08-27',0,0,'Draft','Not Invoiced','cert','TENANT-LINEAGE-A'),
('LINEAGE-STMT-B','BS-LINEAGE-B','LINEAGE-RENTAL-B','Customer B','Project B','2026-08-26','2026-08-26',0,0,'Draft','Not Invoiced','cert','TENANT-LINEAGE-B');

INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,commercial_terms_source,amount,grand_total,company_id)
VALUES('LINEAGE-BILL-A','LINEAGE-STMT-A','LINEAGE-LINE-A','LINEAGE-EQ-A','LINEAGE-DEUR-A','LINEAGE-OP-A','2026-08-26','Canonical line','IMMUTABLE_SNAPSHOT',100,100,'TENANT-LINEAGE-A');
SELECT pg_temp.assert_true((SELECT commercial_snapshot_id='LINEAGE-SNAP-A' AND commercial_snapshot_hash='LINEAGE-HASH-A' AND rental_number_snapshot='RNT-LINEAGE-A' AND equipment_snapshot->>'assetNo'='ASSET-ORIGINAL' AND operator_snapshot->>'name'='Original Operator' AND rental_equipment_line_snapshot->>'assignmentId'='LINEAGE-ASG-A' FROM erp.billing_statement_lines WHERE id='LINEAGE-BILL-A'),'complete snapshots captured');

UPDATE erp.equipment SET asset_no='ASSET-RENAMED',equipment_name='Renamed Equipment' WHERE id='LINEAGE-EQ-A';
UPDATE erp.operators SET name='Renamed Operator' WHERE id='LINEAGE-OP-A';
UPDATE erp.assignments SET status='Completed',returned_date='2026-08-27' WHERE id='LINEAGE-ASG-A';
UPDATE erp.rental_equipment_lines SET assignment_id='LINEAGE-ASG-A2',operator_id='LINEAGE-OP-A2' WHERE id='LINEAGE-LINE-A';
SELECT pg_temp.assert_true((SELECT equipment_snapshot->>'assetNo'='ASSET-ORIGINAL' AND operator_snapshot->>'name'='Original Operator' AND rental_equipment_line_snapshot->>'assignmentId'='LINEAGE-ASG-A' FROM erp.billing_statement_lines WHERE id='LINEAGE-BILL-A'),'snapshots survive mutable master changes');

DO $$ BEGIN
  BEGIN
    UPDATE erp.billing_statement_lines SET equipment_snapshot='{}'::jsonb WHERE id='LINEAGE-BILL-A';
    RAISE EXCEPTION 'expected immutable lineage rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'BILLING_LINEAGE_IMMUTABLE' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,commercial_terms_source,amount,grand_total,company_id)
    VALUES('LINEAGE-BILL-CROSS','LINEAGE-STMT-A','LINEAGE-LINE-B','LINEAGE-EQ-B','LINEAGE-DEUR-B','LINEAGE-OP-B','2026-08-26','Cross tenant','IMMUTABLE_SNAPSHOT',1,1,'TENANT-LINEAGE-A');
    RAISE EXCEPTION 'expected cross-tenant rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CANONICAL_BILLING_LINEAGE_MISMATCH' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  UPDATE erp.deurs SET status='Submitted' WHERE id='LINEAGE-DEUR-A2';
  BEGIN
    INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,commercial_terms_source,amount,grand_total,company_id)
    VALUES('LINEAGE-BILL-UNACK','LINEAGE-STMT-A','LINEAGE-LINE-A2','LINEAGE-EQ-A2','LINEAGE-DEUR-A2','LINEAGE-OP-A2','2026-08-27','Unacknowledged','IMMUTABLE_SNAPSHOT',1,1,'TENANT-LINEAGE-A');
    RAISE EXCEPTION 'expected unacknowledged rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CANONICAL_BILLING_LINEAGE_MISMATCH' THEN RAISE; END IF;
  END;
  UPDATE erp.deurs SET status='Acknowledged',billing_locked=true WHERE id='LINEAGE-DEUR-A2';
  BEGIN
    INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,commercial_terms_source,amount,grand_total,company_id)
    VALUES('LINEAGE-BILL-LOCKED','LINEAGE-STMT-A','LINEAGE-LINE-A2','LINEAGE-EQ-A2','LINEAGE-DEUR-A2','LINEAGE-OP-A2','2026-08-27','Locked','IMMUTABLE_SNAPSHOT',1,1,'TENANT-LINEAGE-A');
    RAISE EXCEPTION 'expected billed rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CANONICAL_BILLING_LINEAGE_MISMATCH' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  UPDATE erp.deurs SET billing_locked=false,superseded_by_revision_id='LINEAGE-DEUR-A2' WHERE id='LINEAGE-DEUR-A2';
  BEGIN
    INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,commercial_terms_source,amount,grand_total,company_id)
    VALUES('LINEAGE-BILL-SUPERSEDED','LINEAGE-STMT-A','LINEAGE-LINE-A2','LINEAGE-EQ-A2','LINEAGE-DEUR-A2','LINEAGE-OP-A2','2026-08-27','Superseded','IMMUTABLE_SNAPSHOT',1,1,'TENANT-LINEAGE-A');
    RAISE EXCEPTION 'expected superseded rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CANONICAL_BILLING_LINEAGE_MISMATCH' THEN RAISE; END IF;
  END;
  UPDATE erp.deurs SET superseded_by_revision_id=NULL WHERE id='LINEAGE-DEUR-A2';
  UPDATE erp.assignments SET operator_id='LINEAGE-OP-A' WHERE id='LINEAGE-ASG-A2';
  BEGIN
    INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,commercial_terms_source,amount,grand_total,company_id)
    VALUES('LINEAGE-BILL-ASG-MISMATCH','LINEAGE-STMT-A','LINEAGE-LINE-A2','LINEAGE-EQ-A2','LINEAGE-DEUR-A2','LINEAGE-OP-A2','2026-08-27','Assignment mismatch','IMMUTABLE_SNAPSHOT',1,1,'TENANT-LINEAGE-A');
    RAISE EXCEPTION 'expected assignment mismatch rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CANONICAL_BILLING_ASSIGNMENT_MISMATCH' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,commercial_terms_source,amount,grand_total,company_id)
    VALUES('LINEAGE-BILL-WRONG-LINE','LINEAGE-STMT-A','LINEAGE-LINE-A','LINEAGE-EQ-A','LINEAGE-DEUR-A2','LINEAGE-OP-A2','2026-08-27','Wrong line','IMMUTABLE_SNAPSHOT',1,1,'TENANT-LINEAGE-A');
    RAISE EXCEPTION 'expected line mismatch rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CANONICAL_BILLING_LINEAGE_MISMATCH' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.assert_true((SELECT count(*) FROM erp.billing_statement_lines WHERE id LIKE 'LINEAGE-BILL-%')=1,'negative cases leave no rows');

ROLLBACK;

SELECT 1/(CASE WHEN (SELECT count(*) FROM erp.companies WHERE id LIKE 'TENANT-LINEAGE-%')=0 THEN 1 ELSE 0 END);
