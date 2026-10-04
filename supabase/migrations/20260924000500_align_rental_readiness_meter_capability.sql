BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
DO $migration$
DECLARE definition text;
  old_predicate constant text := $$CASE WHEN snap->>'meterRequirement' IN ('odometer','both') AND coalesce(e.maintenance_type,'') NOT IN ('Kilometers','Mileage') THEN 'meterConfiguration' WHEN snap->>'meterRequirement' IN ('hourMeter','both') AND coalesce(e.maintenance_type,'')<>'Engine Hours' THEN 'meterConfiguration' END$$;
  new_predicate constant text := $$CASE WHEN NOT erp.equipment_supports_meter_requirement(erp.effective_equipment_meter_capability(e.meter_capability,e.maintenance_type),coalesce(snap->>'meterRequirement','none')) THEN 'meterConfiguration' END$$;
BEGIN
  SELECT pg_get_functiondef('erp.rental_release_readiness(text)'::regprocedure) INTO definition;
  IF position(old_predicate IN definition)=0 THEN RAISE EXCEPTION 'unexpected rental release readiness definition'; END IF;
  EXECUTE replace(definition,old_predicate,new_predicate);
END $migration$;
COMMIT;
