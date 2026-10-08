\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %', message; END IF; END $$;

INSERT INTO erp.companies(id, code, name, active, environment_class)
VALUES ('TENANT-ASSIGN-CANCEL', 'ASCANCEL', 'Assignment Cancellation Test', true, 'test');
INSERT INTO auth.users(id, email)
VALUES ('71000000-0000-4000-8000-000000000001', 'assignment.cancel@example.test');
INSERT INTO erp.users(id, username, display_name, email, status, company_id)
VALUES ('71000000-0000-4000-8000-000000000001', 'assignment.cancel', 'Assignment Cancel', 'assignment.cancel@example.test', 'active', 'TENANT-ASSIGN-CANCEL');
INSERT INTO erp.user_roles(user_id, role_id)
SELECT '71000000-0000-4000-8000-000000000001'::uuid, id FROM erp.app_roles WHERE code = 'system-administrator';
INSERT INTO erp.projects(id, name, active, company_id)
VALUES ('ASCANCEL-PROJECT', 'Assignment Cancellation Project', true, 'TENANT-ASSIGN-CANCEL');
INSERT INTO erp.customers(id, customer_code, name, company_id)
VALUES ('ASCANCEL-CUSTOMER', 'ASCANCEL-CUSTOMER', 'Customer', 'TENANT-ASSIGN-CANCEL');
INSERT INTO erp.operators(id, name, status, company_id) VALUES
('ASCANCEL-OP-1', 'Operator One', 'Active', 'TENANT-ASSIGN-CANCEL'),
('ASCANCEL-OP-2', 'Operator Two', 'Active', 'TENANT-ASSIGN-CANCEL'),
('ASCANCEL-OP-3', 'Operator Three', 'Active', 'TENANT-ASSIGN-CANCEL'),
('ASCANCEL-OP-4', 'Operator Four', 'Active', 'TENANT-ASSIGN-CANCEL');
INSERT INTO erp.equipment(id, asset_no, equipment_name, status_id, maintenance_type, company_id)
SELECT 'ASCANCEL-EQ-' || n, 'ASCANCEL-EQ-' || n, 'Equipment ' || n, s.id, 'None', 'TENANT-ASSIGN-CANCEL'
FROM generate_series(1, 4) n
CROSS JOIN LATERAL (SELECT id FROM erp.equipment_statuses WHERE lower(code) = 'assigned' LIMIT 1) s;
INSERT INTO erp.assignments(id, equipment_id, operator_id, project_id, assigned_date, status, company_id)
SELECT '72000000-0000-4000-8000-00000000000' || n, 'ASCANCEL-EQ-' || n,
  'ASCANCEL-OP-' || n, 'ASCANCEL-PROJECT', current_date, 'Active', 'TENANT-ASSIGN-CANCEL'
FROM generate_series(1, 4) n;
INSERT INTO erp.rentals(id, rental_number, project_id, customer_snapshot, project_snapshot, date_out, status, approval_status,
  approval_requested_at, approval_requested_by, approval_decided_at, approval_decided_by, company_id) VALUES
('73000000-0000-4000-8000-000000000002', 'ASCANCEL-DRAFT', 'ASCANCEL-PROJECT', 'Customer', 'Project', current_date, 'Draft', 'NotSubmitted', null, null, null, null, 'TENANT-ASSIGN-CANCEL'),
('73000000-0000-4000-8000-000000000003', 'ASCANCEL-APPROVED', 'ASCANCEL-PROJECT', 'Customer', 'Project', current_date, 'Draft', 'Approved', clock_timestamp(), '71000000-0000-4000-8000-000000000001', clock_timestamp(), '71000000-0000-4000-8000-000000000001', 'TENANT-ASSIGN-CANCEL'),
('73000000-0000-4000-8000-000000000004', 'ASCANCEL-RESERVED', 'ASCANCEL-PROJECT', 'Customer', 'Project', current_date, 'Reserved', 'NotSubmitted', null, null, null, null, 'TENANT-ASSIGN-CANCEL');
INSERT INTO erp.rental_equipment_lines(id, rental_id, equipment_id, assignment_id, operator_id, status, company_id)
SELECT '74000000-0000-4000-8000-00000000000' || n,
  '73000000-0000-4000-8000-00000000000' || n,
  'ASCANCEL-EQ-' || n, '72000000-0000-4000-8000-00000000000' || n,
  'ASCANCEL-OP-' || n, (CASE WHEN n = 4 THEN 'Reserved' ELSE 'Draft' END)::erp.rental_status, 'TENANT-ASSIGN-CANCEL'
FROM generate_series(2, 4) n;
INSERT INTO erp.rental_contracts(id, rental_id, rental_equipment_line_id, contract_no, customer_id, equipment_id,
  project_id, rental_type, billing_method, currency, unit_rate, operator_included, start_date, expected_end_date, status)
VALUES ('ASCANCEL-CONTRACT', '73000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000002',
  'ASCANCEL-CONTRACT', 'ASCANCEL-CUSTOMER', 'ASCANCEL-EQ-2', 'ASCANCEL-PROJECT', 'Operated Rental', 'Per Hour', 'PHP', 100,
  true, current_date, current_date + 1, 'Draft');

SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
CREATE FUNCTION pg_temp.fail_contract_cancel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'simulated contract failure'; END $$;
CREATE TRIGGER fail_contract_cancel BEFORE UPDATE OF status ON erp.rental_contracts
FOR EACH ROW WHEN (NEW.status = 'Cancelled') EXECUTE FUNCTION pg_temp.fail_contract_cancel();
DO $$
BEGIN
  PERFORM erp.command_cancel_assignment(jsonb_build_object(
    'commandId', 'cancel-draft-failure', 'idempotencyKey', 'cancel-draft-failure',
    'assignmentId', '72000000-0000-4000-8000-000000000002', 'expectedVersion', 1));
  RAISE EXCEPTION 'expected simulated contract failure';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'simulated contract failure' THEN RAISE; END IF;
END $$;
SELECT pg_temp.assert_true((SELECT status = 'Active' FROM erp.assignments WHERE id = '72000000-0000-4000-8000-000000000002'), 'failed cancellation preserves Assignment');
SELECT pg_temp.assert_true((SELECT status = 'Draft' FROM erp.rentals WHERE id = '73000000-0000-4000-8000-000000000002'), 'failed cancellation rolls back Rental');
SELECT pg_temp.assert_true((SELECT status = 'Draft' FROM erp.rental_equipment_lines WHERE id = '74000000-0000-4000-8000-000000000002'), 'failed cancellation rolls back line');
DROP TRIGGER fail_contract_cancel ON erp.rental_contracts;
CREATE TEMP TABLE cancel_results(label text, value jsonb);
INSERT INTO cancel_results SELECT 'unlinked', erp.command_cancel_assignment(jsonb_build_object(
  'commandId', 'cancel-unlinked', 'idempotencyKey', 'cancel-unlinked',
  'assignmentId', '72000000-0000-4000-8000-000000000001', 'expectedVersion', 1));
INSERT INTO cancel_results SELECT 'draft', erp.command_cancel_assignment(jsonb_build_object(
  'commandId', 'cancel-draft', 'idempotencyKey', 'cancel-draft',
  'assignmentId', '72000000-0000-4000-8000-000000000002', 'expectedVersion', 1));
INSERT INTO cancel_results SELECT 'approved', erp.command_cancel_assignment(jsonb_build_object(
  'commandId', 'cancel-approved', 'idempotencyKey', 'cancel-approved',
  'assignmentId', '72000000-0000-4000-8000-000000000003', 'expectedVersion', 1));
INSERT INTO cancel_results SELECT 'reserved', erp.command_cancel_assignment(jsonb_build_object(
  'commandId', 'cancel-reserved', 'idempotencyKey', 'cancel-reserved',
  'assignmentId', '72000000-0000-4000-8000-000000000004', 'expectedVersion', 1));
UPDATE erp.rentals SET status = 'Released', canonical_parent_status = 'Released' WHERE rental_number = 'ASCANCEL-RESERVED';
UPDATE erp.rental_equipment_lines SET status = 'Released', canonical_line_status = 'Released' WHERE id = '74000000-0000-4000-8000-000000000004';
INSERT INTO cancel_results SELECT 'released', erp.command_cancel_assignment(jsonb_build_object(
  'commandId', 'cancel-released', 'idempotencyKey', 'cancel-released',
  'assignmentId', '72000000-0000-4000-8000-000000000004', 'expectedVersion', 1));
UPDATE erp.rentals SET status = 'Active', canonical_parent_status = 'Active' WHERE rental_number = 'ASCANCEL-RESERVED';
UPDATE erp.rental_equipment_lines SET status = 'Active', canonical_line_status = 'Active' WHERE id = '74000000-0000-4000-8000-000000000004';
INSERT INTO cancel_results SELECT 'active', erp.command_cancel_assignment(jsonb_build_object(
  'commandId', 'cancel-active', 'idempotencyKey', 'cancel-active',
  'assignmentId', '72000000-0000-4000-8000-000000000004', 'expectedVersion', 1));

SELECT pg_temp.assert_true((SELECT value->>'success' = 'true' FROM cancel_results WHERE label = 'unlinked'), 'unlinked cancellation');
SELECT pg_temp.assert_true((SELECT value->>'success' = 'true' FROM cancel_results WHERE label = 'draft'), 'Draft cancellation');
SELECT pg_temp.assert_true((SELECT value->>'code' = 'RENTAL_CONFLICT' FROM cancel_results WHERE label = 'approved'), 'direct RPC approved gate');
SELECT pg_temp.assert_true((SELECT value->>'code' = 'RENTAL_CONFLICT' FROM cancel_results WHERE label = 'reserved'), 'direct RPC reserved gate');
SELECT pg_temp.assert_true((SELECT value->>'code' = 'RENTAL_CONFLICT' FROM cancel_results WHERE label = 'released'), 'direct RPC released gate');
SELECT pg_temp.assert_true((SELECT value->>'code' = 'RENTAL_CONFLICT' FROM cancel_results WHERE label = 'active'), 'direct RPC active gate');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM erp.assignments WHERE company_id = 'TENANT-ASSIGN-CANCEL' AND status = 'Cancelled'), 'two assignments cancelled');
SELECT pg_temp.assert_true((SELECT status = 'Cancelled' AND canonical_parent_status = 'Cancelled' FROM erp.rentals WHERE rental_number = 'ASCANCEL-DRAFT'), 'Draft rental parent cancelled');
SELECT pg_temp.assert_true((SELECT status = 'Cancelled' AND canonical_line_status = 'Cancelled' FROM erp.rental_equipment_lines WHERE id = '74000000-0000-4000-8000-000000000002'), 'Draft rental line cancelled');
SELECT pg_temp.assert_true((SELECT lower(s.code) = 'available' AND e.operator_id IS NULL AND e.project_id IS NULL FROM erp.equipment e JOIN erp.equipment_statuses s ON s.id = e.status_id WHERE e.id = 'ASCANCEL-EQ-2'), 'equipment available and unlinked');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM erp.assignments WHERE company_id = 'TENANT-ASSIGN-CANCEL' AND status = 'Active' AND (equipment_id = 'ASCANCEL-EQ-2' OR operator_id = 'ASCANCEL-OP-2')), 'exclusivity released');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM erp.assignments WHERE company_id = 'TENANT-ASSIGN-CANCEL' AND status = 'Active'), 'committed assignments remain active');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM erp.rentals r JOIN erp.rental_equipment_lines l ON l.rental_id = r.id WHERE r.company_id = 'TENANT-ASSIGN-CANCEL' AND r.status = 'Draft' AND l.assignment_id = '72000000-0000-4000-8000-000000000002'), 'no orphan Draft rental relation');
SELECT pg_temp.assert_true((SELECT status = 'Cancelled' FROM erp.rental_contracts WHERE id = 'ASCANCEL-CONTRACT'), 'Draft commercial terms cancelled');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM erp.audit_log WHERE company_id = 'TENANT-ASSIGN-CANCEL' AND aggregate_type = 'Rental' AND action = 'CANCEL_RENTAL'), 'Rental audit preserved');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM erp.audit_log WHERE company_id = 'TENANT-ASSIGN-CANCEL' AND aggregate_type = 'Assignment' AND action = 'ASSIGNMENT_CANCELLED'), 'Assignment audit preserved');
SELECT 'PREAPPROVAL_ASSIGNMENT_CANCELLATION_PASS';
