BEGIN;

CREATE SCHEMA IF NOT EXISTS erp;
SET search_path TO erp, public;

CREATE TYPE rental_status AS ENUM ('Draft','Assigned','Reserved','Released','Active','Returned','Closed','Cancelled');
CREATE TYPE assignment_status AS ENUM ('Active','Completed','Cancelled');
CREATE TYPE billing_method AS ENUM ('Per Hour','Per Day','Per Week','Per Month','Per Trip','Per Kilometer','Per Cubic Meter','One Lot','Per Lot');
CREATE TYPE deur_status AS ENUM ('Draft','In Progress','Submitted','Pending Acknowledgement','Acknowledged','Rejected','Billed');
CREATE TYPE billing_approval_status AS ENUM ('Draft','Pending Approval','Approved','Rejected');
CREATE TYPE invoice_status AS ENUM ('Not Invoiced','Invoiced','Partially Collected','Fully Collected','Cancelled');

CREATE FUNCTION set_updated_at_and_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  NEW.row_version = OLD.row_version + 1;
  RETURN NEW;
END $$;

CREATE TABLE customers (
  id text PRIMARY KEY, customer_code text, name text NOT NULL, email text, phone text, address text,
  active boolean NOT NULL DEFAULT true, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  created_by text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1,
  legacy_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uq_customers_code_active ON customers (lower(customer_code)) WHERE customer_code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE projects (
  id text PRIMARY KEY, project_code text, name text NOT NULL, customer_id text REFERENCES customers(id), location text,
  active boolean NOT NULL DEFAULT true, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1, legacy_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uq_projects_code_active ON projects (lower(project_code)) WHERE project_code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE operators (
  id text PRIMARY KEY, name text NOT NULL, email text, license_number text, certification_type text NOT NULL DEFAULT 'None',
  status text NOT NULL, joined_date date, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT ck_operator_status CHECK (status IN ('Active','On Leave','Suspended')),
  CONSTRAINT ck_operator_certification CHECK (certification_type IN ('Heavy Machinery','Forklift','Crane Logistics','None'))
);

CREATE TABLE equipment_categories (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE equipment_types (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE equipment_models (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE equipment_brands (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE equipment_conditions (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE equipment_locations (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE equipment_ownerships (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE equipment_statuses (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE rental_statuses (id text PRIMARY KEY, code text, name text NOT NULL, description text, active boolean NOT NULL DEFAULT true, deleted_at timestamptz, sort_order integer NOT NULL DEFAULT 0);

CREATE TABLE cost_codes (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), row_version bigint NOT NULL DEFAULT 1);
CREATE UNIQUE INDEX uq_cost_codes_code_active ON cost_codes(lower(code)) WHERE deleted_at IS NULL;
CREATE TABLE activity_codes (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), row_version bigint NOT NULL DEFAULT 1);
CREATE UNIQUE INDEX uq_activity_codes_code_active ON activity_codes(lower(code)) WHERE deleted_at IS NULL;
CREATE TABLE work_descriptions (id text PRIMARY KEY, code text, name text NOT NULL, requires_remarks boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), row_version bigint NOT NULL DEFAULT 1);

CREATE TABLE equipment (
  id text PRIMARY KEY, asset_no text NOT NULL, equipment_name text NOT NULL, prefix_id text, category_id text REFERENCES equipment_categories(id),
  type_id text REFERENCES equipment_types(id), model_id text REFERENCES equipment_models(id), brand_id text REFERENCES equipment_brands(id),
  condition_id text REFERENCES equipment_conditions(id), location_id text REFERENCES equipment_locations(id), ownership_id text REFERENCES equipment_ownerships(id),
  status_id text REFERENCES equipment_statuses(id), project_id text REFERENCES projects(id), operator_id text REFERENCES operators(id), cost_code_id text REFERENCES cost_codes(id),
  manufacturer text, model_text text, serial_number text, engine_number text, chassis_number text, plate_number text, year_model integer, capacity text,
  maintenance_type text NOT NULL, current_reading numeric(19,4) NOT NULL DEFAULT 0, remarks text, active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz, deleted_by text, created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1, legacy_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_equipment_reading CHECK (current_reading >= 0),
  CONSTRAINT ck_equipment_year CHECK (year_model IS NULL OR year_model BETWEEN 1900 AND 2200)
);
CREATE UNIQUE INDEX uq_equipment_asset_no_active ON equipment(lower(asset_no)) WHERE deleted_at IS NULL;

CREATE TABLE assignments (
  id text PRIMARY KEY, equipment_id text NOT NULL REFERENCES equipment(id), operator_id text NOT NULL REFERENCES operators(id), project_id text NOT NULL REFERENCES projects(id),
  activity_code_id text REFERENCES activity_codes(id), assigned_date date NOT NULL, expected_return date NOT NULL, returned_date date,
  remarks text NOT NULL DEFAULT '', status assignment_status NOT NULL, deleted_at timestamptz, deleted_by text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT ck_assignment_dates CHECK (expected_return >= assigned_date AND (returned_date IS NULL OR returned_date >= assigned_date))
);
CREATE UNIQUE INDEX uq_assignment_active_equipment ON assignments(equipment_id) WHERE status='Active' AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_assignment_active_operator ON assignments(operator_id) WHERE status='Active' AND deleted_at IS NULL;

COMMIT;
