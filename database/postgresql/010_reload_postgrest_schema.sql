BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN
    PERFORM pg_notify('pgrst','reload schema');
    PERFORM pg_notify('pgrst','reload config');
  END IF;
END $$;

COMMIT;
