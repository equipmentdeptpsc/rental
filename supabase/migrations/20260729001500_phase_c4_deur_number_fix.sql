BEGIN;
SET search_path TO erp, public;

CREATE OR REPLACE FUNCTION next_deur_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE
  sequence_value bigint;
  target_year integer=extract(year from clock_timestamp())::integer;
  tenant text=current_company_id();
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'authenticated company required' USING ERRCODE='42501'; END IF;
  INSERT INTO number_sequences(company_id,scope,sequence_year,current_value,prefix)
  VALUES(tenant,'DEUR',target_year,1,'DEUR')
  ON CONFLICT(company_id,scope,sequence_year) DO UPDATE
  SET current_value=number_sequences.current_value+1,updated_at=clock_timestamp(),row_version=number_sequences.row_version+1
  RETURNING current_value INTO sequence_value;
  RETURN 'DEUR-'||target_year||'-'||lpad(sequence_value::text,6,'0');
END $$;

REVOKE ALL ON FUNCTION next_deur_number() FROM PUBLIC,anon,authenticated;

COMMIT;
