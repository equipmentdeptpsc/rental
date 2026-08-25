BEGIN;
SET search_path TO erp, public;

CREATE OR REPLACE FUNCTION erp.command_activate_rental(command jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth AS
$$ SELECT erp.execute_rental_lifecycle_transition(command,'ACTIVATE_RENTAL','Released','Active','rental.activate') $$;

COMMIT;
