BEGIN;
SET search_path TO erp, public;

CREATE TABLE rentals (
  id text PRIMARY KEY, rental_number text, customer_id text REFERENCES customers(id), project_id text REFERENCES projects(id), assignment_id text REFERENCES assignments(id),
  legacy_equipment_id text REFERENCES equipment(id), legacy_operator_id text REFERENCES operators(id), customer_snapshot text NOT NULL, project_snapshot text NOT NULL,
  rented_by text NOT NULL DEFAULT '', date_out date NOT NULL, expected_return date, actual_return date, rental_type text,
  legacy_billing_method billing_method, transaction_relationship text, remarks text, status_id text REFERENCES rental_statuses(id), status rental_status NOT NULL,
  commercial_snapshot_required boolean NOT NULL DEFAULT false, deur_expectation_policy_required boolean NOT NULL DEFAULT false,
  deur_expectation_frequency text, deur_expectation_effective_from date, deur_expectation_effective_until date, expected_shift_codes text[], excluded_dates date[], timezone text,
  deur_expectation_captured_at timestamptz, deur_expectation_frozen_at timestamptz, operational_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reserved_at timestamptz, released_at timestamptz, activated_at timestamptz, returned_at timestamptz, closed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1,
  legacy_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_rental_type CHECK (rental_type IS NULL OR rental_type IN ('Bare Rental','Operated Rental')),
  CONSTRAINT ck_relationship CHECK (transaction_relationship IS NULL OR transaction_relationship IN ('Affiliate','Non-Affiliate')),
  CONSTRAINT ck_rental_dates CHECK (expected_return IS NULL OR expected_return >= date_out),
  CONSTRAINT ck_expectation_frequency CHECK (deur_expectation_frequency IS NULL OR deur_expectation_frequency IN ('PER_WORKDAY','PER_SHIFT','ON_DEMAND'))
);
CREATE UNIQUE INDEX uq_rentals_number ON rentals(lower(rental_number)) WHERE rental_number IS NOT NULL;

CREATE TABLE rental_equipment_lines (
  id text PRIMARY KEY, rental_id text NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT, equipment_id text NOT NULL REFERENCES equipment(id),
  assignment_id text REFERENCES assignments(id), operator_id text NOT NULL REFERENCES operators(id), status rental_status NOT NULL,
  operational_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, commercial_snapshot_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1,
  deleted_at timestamptz, deleted_by text, UNIQUE(rental_id, equipment_id), UNIQUE(rental_id, id)
);

CREATE TABLE rental_contracts (
  id text PRIMARY KEY, rental_id text NOT NULL REFERENCES rentals(id), rental_equipment_line_id text REFERENCES rental_equipment_lines(id), contract_no text NOT NULL,
  customer_id text NOT NULL REFERENCES customers(id), equipment_id text NOT NULL REFERENCES equipment(id), project_id text NOT NULL REFERENCES projects(id),
  rental_type text NOT NULL, billing_method billing_method NOT NULL, currency char(3) NOT NULL, unit_rate numeric(19,6) NOT NULL,
  minimum_billable_hours numeric(14,4), overtime_rate numeric(19,6), standby_rate numeric(19,6), mobilization_fee numeric(19,4), demobilization_fee numeric(19,4),
  fuel_charge numeric(19,4), operator_included boolean NOT NULL, operator_rate numeric(19,6), contract_amount numeric(19,4), estimated_volume numeric(19,6),
  billing_day smallint, tax_rate numeric(9,6), withholding_tax numeric(9,6), transaction_relationship text, vat_applicability text, remarks text,
  start_date date NOT NULL, expected_end_date date NOT NULL, status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT ck_contract_rates CHECK (unit_rate >= 0 AND coalesce(minimum_billable_hours,0)>=0 AND coalesce(overtime_rate,0)>=0 AND coalesce(standby_rate,0)>=0 AND coalesce(mobilization_fee,0)>=0 AND coalesce(demobilization_fee,0)>=0 AND coalesce(fuel_charge,0)>=0 AND coalesce(operator_rate,0)>=0 AND coalesce(contract_amount,0)>=0),
  CONSTRAINT ck_contract_tax CHECK ((tax_rate IS NULL OR tax_rate BETWEEN 0 AND 100) AND (withholding_tax IS NULL OR withholding_tax BETWEEN 0 AND 100)),
  CONSTRAINT ck_contract_status CHECK (status IN ('Draft','Active','Completed','Cancelled')),
  CONSTRAINT ck_contract_dates CHECK (expected_end_date >= start_date)
);
CREATE UNIQUE INDEX uq_contract_active_line ON rental_contracts(rental_equipment_line_id) WHERE rental_equipment_line_id IS NOT NULL AND status <> 'Cancelled';

CREATE TABLE commercial_snapshots (
  id text PRIMARY KEY, rental_id text NOT NULL REFERENCES rentals(id), rental_equipment_line_id text REFERENCES rental_equipment_lines(id), source_contract_id text REFERENCES rental_contracts(id),
  billing_method billing_method NOT NULL, unit_rate numeric(19,6) NOT NULL, minimum_billable_hours numeric(14,4), overtime_rate numeric(19,6), standby_rate numeric(19,6),
  mobilization_fee numeric(19,4), demobilization_fee numeric(19,4), fuel_charge numeric(19,4), operator_included boolean NOT NULL, operator_rate numeric(19,6),
  tax_rate numeric(9,6), withholding_tax numeric(9,6), contract_amount numeric(19,4), currency char(3) NOT NULL, captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text, snapshot_hash text,
  CONSTRAINT ck_snapshot_values CHECK (unit_rate>=0 AND coalesce(minimum_billable_hours,0)>=0 AND coalesce(overtime_rate,0)>=0 AND coalesce(standby_rate,0)>=0 AND coalesce(mobilization_fee,0)>=0 AND coalesce(demobilization_fee,0)>=0 AND coalesce(fuel_charge,0)>=0 AND coalesce(operator_rate,0)>=0 AND coalesce(contract_amount,0)>=0),
  UNIQUE(rental_equipment_line_id)
);

CREATE TABLE rental_shift_window_snapshots (
  id text PRIMARY KEY, rental_id text NOT NULL REFERENCES rentals(id), code text NOT NULL, label text NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
  timezone text NOT NULL, captured_at timestamptz NOT NULL, UNIQUE(rental_id, code)
);

CREATE TABLE deurs (
  id text PRIMARY KEY, deur_number text, rental_id text NOT NULL REFERENCES rentals(id), rental_equipment_line_id text REFERENCES rental_equipment_lines(id),
  assignment_id text REFERENCES assignments(id), equipment_id text NOT NULL REFERENCES equipment(id), operator_id text NOT NULL REFERENCES operators(id), project_id text REFERENCES projects(id), customer_id text REFERENCES customers(id),
  commercial_snapshot_id text REFERENCES commercial_snapshots(id), commercial_snapshot_required boolean NOT NULL DEFAULT false, creation_source text,
  work_date date NOT NULL, report_date date, shift text, status deur_status NOT NULL, evidence_mode text, billing_method_snapshot billing_method,
  total_operating_minutes integer NOT NULL DEFAULT 0, total_idle_minutes integer NOT NULL DEFAULT 0, total_maintenance_minutes integer NOT NULL DEFAULT 0,
  total_meal_break_minutes integer NOT NULL DEFAULT 0, total_mobilization_minutes integer NOT NULL DEFAULT 0, total_demobilization_minutes integer NOT NULL DEFAULT 0,
  opening_meter numeric(19,4), closing_meter numeric(19,4), submitted_at timestamptz, submitted_by text, acknowledged_at timestamptz, acknowledged_by text,
  acknowledged_by_user_id text, acknowledgement_remarks text, rejected_at timestamptz, rejected_by text, rejected_by_user_id text, rejection_reason text,
  billing_locked boolean NOT NULL DEFAULT false, billing_statement_id text, bill_id text, legacy boolean NOT NULL DEFAULT false,
  operational_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, operational_remarks text, manual_metadata jsonb, odometer_trip_evidence jsonb, quantity_evidence jsonb, completion_evidence jsonb,
  revision_chain_id text, revision_number integer, original_deur_id text, previous_revision_id text REFERENCES deurs(id), supersedes_revision_id text REFERENCES deurs(id), superseded_by_revision_id text,
  correction_reason_code text, correction_reason_details text, corrected_by_name text, corrected_by_user_id text, corrected_at timestamptz, superseded_at timestamptz, superseded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT ck_deur_shift CHECK (shift IS NULL OR shift IN ('Day','Night')),
  CONSTRAINT ck_deur_evidence_mode CHECK (evidence_mode IS NULL OR evidence_mode IN ('TIME_TIMELINE','ODOMETER_TRIP','QUANTITY','COMPLETION')),
  CONSTRAINT ck_deur_minutes CHECK (total_operating_minutes>=0 AND total_idle_minutes>=0 AND total_maintenance_minutes>=0 AND total_meal_break_minutes>=0 AND total_mobilization_minutes>=0 AND total_demobilization_minutes>=0),
  CONSTRAINT ck_deur_revision CHECK ((revision_chain_id IS NULL AND revision_number IS NULL) OR (revision_chain_id IS NOT NULL AND revision_number >= 1))
);
CREATE UNIQUE INDEX uq_deur_number ON deurs(lower(deur_number)) WHERE deur_number IS NOT NULL;
CREATE UNIQUE INDEX uq_deur_revision ON deurs(revision_chain_id, revision_number) WHERE revision_chain_id IS NOT NULL;

-- Retains the legacy duration-log representation exactly. Canonical event rows
-- coexist with these records until a separately approved evidence migration.
CREATE TABLE deur_activity_logs (
  id text PRIMARY KEY, deur_id text NOT NULL REFERENCES deurs(id) ON DELETE RESTRICT,
  activity text NOT NULL, start_time timestamptz NOT NULL, end_time timestamptz,
  duration_minutes integer NOT NULL, remarks text, sequence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_deur_log_activity CHECK (activity IN ('Arrived at Site','Operation','Idle','Meal Break','Corrective Maintenance','Preventive Maintenance','Demobilization')),
  CONSTRAINT ck_deur_log_duration CHECK (duration_minutes >= 0),
  UNIQUE(deur_id, sequence)
);

CREATE TABLE deur_events (
  id text PRIMARY KEY, deur_id text NOT NULL REFERENCES deurs(id) ON DELETE RESTRICT, activity_type text NOT NULL, action text NOT NULL,
  occurred_at timestamptz NOT NULL, sequence integer NOT NULL, source text NOT NULL, action_group_id text, logical_action_id text, actor_id text, actor_name text,
  created_offline boolean NOT NULL DEFAULT false, local_created_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_deur_event_activity CHECK (activity_type IN ('shift','operation','idle','mealBreak','breakdown')),
  CONSTRAINT ck_deur_event_action CHECK (action IN ('start','end')), UNIQUE(deur_id, sequence)
);
CREATE TABLE deur_review_history (id text PRIMARY KEY, deur_id text NOT NULL REFERENCES deurs(id), action text NOT NULL, actor_name text NOT NULL, actor_id text, occurred_at timestamptz NOT NULL, reason text, CONSTRAINT ck_review_action CHECK(action IN ('submitted','acknowledged','rejected','reopened')));

COMMIT;
