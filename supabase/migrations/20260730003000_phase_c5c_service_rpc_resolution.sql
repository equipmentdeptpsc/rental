BEGIN;

-- USAGE permits resolving the three explicitly granted C5C functions only.
-- It does not grant any table, sequence, or unrelated function privilege.
GRANT USAGE ON SCHEMA erp TO service_role;

REVOKE ALL ON TABLE erp.notification_outbox,erp.notification_delivery_attempts
  FROM service_role;

COMMIT;
