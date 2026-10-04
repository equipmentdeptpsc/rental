BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- The DEUR expectation is immutable once a Rental is reserved.  At that exact
-- boundary, derive it from Equipment through the canonical database helper;
-- never accept a browser-provided meter policy as the frozen source of truth.
DO $migration$
DECLARE definition text;
  old_fragment constant text := $$'meterRequirement',coalesce(prep->>'meterRequirement','none')$$;
  new_fragment constant text := $$'meterRequirement',(SELECT erp.effective_equipment_meter_capability(e.meter_capability,e.maintenance_type) FROM erp.equipment e WHERE e.id=line_row.equipment_id AND e.company_id=tenant AND e.deleted_at IS NULL)$$;
BEGIN
  SELECT pg_get_functiondef('erp.command_reserve_rental(jsonb)'::regprocedure) INTO definition;
  IF position(old_fragment IN definition)=0 THEN
    RAISE EXCEPTION 'unexpected command_reserve_rental meter snapshot definition';
  END IF;
  EXECUTE replace(definition, old_fragment, new_fragment);
END $migration$;
COMMIT;
