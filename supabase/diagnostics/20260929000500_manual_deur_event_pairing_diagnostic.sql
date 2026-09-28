-- Diagnostic-only pairing capture for the correction-revision event clone.
-- This migration is prepared for isolated-UAT diagnosis and must not be
-- applied until the exact replacement event timestamps are intentionally
-- captured. It raises before any parent DEUR update can persist.
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.recalculate_deur_event_totals(target_deur_id text)
RETURNS TABLE(
  shift_minutes integer,
  operation_minutes integer,
  idle_minutes integer,
  standby_minutes integer,
  meal_break_minutes integer,
  breakdown_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,pg_catalog
AS $$
DECLARE
  target erp.deurs%ROWTYPE;
  operation_pairs jsonb;
  diagnostic jsonb;
BEGIN
  SELECT d.* INTO target
  FROM erp.deurs AS d
  WHERE d.id=target_deur_id;

  IF target.previous_revision_id IS NOT NULL
     AND target.creation_source='MANUAL_WEB'
     AND target.correction_reason_code IS NOT NULL
  THEN
    WITH paired AS (
      SELECT
        activity_type,
        action,
        sequence,
        occurred_at,
        lead(action) OVER (PARTITION BY activity_type ORDER BY sequence) AS next_action,
        lead(sequence) OVER (PARTITION BY activity_type ORDER BY sequence) AS end_sequence,
        lead(occurred_at) OVER (PARTITION BY activity_type ORDER BY sequence) AS ended_at
      FROM erp.deur_events
      WHERE deur_id=target_deur_id
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'startSequence',sequence,
          'endSequence',end_sequence,
          'startTimestamp',to_char(occurred_at,'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
          'endTimestamp',to_char(ended_at,'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
          'startDate',occurred_at::date,
          'endDate',ended_at::date,
          'startTimezoneOffsetSeconds',extract(timezone FROM occurred_at),
          'endTimezoneOffsetSeconds',extract(timezone FROM ended_at),
          'durationSeconds',extract(epoch FROM (ended_at-occurred_at)),
          'durationMinutesBeforeCast',extract(epoch FROM (ended_at-occurred_at))/60,
          'durationMinutesRounded',(extract(epoch FROM (ended_at-occurred_at))/60)::integer
        ) ORDER BY sequence
      ),
      '[]'::jsonb
    ) INTO operation_pairs
    FROM paired
    WHERE activity_type='operation' AND action='start' AND next_action='end';

    diagnostic := jsonb_build_object(
      'targetClassification','CORRECTION_REPLACEMENT',
      'eventType','shift',
      'eventAction','end',
      'targetDeurId',target_deur_id,
      'sourceRevisionId',target.previous_revision_id,
      'operationPairs',operation_pairs
    );

    RAISE EXCEPTION USING
      ERRCODE='PZ003',
      MESSAGE='CORRECTION_EVENT_PAIRING_DIAGNOSTIC',
      DETAIL=diagnostic::text;
  END IF;

  RETURN QUERY
  WITH paired AS (
    SELECT activity_type,action,occurred_at,
      lead(action) OVER (PARTITION BY activity_type ORDER BY sequence) AS next_action,
      lead(occurred_at) OVER (PARTITION BY activity_type ORDER BY sequence) AS ended_at
    FROM erp.deur_events
    WHERE deur_id=target_deur_id
  ), totals AS (
    SELECT activity_type,
      coalesce(sum(extract(epoch FROM (ended_at-occurred_at))/60),0)::integer AS minutes
    FROM paired
    WHERE action='start' AND next_action='end'
    GROUP BY activity_type
  )
  SELECT
    coalesce(max(minutes) FILTER(WHERE activity_type='shift'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='operation'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='idle'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='standby'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='mealBreak'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='breakdown'),0)
  FROM totals;
END;
$$;

REVOKE ALL ON FUNCTION erp.recalculate_deur_event_totals(text) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the existing safe diagnostic transport while adding only the new
-- pairing diagnostic code. No normal response contract fields are removed.
DO $$
DECLARE
  definition text;
  function_oid oid;
  exception_marker text := E'  EXCEPTION WHEN SQLSTATE ''PZ002'' THEN';
  exception_replacement text := E'  EXCEPTION WHEN SQLSTATE ''PZ003'' THEN\n    GET STACKED DIAGNOSTICS outer_sqlstate=RETURNED_SQLSTATE, outer_detail=PG_EXCEPTION_DETAIL;\n    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_EVENT_PAIRING_DIAGNOSTIC'',''message'',''Correction event pairing was captured before validation.'',''retryable'',false,''refreshRequired'',false,''details'',outer_detail::jsonb);\n  WHEN SQLSTATE ''PZ002'' THEN';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='erp'
    AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';

  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing';
  END IF;
  IF position(exception_marker IN definition)=0 THEN
    RAISE EXCEPTION 'correction event totals diagnostic handler is missing';
  END IF;
  IF position('CORRECTION_EVENT_PAIRING_DIAGNOSTIC' IN definition)>0 THEN
    RAISE EXCEPTION 'correction event pairing diagnostic is already installed';
  END IF;

  definition:=replace(definition,exception_marker,exception_replacement);
  EXECUTE definition;
END;
$$;

COMMIT;
