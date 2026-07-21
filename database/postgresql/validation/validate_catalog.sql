SET search_path TO erp, public;
DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='erp') < 39 THEN RAISE EXCEPTION 'expected schema tables are missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='commercial_snapshots_immutable') THEN RAISE EXCEPTION 'commercial snapshot immutability trigger missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='erp' AND indexname='uq_active_deur_billing') THEN RAISE EXCEPTION 'DEUR consumption index missing'; END IF;
  IF to_regclass('erp.maintenance_records') IS NULL OR to_regclass('erp.equipment_daily_logs') IS NULL THEN RAISE EXCEPTION 'operational maintenance/log tables missing'; END IF;
  IF (SELECT count(*) FROM equipment_statuses)<>4 OR (SELECT count(*) FROM rental_statuses)<>8 THEN RAISE EXCEPTION 'seed data is not deterministic'; END IF;
END $$;
