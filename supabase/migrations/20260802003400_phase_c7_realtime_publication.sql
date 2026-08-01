BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication
     WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required Supabase Realtime publication is unavailable'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'erp'
       AND tablename = 'deur_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE erp.deur_events;
  END IF;
END
$$;

COMMIT;
