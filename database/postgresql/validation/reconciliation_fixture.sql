BEGIN;
SET search_path TO erp, public;
INSERT INTO customers(id,name) VALUES('recon-c','Recon');
INSERT INTO projects(id,name,customer_id) VALUES('recon-p','Recon','recon-c');
INSERT INTO operators(id,name,status) VALUES('recon-o','Recon','Active');
INSERT INTO equipment(id,asset_no,equipment_name,maintenance_type,project_id,operator_id) VALUES('recon-e','RECON','Recon','Engine Hours','recon-p','recon-o');
INSERT INTO equipment(id,asset_no,equipment_name,maintenance_type,project_id,operator_id) VALUES('recon-e-2','RECON-2','Recon 2','Engine Hours','recon-p','recon-o');
INSERT INTO rentals(id,customer_snapshot,project_snapshot,date_out,status) VALUES
 ('recon-r-no-line','Recon','Recon','2026-01-01','Draft'),
 ('recon-r-line','Recon','Recon','2026-01-01','Released');
INSERT INTO rental_equipment_lines(id,rental_id,equipment_id,operator_id,status) VALUES('recon-line','recon-r-line','recon-e','recon-o','Released');
INSERT INTO rental_equipment_lines(id,rental_id,equipment_id,operator_id,status) VALUES('recon-line-no-snapshot','recon-r-line','recon-e-2','recon-o','Released');
INSERT INTO deurs(id,rental_id,equipment_id,operator_id,work_date,status,legacy) VALUES('recon-deur-no-line','recon-r-line','recon-e','recon-o','2026-01-01','Acknowledged',false);
INSERT INTO deurs(id,rental_id,rental_equipment_line_id,equipment_id,operator_id,work_date,shift,status) VALUES
 ('recon-deur-dup-1','recon-r-line','recon-line','recon-e','recon-o','2026-01-02','Day','Draft'),
 ('recon-deur-dup-2','recon-r-line','recon-line','recon-e','recon-o','2026-01-02','Day','Draft');
INSERT INTO commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at,snapshot_hash) VALUES('recon-snapshot','recon-r-line','recon-line','Per Hour',1,false,'PHP',now(),NULL);
INSERT INTO billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,subtotal,vat,withholding_tax,grand_total,approval_status,invoice_status,created_by) VALUES('recon-bs','RECON-BS','recon-r-line','Recon','Recon','2026-01-01','2026-01-31',100,12,2,110,'Draft','Invoiced','recon');
INSERT INTO billing_statement_lines(id,billing_statement_id,deur_id,work_date,description,amount,vat,withholding_tax,grand_total) VALUES('recon-bsl','recon-bs','recon-deur-dup-1','2026-01-02','Mismatch',90,10,1,99);
INSERT INTO collections(id,billing_statement_id,amount,currency,collected_at) VALUES('recon-collection','recon-bs',200,'PHP',now());
INSERT INTO audit_log(id,aggregate_type,aggregate_id,action) VALUES('recon-audit','Rental','recon-r-line','fixture');
INSERT INTO migration_import_batches(id,manifest_version,application_schema_version,source_application_version,repository_catalog_version,exported_at,manifest_checksum) VALUES('recon-batch',1,1,'fixture',1,now(),'recon-manifest');
INSERT INTO migration_staging_records(batch_id,source_repository,source_storage_key,source_record_id,source_schema_version,dependency_order,raw_payload,source_checksum) VALUES('recon-batch','Rental','rentals','unresolved',1,1,'{}','recon');
SELECT 'expected_reconciliation_exceptions' validation,
  (SELECT count(*) FROM rentals r WHERE r.status<>'Cancelled' AND NOT EXISTS(SELECT 1 FROM rental_equipment_lines l WHERE l.rental_id=r.id AND l.deleted_at IS NULL)) rentals_without_lines,
  (SELECT count(*) FROM rental_equipment_lines l WHERE l.status IN ('Released','Active','Returned','Closed') AND NOT EXISTS(SELECT 1 FROM commercial_snapshots s WHERE s.rental_equipment_line_id=l.id)) released_lines_without_snapshots,
  (SELECT count(*) FROM deurs WHERE rental_equipment_line_id IS NULL AND legacy=false) deurs_without_lines,
  (SELECT count(*) FROM commercial_snapshots WHERE snapshot_hash IS NULL OR snapshot_hash='') missing_snapshot_hashes,
  (SELECT count(*) FROM audit_log WHERE actor_id IS NULL AND actor_name IS NULL) audit_actors_missing,
  (SELECT count(*) FROM migration_staging_records WHERE validation_status<>'Valid' OR transformation_status NOT IN ('Ready','Imported')) unresolved_staging;
ROLLBACK;

-- Identity mismatches, duplicate Rental Equipment Lines, duplicate DEUR
-- consumption, and ordinary orphans cannot be injected because relational
-- constraints reject them; constraint_tests.sql proves those protections.
