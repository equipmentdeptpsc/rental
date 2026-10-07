BEGIN;

-- The collection projection is read through the authenticated tenant-scoped
-- repository. RLS supplies the tenant boundary; this grant supplies the
-- table-level read capability required by PostgREST.
GRANT SELECT ON TABLE erp.collections TO authenticated;

COMMIT;
