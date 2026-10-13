\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %', message; END IF; END $$;

SELECT pg_temp.assert_true(position('activity_type=''shift'' AND action=''end''' IN pg_get_functiondef('erp.command_transition_deur_activity(jsonb)'::regprocedure))>0,'activity transition checks shift end');
SELECT pg_temp.assert_true(position('activity_type=''shift'' AND action=''end''' IN pg_get_functiondef('erp.command_complete_deur_shift(jsonb)'::regprocedure))>0,'repeat End Shift checks shift end');
SELECT pg_temp.assert_true(position('activity_type=''shift'' AND action=''end''' IN pg_get_functiondef('erp.command_record_deur_travel_checkpoint(jsonb)'::regprocedure))>0,'travel checkpoint checks shift end');
SELECT pg_temp.assert_true(position('activity_type=''shift'' AND action=''end''' IN pg_get_functiondef('erp.command_record_deur_refuel(jsonb)'::regprocedure))>0,'refuel checks shift end');
SELECT pg_temp.assert_true(position('enqueue_submitted_deur_customer_review(current_deur.id)' IN pg_get_functiondef('erp.command_submit_deur(jsonb)'::regprocedure))>0,'successful Submit retains customer acknowledgement handoff');
SELECT pg_temp.assert_true(position('activityCodeId' IN pg_get_functiondef('erp.command_create_assignment(jsonb)'::regprocedure))>0,'Assignment still supports Activity Code when present');
SELECT pg_temp.assert_true(position(' OR nullif(btrim(command->>''activityCodeId''),'''') IS NULL' IN pg_get_functiondef('erp.command_create_assignment(jsonb)'::regprocedure))=0,'Activity Code no longer required');
ROLLBACK;
SELECT 'POST_SHIFT_DEUR_MUTATION_GUARD_PASS';
