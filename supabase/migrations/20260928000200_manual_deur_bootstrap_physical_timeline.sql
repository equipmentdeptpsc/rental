BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- A MANUAL_WEB creation records immutable server-acceptance bootstrap starts.
-- They are normally encoding markers, but are also the sole physical start
-- evidence when an office transcribes only the corresponding physical end.
-- Keep them out of a later separately-transcribed primary interval, while
-- retaining them as the initial physical seed otherwise.
CREATE OR REPLACE FUNCTION erp.validate_manual_deur_physical_timeline(target erp.deurs)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  item record; open_activity text; shift_ended boolean:=false; previous_reading numeric;
  policy text; closing_reading numeric; shift_end_count integer;
BEGIN
  IF target.creation_source<>'MANUAL_WEB' THEN RETURN 'MANUAL_DEUR_REQUIRED'; END IF;

  FOR item IN
    WITH physical_events AS (
      SELECT e.activity_type,e.action,e.occurred_at,e.sequence
      FROM erp.deur_events e
      WHERE e.deur_id=target.id
        AND (
          NOT erp.is_manual_deur_encoding_bootstrap_event(target,e)
          OR e.activity_type='shift'
          OR (
            e.activity_type='operation'
            AND NOT EXISTS(
              SELECT 1
              FROM erp.deur_events later_start
              WHERE later_start.deur_id=target.id
                AND later_start.activity_type<>'shift'
                AND later_start.action='start'
                AND NOT erp.is_manual_deur_encoding_bootstrap_event(target,later_start)
            )
          )
        )
    )
    SELECT activity_type,action,occurred_at,sequence
    FROM physical_events
    ORDER BY occurred_at,
      CASE WHEN action='start' THEN 0 WHEN activity_type='shift' THEN 2 ELSE 1 END,
      sequence
  LOOP
    IF item.activity_type='shift' AND item.action='end' THEN
      IF shift_ended OR open_activity IS NOT NULL THEN RETURN 'PHYSICAL_ACTIVITY_INCOMPLETE'; END IF;
      shift_ended:=true;
    ELSIF item.action='start' THEN
      IF shift_ended OR open_activity IS NOT NULL THEN RETURN 'PHYSICAL_ACTIVITY_OVERLAP'; END IF;
      open_activity:=item.activity_type;
    ELSIF item.action='end' THEN
      IF open_activity IS NULL OR open_activity<>item.activity_type THEN RETURN 'PHYSICAL_ACTIVITY_MISMATCH'; END IF;
      open_activity:=NULL;
    END IF;
  END LOOP;
  IF open_activity IS NOT NULL THEN RETURN 'PHYSICAL_ACTIVITY_INCOMPLETE'; END IF;
  SELECT count(*) INTO shift_end_count FROM erp.deur_events e
    WHERE e.deur_id=target.id AND e.activity_type='shift' AND e.action='end'
      AND NOT erp.is_manual_deur_encoding_bootstrap_event(target,e);
  IF shift_end_count<>1 OR NOT shift_ended THEN RETURN 'PHYSICAL_SHIFT_END_REQUIRED'; END IF;

  FOR item IN
    SELECT reading FROM (
      SELECT c.id::text AS id,c.client_occurred_at,c.reading
      FROM erp.deur_meter_checkpoints c
      WHERE c.deur_id=target.id AND c.kind='checkpoint' AND c.meter_dimension='odometer'
      UNION ALL
      SELECT r.id,r.client_occurred_at,r.odometer
      FROM erp.deur_refuels r WHERE r.deur_id=target.id
    ) physical_meter
    ORDER BY client_occurred_at,id
  LOOP
    IF item.reading<0 OR (previous_reading IS NOT NULL AND item.reading<previous_reading) THEN
      RETURN 'PHYSICAL_METER_ROLLBACK';
    END IF;
    previous_reading:=item.reading;
  END LOOP;
  SELECT operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy
    FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=target.company_id;
  closing_reading:=target.closing_odometer;
  IF policy IN ('odometer','both') AND closing_reading IS NULL THEN RETURN 'PHYSICAL_CLOSING_METER_REQUIRED'; END IF;
  IF closing_reading IS NOT NULL AND (closing_reading<0 OR (previous_reading IS NOT NULL AND closing_reading<previous_reading)) THEN
    RETURN 'PHYSICAL_METER_ROLLBACK';
  END IF;
  RETURN NULL;
END $$;
ALTER FUNCTION erp.validate_manual_deur_physical_timeline(erp.deurs) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.validate_manual_deur_physical_timeline(erp.deurs) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION erp.validate_manual_deur_physical_timeline(erp.deurs) IS 'MANUAL_WEB final validation uses physical occurrence order, retaining immutable bootstrap starts only when they are the sole physical start evidence.';
COMMIT;
