BEGIN;
SET search_path TO erp, public;

CREATE FUNCTION pg_temp.expect_failure(test_name text, statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'passed: % (%)',test_name,SQLSTATE;
    RETURN;
  END;
  RAISE EXCEPTION 'constraint test did not fail: %',test_name;
END $$;

INSERT INTO customers(id,name) VALUES('test-customer','Test');
INSERT INTO projects(id,name,customer_id) VALUES('test-project','Test','test-customer');
INSERT INTO operators(id,name,status) VALUES('test-op-1','Operator 1','Active'),('test-op-2','Operator 2','Active');
INSERT INTO equipment(id,asset_no,equipment_name,maintenance_type,project_id,operator_id) VALUES
 ('test-eq-1','T-001','Equipment 1','Engine Hours','test-project','test-op-1'),('test-eq-2','T-002','Equipment 2','Engine Hours','test-project','test-op-2');
INSERT INTO assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status) VALUES('test-a-1','test-eq-1','test-op-1','test-project','2026-01-01','2026-12-31','Active');
SELECT pg_temp.expect_failure('duplicate active equipment',$q$INSERT INTO assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status) VALUES('bad-a-eq','test-eq-1','test-op-2','test-project','2026-01-01','2026-12-31','Active')$q$);
SELECT pg_temp.expect_failure('duplicate active operator',$q$INSERT INTO assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status) VALUES('bad-a-op','test-eq-2','test-op-1','test-project','2026-01-01','2026-12-31','Active')$q$);

INSERT INTO rentals(id,customer_id,project_id,customer_snapshot,project_snapshot,date_out,status) VALUES
 ('test-r-1','test-customer','test-project','Test','Test','2026-01-01','Released'),('test-r-2','test-customer','test-project','Test','Test','2026-01-01','Draft');
INSERT INTO rental_equipment_lines(id,rental_id,equipment_id,operator_id,status) VALUES('test-line-1','test-r-1','test-eq-1','test-op-1','Released');
SELECT pg_temp.expect_failure('duplicate rental equipment',$q$INSERT INTO rental_equipment_lines(id,rental_id,equipment_id,operator_id,status) VALUES('bad-line-duplicate','test-r-1','test-eq-1','test-op-1','Released')$q$);
SELECT pg_temp.expect_failure('invalid rental status',$q$INSERT INTO rentals(id,customer_snapshot,project_snapshot,date_out,status) VALUES('bad-status','x','x','2026-01-01','INVALID')$q$);
SELECT pg_temp.expect_failure('wrong line identity',$q$INSERT INTO deurs(id,rental_id,rental_equipment_line_id,equipment_id,operator_id,work_date,status) VALUES('bad-deur-line','test-r-2','test-line-1','test-eq-2','test-op-1','2026-01-01','Draft')$q$);

INSERT INTO commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at,snapshot_hash) VALUES('test-snapshot','test-r-1','test-line-1','Per Hour',100,false,'PHP',now(),'hash');
SELECT pg_temp.expect_failure('negative snapshot rate',$q$INSERT INTO commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at) VALUES('bad-negative','test-r-1',NULL,'Per Hour',-1,false,'PHP',now())$q$);
SELECT pg_temp.expect_failure('duplicate line snapshot',$q$INSERT INTO commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at) VALUES('bad-snapshot-duplicate','test-r-1','test-line-1','Per Hour',100,false,'PHP',now())$q$);
SELECT pg_temp.expect_failure('immutable snapshot update',$q$UPDATE commercial_snapshots SET unit_rate=101 WHERE id='test-snapshot'$q$);

INSERT INTO deurs(id,rental_id,rental_equipment_line_id,equipment_id,operator_id,commercial_snapshot_id,work_date,status,revision_chain_id,revision_number) VALUES('test-deur','test-r-1','test-line-1','test-eq-1','test-op-1','test-snapshot','2026-01-02','Acknowledged','test-chain',1);
INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source) VALUES('test-event','test-deur','operation','start',now(),1,'user');
SELECT pg_temp.expect_failure('immutable DEUR evidence',$q$UPDATE deur_events SET sequence=2 WHERE id='test-event'$q$);
SELECT pg_temp.expect_failure('invalid revision chain',$q$INSERT INTO deurs(id,rental_id,equipment_id,operator_id,work_date,status,revision_chain_id,revision_number) VALUES('bad-revision','test-r-1','test-eq-1','test-op-1','2026-01-02','Draft','chain',0)$q$);

INSERT INTO billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,subtotal,vat,withholding_tax,grand_total,approval_status,invoice_status,created_by) VALUES('test-bs','TEST-BS','test-r-1','Test','Test','2026-01-01','2026-01-31',100,12,2,110,'Draft','Not Invoiced','test');
INSERT INTO billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,work_date,description,amount,vat,withholding_tax,grand_total) VALUES('test-bsl','test-bs','test-line-1','test-eq-1','test-deur','2026-01-02','Test',100,12,2,110);
SELECT pg_temp.expect_failure('duplicate DEUR consumption',$q$INSERT INTO billing_statement_lines(id,billing_statement_id,deur_id,work_date,description,amount,grand_total) VALUES('bad-consumption','test-bs','test-deur','2026-01-02','Duplicate',100,100)$q$);
SELECT pg_temp.expect_failure('orphan statement line',$q$INSERT INTO billing_statement_lines(id,billing_statement_id,deur_id,work_date,description,amount,grand_total) VALUES('bad-orphan','missing','test-deur','2026-01-02','Orphan',100,100)$q$);
UPDATE billing_statements SET approval_status='Approved' WHERE id='test-bs';
SELECT pg_temp.expect_failure('final billing evidence mutation',$q$UPDATE billing_statement_lines SET amount=99 WHERE id='test-bsl'$q$);

-- A normal workflow reached finalized billing; row version is server-controlled.
DO $$ DECLARE v bigint; BEGIN SELECT row_version INTO v FROM billing_statements WHERE id='test-bs'; IF v<>2 THEN RAISE EXCEPTION 'row version trigger failed'; END IF; END $$;
ROLLBACK;
