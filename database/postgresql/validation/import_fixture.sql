BEGIN;
SET search_path TO erp, public;

INSERT INTO migration_import_batches(id,manifest_version,application_schema_version,source_application_version,repository_catalog_version,exported_at,manifest_checksum,status)
VALUES('fixture-batch',1,1,'phase10c-fixture',1,'2026-01-01T00:00:00Z','fixture-manifest-sha256','Validated');

INSERT INTO migration_staging_records(batch_id,source_repository,source_storage_key,source_record_id,source_schema_version,dependency_order,raw_payload,source_checksum,validation_status,transformation_status,imported_table,imported_record_id,validated_at,transformed_at,imported_at) VALUES
 ('fixture-batch','Customer','customer_records','fixture-customer',1,1,'{"id":"fixture-customer"}','c1','Valid','Imported','customers','fixture-customer',now(),now(),now()),
 ('fixture-batch','Project','projects','fixture-project',1,2,'{"id":"fixture-project"}','c2','Valid','Imported','projects','fixture-project',now(),now(),now()),
 ('fixture-batch','Operator','operators','fixture-operator',1,3,'{"id":"fixture-operator"}','c3','Valid','Imported','operators','fixture-operator',now(),now(),now()),
 ('fixture-batch','Equipment','equipment-records','fixture-equipment',1,4,'{"id":"fixture-equipment"}','c4','Valid','Imported','equipment','fixture-equipment',now(),now(),now()),
 ('fixture-batch','Assignment','assignments','fixture-assignment',1,5,'{"id":"fixture-assignment"}','c5','Valid','Imported','assignments','fixture-assignment',now(),now(),now()),
 ('fixture-batch','Rental','equipment-rental-records','fixture-rental',1,6,'{"id":"fixture-rental"}','c6','Valid','Imported','rentals','fixture-rental',now(),now(),now()),
 ('fixture-batch','RentalEquipmentLine','equipment-rental-equipment-lines','fixture-line',1,7,'{"id":"fixture-line"}','c7','Valid','Imported','rental_equipment_lines','fixture-line',now(),now(),now()),
 ('fixture-batch','CommercialSnapshot','embedded:Rental','fixture-snapshot',1,8,'{"billingMethod":"Per Hour","unitRate":100,"operatorIncluded":false,"currency":"PHP","capturedAt":"2026-01-02T00:00:00Z"}','53c3153a72fe3c918a50e412270f5319b8787473a273cf5e271233783a39e0ea','Valid','Imported','commercial_snapshots','fixture-snapshot',now(),now(),now()),
 ('fixture-batch','DEUR','equipment-rental-deur','fixture-deur',1,9,'{"id":"fixture-deur","revision":{"chainId":"fixture-chain","revisionNumber":2}}','c9','Valid','Imported','deurs','fixture-deur',now(),now(),now()),
 ('fixture-batch','BillingStatement','equipment-rental-billing-statements','fixture-statement',1,10,'{"id":"fixture-statement","subtotal":800,"vat":96,"withholdingTax":16,"grandTotal":880}','c10','Valid','Imported','billing_statements','fixture-statement',now(),now(),now()),
 ('fixture-batch','BillingStatementLine','embedded:BillingStatement','fixture-statement-line',1,11,'{"id":"fixture-statement-line","deurId":"fixture-deur","rentalEquipmentLineId":"fixture-line","amount":800,"vat":96,"withholdingTax":16,"grandTotal":880}','c11','Valid','Imported','billing_statement_lines','fixture-statement-line',now(),now(),now());

INSERT INTO customers(id,name,created_at) VALUES('fixture-customer','Fixture Customer','2025-01-01T00:00:00Z');
INSERT INTO projects(id,name,customer_id,created_at) VALUES('fixture-project','Fixture Project','fixture-customer','2025-01-01T00:01:00Z');
INSERT INTO operators(id,name,status,created_at) VALUES('fixture-operator','Fixture Operator','Active','2025-01-01T00:02:00Z');
INSERT INTO equipment(id,asset_no,equipment_name,maintenance_type,current_reading,project_id,operator_id,created_at) VALUES('fixture-equipment','FX-001','Fixture Equipment','Engine Hours',100,'fixture-project','fixture-operator','2025-01-01T00:03:00Z');
INSERT INTO assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,created_at) VALUES('fixture-assignment','fixture-equipment','fixture-operator','fixture-project','2026-01-01','2026-12-31','Active','2025-01-01T00:04:00Z');
INSERT INTO rentals(id,rental_number,customer_id,project_id,assignment_id,customer_snapshot,project_snapshot,date_out,status,released_at,created_at) VALUES('fixture-rental','RENT-FX','fixture-customer','fixture-project','fixture-assignment','Fixture Customer','Fixture Project','2026-01-01','Released','2026-01-02T00:00:00Z','2025-01-01T00:05:00Z');
INSERT INTO rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,created_at) VALUES('fixture-line','fixture-rental','fixture-equipment','fixture-assignment','fixture-operator','Released','2025-01-01T00:06:00Z');
INSERT INTO commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at,created_at,snapshot_hash) VALUES('fixture-snapshot','fixture-rental','fixture-line','Per Hour',100,false,'PHP','2026-01-02T00:00:00Z','2026-01-02T00:00:00Z','53c3153a72fe3c918a50e412270f5319b8787473a273cf5e271233783a39e0ea');
INSERT INTO deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,work_date,status,revision_chain_id,revision_number,original_deur_id,created_at) VALUES('fixture-deur','DEUR-FX','fixture-rental','fixture-line','fixture-assignment','fixture-equipment','fixture-operator','fixture-project','fixture-customer','fixture-snapshot','2026-01-03','Acknowledged','fixture-chain',2,'fixture-deur-original','2026-01-03T00:00:00Z');
INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source) VALUES('fixture-event','fixture-deur','operation','start','2026-01-03T01:00:00Z',1,'legacy');
INSERT INTO billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,subtotal,vat,withholding_tax,grand_total,approval_status,invoice_status,created_by,created_at) VALUES('fixture-statement','BS-FX','fixture-rental','Fixture Customer','Fixture Project','2026-01-01','2026-01-31',800,96,16,880,'Approved','Not Invoiced','fixture-user','2026-02-01T00:00:00Z');
INSERT INTO billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,deur_revision_chain_id,deur_revision_number,effective_deur_id,work_date,description,billing_method,hours,hourly_rate,amount,vat,withholding_tax,grand_total,created_at) VALUES('fixture-statement-line','fixture-statement','fixture-line','fixture-equipment','fixture-deur','fixture-operator','fixture-chain',2,'fixture-deur','2026-01-03','Fixture persisted evidence','Per Hour',8,100,800,96,16,880,'2026-02-01T00:00:00Z');
UPDATE deurs SET billing_locked=true,billing_statement_id='fixture-statement',updated_at='2026-02-01T00:00:00Z' WHERE id='fixture-deur';

DO $$ BEGIN
 IF (SELECT subtotal FROM billing_statements WHERE id='fixture-statement')<>800 THEN RAISE EXCEPTION 'billing subtotal changed'; END IF;
 IF (SELECT snapshot_hash FROM commercial_snapshots WHERE id='fixture-snapshot')<>'53c3153a72fe3c918a50e412270f5319b8787473a273cf5e271233783a39e0ea' THEN RAISE EXCEPTION 'snapshot hash changed'; END IF;
 IF (SELECT revision_number FROM deurs WHERE id='fixture-deur')<>2 THEN RAISE EXCEPTION 'DEUR revision changed'; END IF;
END $$;
COMMIT;
