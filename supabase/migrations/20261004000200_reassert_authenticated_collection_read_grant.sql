BEGIN;

-- Reassert the complete browser read chain for the canonical Collection
-- projection. This changes privileges/cache metadata only; RLS remains the
-- tenant boundary and no collection rows are created, changed, or deleted.
GRANT USAGE ON SCHEMA erp TO authenticated;
GRANT SELECT ON TABLE erp.collections TO authenticated;

-- Reload PostgREST's schema cache after the role capability change so the
-- authenticated browser role observes the grant immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
