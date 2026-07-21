BEGIN;
SET search_path TO erp, public;

CREATE TABLE maintenance_records (
  id text PRIMARY KEY,
  equipment_id text NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  maintenance_type text NOT NULL,
  scheduled_reading numeric(19,4) NOT NULL,
  current_reading numeric(19,4) NOT NULL,
  scheduled_date date NOT NULL,
  completed_date date,
  technician text NOT NULL,
  remarks text NOT NULL DEFAULT '',
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by text,
  deleted_at timestamptz, deleted_by text, row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT ck_maintenance_status CHECK(status IN ('Scheduled','In Progress','Completed')),
  CONSTRAINT ck_maintenance_readings CHECK(scheduled_reading>=0 AND current_reading>=0),
  CONSTRAINT ck_maintenance_completion CHECK((status='Completed' AND completed_date IS NOT NULL) OR status<>'Completed')
);

CREATE TABLE equipment_daily_logs (
  id text PRIMARY KEY,
  equipment_id text NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  operator_id text NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  start_reading numeric(19,4) NOT NULL,
  end_reading numeric(19,4) NOT NULL,
  working_hours numeric(14,4) NOT NULL,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by text,
  deleted_at timestamptz, deleted_by text, row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT ck_daily_log_readings CHECK(start_reading>=0 AND end_reading>=start_reading),
  CONSTRAINT ck_daily_log_hours CHECK(working_hours>=0 AND working_hours<=24)
);

CREATE TRIGGER maintenance_records_version BEFORE UPDATE ON maintenance_records FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE TRIGGER equipment_daily_logs_version BEFORE UPDATE ON equipment_daily_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version();
CREATE INDEX ix_maintenance_equipment_schedule ON maintenance_records(equipment_id,scheduled_date,status) WHERE deleted_at IS NULL;
CREATE INDEX ix_daily_logs_equipment_date ON equipment_daily_logs(equipment_id,work_date) WHERE deleted_at IS NULL;
CREATE INDEX ix_daily_logs_operator_date ON equipment_daily_logs(operator_id,work_date) WHERE deleted_at IS NULL;
CREATE INDEX ix_daily_logs_project_date ON equipment_daily_logs(project_id,work_date) WHERE deleted_at IS NULL;

COMMIT;
