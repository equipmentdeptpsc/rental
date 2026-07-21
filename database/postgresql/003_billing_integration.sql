BEGIN;
SET search_path TO erp, public;

CREATE TABLE billing_statements (
  id text PRIMARY KEY, statement_no text NOT NULL, statement_version integer NOT NULL DEFAULT 1, rental_id text NOT NULL REFERENCES rentals(id),
  legacy_equipment_id text REFERENCES equipment(id), legacy_operator_id text REFERENCES operators(id), customer_snapshot text NOT NULL, project_snapshot text NOT NULL,
  billing_from date NOT NULL, billing_to date NOT NULL, currency char(3) NOT NULL DEFAULT 'PHP', subtotal numeric(19,4) NOT NULL,
  vat numeric(19,4) NOT NULL DEFAULT 0, withholding_tax numeric(19,4) NOT NULL DEFAULT 0, grand_total numeric(19,4) NOT NULL,
  approval_status billing_approval_status NOT NULL, invoice_status invoice_status NOT NULL,
  submitted_by text, submitted_at timestamptz, approved_by text, approved_at timestamptz, rejected_by text, rejected_at timestamptz, rejection_remarks text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1,
  deleted_at timestamptz, deleted_by text,
  CONSTRAINT ck_statement_period CHECK (billing_to >= billing_from),
  CONSTRAINT ck_statement_totals CHECK (subtotal>=0 AND vat>=0 AND withholding_tax>=0 AND grand_total>=0)
);
CREATE UNIQUE INDEX uq_billing_statement_number ON billing_statements(lower(statement_no));
CREATE UNIQUE INDEX uq_billing_statement_active_period ON billing_statements(rental_id,billing_from,billing_to) WHERE invoice_status <> 'Cancelled' AND deleted_at IS NULL;

CREATE TABLE billing_statement_lines (
  id text PRIMARY KEY, billing_statement_id text NOT NULL REFERENCES billing_statements(id) ON DELETE RESTRICT, rental_equipment_line_id text REFERENCES rental_equipment_lines(id),
  equipment_id text REFERENCES equipment(id), deur_id text NOT NULL REFERENCES deurs(id), operator_id text REFERENCES operators(id), shift text,
  deur_revision_chain_id text, deur_revision_number integer, effective_deur_id text REFERENCES deurs(id), corrected_from_deur_id text REFERENCES deurs(id),
  work_date date NOT NULL, description text NOT NULL, cost_code_snapshot text NOT NULL DEFAULT '', activity_code_snapshot text,
  billing_method billing_method, quantity numeric(19,6), unit text, unit_rate numeric(19,6), hours numeric(14,4) NOT NULL DEFAULT 0, hourly_rate numeric(19,6) NOT NULL DEFAULT 0,
  commercial_terms_source text, commercial_captured_at timestamptz, operating_charge numeric(19,4) NOT NULL DEFAULT 0, idle_charge numeric(19,4) NOT NULL DEFAULT 0,
  mobilization_charge numeric(19,4) NOT NULL DEFAULT 0, demobilization_charge numeric(19,4) NOT NULL DEFAULT 0, operator_charge numeric(19,4) NOT NULL DEFAULT 0,
  fuel_charge numeric(19,4) NOT NULL DEFAULT 0, amount numeric(19,4) NOT NULL, vat numeric(19,4) NOT NULL DEFAULT 0, withholding_tax numeric(19,4) NOT NULL DEFAULT 0,
  grand_total numeric(19,4) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CONSTRAINT ck_statement_line_nonnegative CHECK (coalesce(quantity,0)>=0 AND coalesce(unit_rate,0)>=0 AND hours>=0 AND hourly_rate>=0 AND operating_charge>=0 AND idle_charge>=0 AND mobilization_charge>=0 AND demobilization_charge>=0 AND operator_charge>=0 AND fuel_charge>=0 AND amount>=0 AND vat>=0 AND withholding_tax>=0 AND grand_total>=0),
  CONSTRAINT ck_commercial_source CHECK (commercial_terms_source IS NULL OR commercial_terms_source IN ('IMMUTABLE_SNAPSHOT','LEGACY_RENTAL_FALLBACK')),
  CONSTRAINT fk_statement_line_equipment_identity FOREIGN KEY (rental_equipment_line_id,equipment_id) REFERENCES rental_equipment_lines(id,equipment_id)
);
CREATE UNIQUE INDEX uq_active_deur_billing ON billing_statement_lines(deur_id);
CREATE UNIQUE INDEX uq_active_revision_billing ON billing_statement_lines(deur_revision_chain_id) WHERE deur_revision_chain_id IS NOT NULL;
ALTER TABLE deurs ADD CONSTRAINT fk_deur_billing_statement FOREIGN KEY (billing_statement_id) REFERENCES billing_statements(id);

CREATE VIEW invoice_projection AS
SELECT s.id AS billing_statement_id, s.statement_no AS invoice_number, s.rental_id, s.customer_snapshot AS customer,
 s.project_snapshot AS project, s.billing_from, s.billing_to, s.created_at AS statement_date, s.invoice_status,
 s.currency, s.subtotal, s.vat, s.withholding_tax, s.grand_total, s.row_version,
 l.id AS line_id, l.rental_equipment_line_id, l.equipment_id, l.deur_id, l.operator_id, l.shift, l.work_date,
 l.description, l.billing_method, l.quantity, l.unit, l.unit_rate, l.hours, l.hourly_rate,
 l.operating_charge, l.idle_charge, l.mobilization_charge, l.demobilization_charge, l.operator_charge, l.fuel_charge,
 l.amount AS line_subtotal, l.vat AS line_vat, l.withholding_tax AS line_withholding_tax, l.grand_total AS line_grand_total
FROM billing_statements s LEFT JOIN billing_statement_lines l ON l.billing_statement_id=s.id
WHERE s.deleted_at IS NULL;

CREATE TABLE equipment_history (
  id text PRIMARY KEY, equipment_id text NOT NULL REFERENCES equipment(id), event_type text NOT NULL, source_type text, source_id text,
  description text NOT NULL, occurred_at timestamptz NOT NULL, actor_id text, actor_name text, snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (
  id text PRIMARY KEY, aggregate_type text NOT NULL, aggregate_id text NOT NULL, action text NOT NULL, actor_id text, actor_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(), correlation_id text, previous_values jsonb, new_values jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE sync_outbox (
  id text PRIMARY KEY, aggregate_type text NOT NULL, aggregate_id text NOT NULL, operation text NOT NULL, payload jsonb NOT NULL,
  expected_version bigint, idempotency_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'Pending', attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz, last_error jsonb, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  CONSTRAINT ck_outbox_status CHECK(status IN ('Pending','Processing','Completed','Failed','Manual Reconciliation'))
);
CREATE TABLE sync_cursors (consumer_id text PRIMARY KEY, cursor_value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

-- Reserved relational foundations; no current runtime behavior depends on them.
CREATE TABLE app_roles (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app_permissions (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE role_permissions (role_id text NOT NULL REFERENCES app_roles(id), permission_id text NOT NULL REFERENCES app_permissions(id), PRIMARY KEY(role_id,permission_id));
CREATE TABLE user_roles (user_id text NOT NULL, role_id text NOT NULL REFERENCES app_roles(id), assigned_at timestamptz NOT NULL DEFAULT now(), assigned_by text, PRIMARY KEY(user_id,role_id));
CREATE TABLE collections (id text PRIMARY KEY, billing_statement_id text NOT NULL REFERENCES billing_statements(id), amount numeric(19,4) NOT NULL CHECK(amount>0), currency char(3) NOT NULL, reference_no text, collected_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by text, row_version bigint NOT NULL DEFAULT 1);

COMMIT;
