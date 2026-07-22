SET search_path TO erp, public;

SELECT issue_code, exception_count FROM (
 SELECT 'rental_without_line' issue_code,count(*) exception_count FROM rentals r WHERE r.status<>'Cancelled' AND NOT EXISTS(SELECT 1 FROM rental_equipment_lines l WHERE l.rental_id=r.id AND l.deleted_at IS NULL)
 UNION ALL SELECT 'duplicate_rental_equipment',count(*) FROM (SELECT 1 FROM rental_equipment_lines WHERE deleted_at IS NULL GROUP BY rental_id,equipment_id HAVING count(*)>1) x
 UNION ALL SELECT 'released_line_without_snapshot',count(*) FROM rental_equipment_lines l WHERE l.status IN ('Released','Active','Returned','Closed') AND NOT EXISTS(SELECT 1 FROM commercial_snapshots s WHERE s.rental_equipment_line_id=l.id)
 UNION ALL SELECT 'deur_without_line',count(*) FROM deurs WHERE rental_equipment_line_id IS NULL AND legacy=false
 UNION ALL SELECT 'deur_identity_mismatch',count(*) FROM deurs d JOIN rental_equipment_lines l ON l.id=d.rental_equipment_line_id WHERE d.rental_id<>l.rental_id OR d.equipment_id<>l.equipment_id
 UNION ALL SELECT 'duplicate_deur_line_date_shift',count(*) FROM (SELECT 1 FROM deurs WHERE superseded_at IS NULL AND rental_equipment_line_id IS NOT NULL GROUP BY rental_equipment_line_id,work_date,shift HAVING count(*)>1) x
 UNION ALL SELECT 'acknowledged_deur_without_evidence',count(*) FROM deurs d WHERE status IN ('Acknowledged','Billed') AND NOT EXISTS(SELECT 1 FROM deur_events e WHERE e.deur_id=d.id) AND NOT EXISTS(SELECT 1 FROM deur_activity_logs l WHERE l.deur_id=d.id) AND odometer_trip_evidence IS NULL AND quantity_evidence IS NULL AND completion_evidence IS NULL
 UNION ALL SELECT 'statement_total_mismatch',count(*) FROM (SELECT s.id FROM billing_statements s LEFT JOIN billing_statement_lines l ON l.billing_statement_id=s.id GROUP BY s.id HAVING s.subtotal<>coalesce(sum(l.amount),0) OR s.vat<>coalesce(sum(l.vat),0) OR s.withholding_tax<>coalesce(sum(l.withholding_tax),0) OR s.grand_total<>coalesce(sum(l.grand_total),0)) x
 UNION ALL SELECT 'duplicate_deur_consumption',count(*) FROM (SELECT 1 FROM billing_statement_lines GROUP BY deur_id HAVING count(*)>1) x
 UNION ALL SELECT 'snapshot_hash_missing',count(*) FROM commercial_snapshots WHERE snapshot_hash IS NULL OR snapshot_hash=''
 UNION ALL SELECT 'invoice_state_inconsistent',count(*) FROM billing_statements WHERE invoice_status IN ('Invoiced','Partially Collected','Fully Collected') AND approval_status<>'Approved'
 UNION ALL SELECT 'collections_exceed_statement',count(*) FROM (SELECT s.id FROM billing_statements s JOIN collections c ON c.billing_statement_id=s.id GROUP BY s.id HAVING sum(c.amount)>s.grand_total) x
 UNION ALL SELECT 'audit_actor_missing',count(*) FROM audit_log WHERE actor_id IS NULL AND actor_name IS NULL
 UNION ALL SELECT 'unresolved_staging_record',count(*) FROM migration_staging_records WHERE validation_status<>'Valid' OR transformation_status NOT IN ('Ready','Imported')
) exceptions ORDER BY issue_code;
