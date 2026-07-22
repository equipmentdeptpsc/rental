BEGIN;

-- Supabase/PostgREST-only configuration. Ordinary PostgreSQL installations
-- do not have the authenticator role and safely skip this block.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN
    EXECUTE 'ALTER ROLE authenticator SET pgrst.db_schemas = ''public, graphql_public, erp''';
    PERFORM pg_notify('pgrst','reload config');
  END IF;
END $$;

COMMIT;
