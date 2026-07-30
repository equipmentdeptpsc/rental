BEGIN;
SET search_path TO erp, public;

-- Supabase Auth owns credentials and sessions. This table is the canonical
-- application profile keyed by the immutable Auth User UUID.
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  username text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  operator_id text REFERENCES operators(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_active ON users(lower(username)) WHERE status='active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_operator_active ON users(operator_id) WHERE operator_id IS NOT NULL AND status='active';

CREATE TABLE IF NOT EXISTS number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  sequence_year integer,
  current_value bigint NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  prefix text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope, sequence_year)
);

-- Provider-neutral permission projection consumed by the authentication adapter.
CREATE OR REPLACE VIEW effective_user_permissions AS
SELECT ur.user_id::uuid AS user_id, p.code AS permission_code
FROM user_roles ur
JOIN app_roles r ON r.id=ur.role_id
JOIN role_permissions rp ON rp.role_id=r.id
JOIN app_permissions p ON p.id=rp.permission_id;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_authenticated_read ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_authenticated_read ON app_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_authenticated_read ON app_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_authenticated_read ON role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY user_roles_authenticated_read ON user_roles FOR SELECT TO authenticated USING (true);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'operators','customers','projects','equipment','assignments','rentals',
    'rental_equipment_lines','deurs','deur_events','billing_statements',
    'billing_statement_lines','audit_log','number_sequences'
  ] LOOP
    EXECUTE format('ALTER TABLE erp.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON erp.%I',table_name||'_authenticated_read',table_name);
    EXECUTE format('CREATE POLICY %I ON erp.%I FOR SELECT TO authenticated USING (true)',table_name||'_authenticated_read',table_name);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA erp TO authenticated;
GRANT SELECT ON users, app_roles, app_permissions, role_permissions, user_roles,
  operators, customers, projects, equipment, assignments, rentals,
  rental_equipment_lines, deurs, deur_events, billing_statements,
  billing_statement_lines, audit_log, number_sequences TO authenticated;
GRANT SELECT ON effective_user_permissions TO authenticated;

COMMIT;
