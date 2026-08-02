BEGIN;

CREATE OR REPLACE FUNCTION erp.canonical_deur_snapshot_text(value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog
AS $$
DECLARE kind text; result text;
BEGIN
  IF value IS NULL THEN RETURN 'null'; END IF;
  kind=jsonb_typeof(value);
  IF kind='array' THEN
    SELECT '['||coalesce(string_agg(erp.canonical_deur_snapshot_text(item),',' ORDER BY ordinal),'')||']'
      INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS entries(item,ordinal);
    RETURN result;
  ELSIF kind='object' THEN
    SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||erp.canonical_deur_snapshot_text(item),',' ORDER BY key),'')||'}'
      INTO result FROM jsonb_each(value) AS entries(key,item) WHERE key<>'capturedAt';
    RETURN result;
  END IF;
  RETURN value::text;
END $$;

ALTER FUNCTION erp.canonical_deur_snapshot_text(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.canonical_deur_snapshot_text(jsonb) FROM PUBLIC,anon,authenticated;

COMMIT;
