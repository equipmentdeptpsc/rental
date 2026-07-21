BEGIN;
SET search_path TO erp, public;

CREATE FUNCTION reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable historical record cannot be changed' USING ERRCODE='55000'; END $$;
CREATE TRIGGER commercial_snapshots_immutable BEFORE UPDATE OR DELETE ON commercial_snapshots FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER deur_activity_logs_immutable BEFORE UPDATE OR DELETE ON deur_activity_logs FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER deur_events_immutable BEFORE UPDATE OR DELETE ON deur_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER deur_review_history_immutable BEFORE UPDATE OR DELETE ON deur_review_history FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER equipment_history_immutable BEFORE UPDATE OR DELETE ON equipment_history FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE FUNCTION protect_statement_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state billing_approval_status;
BEGIN SELECT approval_status INTO state FROM billing_statements WHERE id=coalesce(OLD.billing_statement_id,NEW.billing_statement_id);
 IF state <> 'Draft' THEN RAISE EXCEPTION 'non-draft billing evidence is immutable' USING ERRCODE='55000'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER billing_lines_protected BEFORE UPDATE OR DELETE ON billing_statement_lines FOR EACH ROW EXECUTE FUNCTION protect_statement_line();

CREATE TRIGGER customers_version BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER projects_version BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER operators_version BEFORE UPDATE ON operators FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER equipment_version BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER assignments_version BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER rentals_version BEFORE UPDATE ON rentals FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER rental_lines_version BEFORE UPDATE ON rental_equipment_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER contracts_version BEFORE UPDATE ON rental_contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER deurs_version BEFORE UPDATE ON deurs FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER billing_statements_version BEFORE UPDATE ON billing_statements FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();

CREATE INDEX ix_equipment_project_status ON equipment(project_id,status_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_assignments_project_dates ON assignments(project_id,assigned_date,expected_return);
CREATE INDEX ix_rentals_customer_status ON rentals(customer_id,status);
CREATE INDEX ix_rentals_project_dates ON rentals(project_id,date_out,expected_return);
CREATE INDEX ix_rental_lines_rental_status ON rental_equipment_lines(rental_id,status) WHERE deleted_at IS NULL;
CREATE INDEX ix_contracts_rental ON rental_contracts(rental_id,status);
CREATE INDEX ix_deurs_rental_date ON deurs(rental_id,coalesce(report_date,work_date));
CREATE INDEX ix_deurs_line_date ON deurs(rental_equipment_line_id,coalesce(report_date,work_date));
CREATE INDEX ix_deurs_operator_status ON deurs(operator_id,status);
CREATE INDEX ix_deurs_billing_ready ON deurs(rental_id,status) WHERE status='Acknowledged' AND billing_locked=false;
CREATE INDEX ix_deur_events_deur_time ON deur_events(deur_id,occurred_at);
CREATE INDEX ix_deur_logs_deur_sequence ON deur_activity_logs(deur_id,sequence);
CREATE INDEX ix_statements_rental_period ON billing_statements(rental_id,billing_from,billing_to);
CREATE INDEX ix_statements_invoice_status ON billing_statements(invoice_status,created_at);
CREATE INDEX ix_statement_lines_statement ON billing_statement_lines(billing_statement_id);
CREATE INDEX ix_statement_lines_equipment_date ON billing_statement_lines(equipment_id,work_date);
CREATE INDEX ix_equipment_history_equipment_time ON equipment_history(equipment_id,occurred_at DESC);
CREATE INDEX ix_audit_aggregate_time ON audit_log(aggregate_type,aggregate_id,occurred_at DESC);
CREATE INDEX ix_outbox_pending ON sync_outbox(status,next_attempt_at,created_at) WHERE status IN ('Pending','Failed');

COMMIT;
