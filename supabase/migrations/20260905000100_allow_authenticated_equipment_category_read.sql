BEGIN;

-- Equipment Categories are a global, non-sensitive reference catalog. The
-- remote Equipment form reads only these columns; no write or anonymous
-- privileges are changed.
GRANT SELECT (id, code, name, description, active, deleted_at, sort_order)
  ON TABLE erp.equipment_categories TO authenticated;

COMMIT;
