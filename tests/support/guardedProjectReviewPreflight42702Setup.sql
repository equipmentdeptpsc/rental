CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA erp;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT current_setting('request.jwt.claim.role', true) $$;

CREATE TABLE erp.companies(id text PRIMARY KEY,active boolean NOT NULL);
CREATE TABLE erp.users(id uuid PRIMARY KEY,company_id text NOT NULL,status text NOT NULL);
CREATE TABLE erp.effective_user_permissions(user_id uuid NOT NULL,permission_code text NOT NULL);
CREATE TABLE erp.app_roles(id uuid PRIMARY KEY,code text NOT NULL,active boolean NOT NULL,deprecated_at timestamptz);
CREATE TABLE erp.user_roles(user_id uuid NOT NULL,role_id uuid NOT NULL);
CREATE TABLE erp.projects(id text PRIMARY KEY,company_id text NOT NULL,customer_id text NOT NULL,active boolean NOT NULL,deleted_at timestamptz);
CREATE TABLE erp.customer_review_batches(
  id uuid PRIMARY KEY,company_id text NOT NULL,group_scope text NOT NULL,finalized_at timestamptz,
  superseded_at timestamptz,retired_no_actionable_at timestamptz,expires_at timestamptz NOT NULL,
  project_id text,customer_id text,recipient_snapshot jsonb NOT NULL,credential_hash text,row_version integer NOT NULL DEFAULT 1
);
CREATE TABLE erp.deurs(
  id uuid PRIMARY KEY,company_id text NOT NULL,customer_id text NOT NULL,project_id text NOT NULL,
  deur_number text NOT NULL,status text NOT NULL,superseded_by_revision_id uuid
);
CREATE TABLE erp.customer_review_batch_items(
  batch_id uuid NOT NULL,company_id text NOT NULL,customer_id text NOT NULL,project_id text NOT NULL,deur_id uuid NOT NULL
);
CREATE TABLE erp.notification_outbox(
  id uuid PRIMARY KEY,company_id text NOT NULL,source_aggregate_type text NOT NULL,source_aggregate_id text NOT NULL,
  notification_type text NOT NULL,status text NOT NULL,attempt_count integer NOT NULL DEFAULT 0,
  provider_name text,provider_message_id text,sent_at timestamptz,claimed_by uuid,claimed_at timestamptz,
  lease_expires_at timestamptz,requires_review_credential boolean NOT NULL,
  recipient_destination text NOT NULL,recipient_display_name text NOT NULL
);
CREATE TABLE erp.notification_delivery_attempts(notification_id uuid NOT NULL);
CREATE TABLE erp.notification_delivery_envelopes(notification_id uuid NOT NULL,retired_at timestamptz);

INSERT INTO erp.companies VALUES ('TENANT-SYNTHETIC-001',true),('TENANT-SYNTHETIC-002',true);
INSERT INTO erp.users VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','TENANT-SYNTHETIC-001','active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','TENANT-SYNTHETIC-002','active');
INSERT INTO erp.app_roles VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','system-administrator',true,NULL);
INSERT INTO erp.user_roles VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO erp.effective_user_permissions VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','settings.update');
INSERT INTO erp.projects VALUES ('PROJECT-SYNTHETIC-001','TENANT-SYNTHETIC-001','CUSTOMER-SYNTHETIC-001',true,NULL);
INSERT INTO erp.customer_review_batches VALUES (
  '11111111-1111-4111-8111-111111111111','TENANT-SYNTHETIC-001','PROJECT',clock_timestamp(),NULL,NULL,
  clock_timestamp()+interval '1 day','PROJECT-SYNTHETIC-001','CUSTOMER-SYNTHETIC-001',
  '[{"name":"Reviewer One","email":"reviewer.one@example.test"},{"name":"Reviewer Two","email":"reviewer.two@example.test"}]',
  'credential-hash-before',1
);
INSERT INTO erp.deurs VALUES (
  '22222222-2222-4222-8222-222222222222','TENANT-SYNTHETIC-001','CUSTOMER-SYNTHETIC-001','PROJECT-SYNTHETIC-001',
  'DEUR-2026-999999','Submitted',NULL
);
INSERT INTO erp.customer_review_batch_items VALUES (
  '11111111-1111-4111-8111-111111111111','TENANT-SYNTHETIC-001','CUSTOMER-SYNTHETIC-001','PROJECT-SYNTHETIC-001',
  '22222222-2222-4222-8222-222222222222'
);
INSERT INTO erp.notification_outbox VALUES
  ('33333333-3333-4333-8333-333333333333','TENANT-SYNTHETIC-001','CUSTOMER_REVIEW_BATCH','11111111-1111-4111-8111-111111111111',
   'CUSTOMER_GROUPED_REVIEW_REQUESTED','Pending',0,NULL,NULL,NULL,NULL,NULL,NULL,true,'reviewer.one@example.test','Reviewer One'),
  ('44444444-4444-4444-8444-444444444444','TENANT-SYNTHETIC-001','CUSTOMER_REVIEW_BATCH','11111111-1111-4111-8111-111111111111',
   'CUSTOMER_GROUPED_REVIEW_REQUESTED','Pending',0,NULL,NULL,NULL,NULL,NULL,NULL,true,'reviewer.two@example.test','Reviewer Two');

SELECT set_config('request.jwt.claim.role','service_role',false);
