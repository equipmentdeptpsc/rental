BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Raw sequence is immutable append evidence. Logical sequence is the ordered
-- operational projection used by submitted/manual DEUR business rules.
CREATE OR REPLACE FUNCTION erp.validate_deur_event_supersession_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE original_event erp.deur_events%ROWTYPE; replacement_event erp.deur_events%ROWTYPE;
BEGIN
  SELECT * INTO original_event FROM erp.deur_events WHERE id=NEW.original_event_id FOR KEY SHARE;
  SELECT * INTO replacement_event FROM erp.deur_events WHERE id=NEW.replacement_event_id FOR KEY SHARE;
  IF original_event.id IS NULL OR replacement_event.id IS NULL
     OR original_event.company_id<>NEW.company_id OR replacement_event.company_id<>NEW.company_id
     OR original_event.deur_id<>NEW.deur_id OR replacement_event.deur_id<>NEW.deur_id
     OR original_event.deur_id<>replacement_event.deur_id THEN
    RAISE EXCEPTION 'DEUR event supersession scope mismatch' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    WITH RECURSIVE descendants(event_id, path) AS (
      SELECT link.replacement_event_id, ARRAY[link.original_event_id, link.replacement_event_id]
      FROM erp.deur_event_supersessions link
      WHERE link.original_event_id=NEW.replacement_event_id
      UNION ALL
      SELECT link.replacement_event_id, descendants.path || link.replacement_event_id
      FROM erp.deur_event_supersessions link
      JOIN descendants ON link.original_event_id=descendants.event_id
      WHERE NOT link.replacement_event_id=ANY(descendants.path)
    )
    SELECT 1 FROM descendants WHERE event_id=NEW.original_event_id
  ) THEN
    RAISE EXCEPTION 'DEUR event supersession cycle is not supported' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

-- One terminal replacement inherits its lineage root as the deterministic
-- logical tie-breaker. Manual transcription is ordered by physical occurrence
-- as already required by validate_manual_deur_physical_timeline.
CREATE OR REPLACE FUNCTION erp.effective_deur_event_order(target_deur_id text)
RETURNS TABLE(event_id text, deur_id text, physical_sequence integer, logical_sequence integer, lineage_root_event_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,pg_catalog AS $$
  WITH RECURSIVE chains AS (
    SELECT link.deur_id, link.original_event_id AS root_event_id, link.replacement_event_id AS event_id,
      ARRAY[link.original_event_id, link.replacement_event_id]::text[] AS path
    FROM erp.deur_event_supersessions link
    WHERE link.deur_id=target_deur_id
      AND NOT EXISTS(SELECT 1 FROM erp.deur_event_supersessions prior WHERE prior.replacement_event_id=link.original_event_id)
    UNION ALL
    SELECT chains.deur_id, chains.root_event_id, link.replacement_event_id,
      chains.path || link.replacement_event_id
    FROM chains
    JOIN erp.deur_event_supersessions link ON link.original_event_id=chains.event_id
    WHERE NOT link.replacement_event_id=ANY(chains.path)
  ), terminal_replacements AS (
    SELECT chains.* FROM chains
    WHERE NOT EXISTS(SELECT 1 FROM erp.deur_event_supersessions next_link WHERE next_link.original_event_id=chains.event_id)
  ), effective AS (
    SELECT event_record.id AS event_id, event_record.deur_id, event_record.sequence AS physical_sequence,
      event_record.activity_type, event_record.action, event_record.occurred_at, target.creation_source,
      coalesce(terminal_replacements.root_event_id,event_record.id) AS lineage_root_event_id,
      coalesce(root_event.sequence,event_record.sequence) AS lineage_sequence
    FROM erp.effective_deur_events(target_deur_id) event_record
    JOIN erp.deurs target ON target.id=event_record.deur_id
    LEFT JOIN terminal_replacements ON terminal_replacements.event_id=event_record.id
    LEFT JOIN erp.deur_events root_event ON root_event.id=terminal_replacements.root_event_id
  ), ordered AS (
    SELECT effective.*, row_number() OVER (
      ORDER BY
        CASE WHEN creation_source='MANUAL_WEB' THEN occurred_at END,
        CASE WHEN creation_source='MANUAL_WEB' THEN CASE WHEN action='start' THEN 0 WHEN activity_type='shift' THEN 2 ELSE 1 END ELSE 0 END,
        lineage_sequence, physical_sequence, event_id
    )::integer AS logical_sequence
    FROM effective
  )
  SELECT event_id, deur_id, physical_sequence, logical_sequence, lineage_root_event_id
  FROM ordered
  ORDER BY logical_sequence, event_id;
$$;
REVOKE ALL ON FUNCTION erp.effective_deur_event_order(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp.is_manual_deur_encoding_bootstrap_event(target erp.deurs,candidate erp.deur_events)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
  WITH RECURSIVE ancestry(event_id) AS (
    SELECT candidate.id
    UNION ALL
    SELECT link.original_event_id
    FROM erp.deur_event_supersessions link
    JOIN ancestry ON link.replacement_event_id=ancestry.event_id
  )
  SELECT target.creation_source='MANUAL_WEB' AND candidate.deur_id=target.id AND candidate.source='manual-web'
    AND candidate.activity_type='shift' AND candidate.action='start'
    AND EXISTS(
      SELECT 1 FROM ancestry
      JOIN erp.deur_events original_event ON original_event.id=ancestry.event_id
      WHERE original_event.sequence=1 AND original_event.source='manual-web'
        AND original_event.activity_type='shift' AND original_event.action='start' AND original_event.is_open
        AND original_event.occurred_at=target.created_at AND original_event.server_accepted_at=target.created_at
    );
$$;

CREATE OR REPLACE FUNCTION erp.recalculate_deur_event_totals(target_deur_id text)
RETURNS TABLE(shift_minutes integer,operation_minutes integer,idle_minutes integer,standby_minutes integer,meal_break_minutes integer,breakdown_minutes integer)
LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  WITH paired AS (
    SELECT event_record.activity_type,event_record.action,event_record.occurred_at,
      lead(event_record.action) OVER (PARTITION BY event_record.activity_type ORDER BY event_order.logical_sequence) AS next_action,
      lead(event_record.occurred_at) OVER (PARTITION BY event_record.activity_type ORDER BY event_order.logical_sequence) AS ended_at
    FROM erp.effective_deur_event_order(target_deur_id) event_order
    JOIN erp.deur_events event_record ON event_record.id=event_order.event_id
  ), totals AS (
    SELECT activity_type,coalesce(sum(extract(epoch FROM (ended_at-occurred_at))/60),0)::integer AS minutes
    FROM paired WHERE action='start' AND next_action='end' GROUP BY activity_type
  ) SELECT coalesce(max(minutes) FILTER(WHERE activity_type='shift'),0),coalesce(max(minutes) FILTER(WHERE activity_type='operation'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='idle'),0),coalesce(max(minutes) FILTER(WHERE activity_type='standby'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='mealBreak'),0),coalesce(max(minutes) FILTER(WHERE activity_type='breakdown'),0) FROM totals;
$$;

CREATE OR REPLACE FUNCTION erp.validate_manual_deur_physical_timeline(target erp.deurs)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE item record; open_activity text; shift_ended boolean:=false; previous_reading numeric; policy text; closing_reading numeric; shift_end_count integer;
BEGIN
  IF target.creation_source<>'MANUAL_WEB' THEN RETURN 'MANUAL_DEUR_REQUIRED'; END IF;
  FOR item IN
    WITH physical_events AS (
      SELECT e.activity_type,e.action,e.occurred_at,event_order.logical_sequence,e.id
      FROM erp.effective_deur_event_order(target.id) event_order
      JOIN erp.deur_events e ON e.id=event_order.event_id
      WHERE NOT erp.is_manual_deur_encoding_bootstrap_event(target,e)
        OR (e.activity_type='operation' AND NOT EXISTS(
          SELECT 1 FROM erp.effective_deur_event_order(target.id) later_order
          JOIN erp.deur_events later_start ON later_start.id=later_order.event_id
          WHERE later_start.activity_type<>'shift' AND later_start.action='start'
            AND NOT erp.is_manual_deur_encoding_bootstrap_event(target,later_start)
        ))
    )
    SELECT activity_type,action,occurred_at,logical_sequence FROM physical_events
    ORDER BY occurred_at, CASE WHEN action='start' THEN 0 WHEN activity_type='shift' THEN 2 ELSE 1 END, logical_sequence, id
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
  SELECT count(*) INTO shift_end_count
  FROM erp.effective_deur_event_order(target.id) event_order
  JOIN erp.deur_events e ON e.id=event_order.event_id
  WHERE e.activity_type='shift' AND e.action='end' AND NOT erp.is_manual_deur_encoding_bootstrap_event(target,e);
  IF shift_end_count<>1 OR NOT shift_ended THEN RETURN 'PHYSICAL_SHIFT_END_REQUIRED'; END IF;
  FOR item IN
    SELECT reading FROM (
      SELECT c.id::text AS id,c.client_occurred_at,c.reading FROM erp.deur_meter_checkpoints c WHERE c.deur_id=target.id AND c.kind='checkpoint' AND c.meter_dimension='odometer'
      UNION ALL
      SELECT r.id,r.client_occurred_at,r.odometer FROM erp.deur_refuels r WHERE r.deur_id=target.id
    ) physical_meter ORDER BY client_occurred_at,id
  LOOP
    IF item.reading<0 OR (previous_reading IS NOT NULL AND item.reading<previous_reading) THEN RETURN 'PHYSICAL_METER_ROLLBACK'; END IF;
    previous_reading:=item.reading;
  END LOOP;
  SELECT operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=target.company_id;
  closing_reading:=target.closing_odometer;
  IF policy IN ('odometer','both') AND closing_reading IS NULL THEN RETURN 'PHYSICAL_CLOSING_METER_REQUIRED'; END IF;
  IF closing_reading IS NOT NULL AND (closing_reading<0 OR (previous_reading IS NOT NULL AND closing_reading<previous_reading)) THEN RETURN 'PHYSICAL_METER_ROLLBACK'; END IF;
  RETURN NULL;
END $$;

COMMIT;
