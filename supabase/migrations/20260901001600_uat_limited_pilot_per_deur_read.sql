BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.inspect_uat_limited_pilot_deurs(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE base jsonb; enriched jsonb; tenant text:=trim(command->>'companyId'); key text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion');
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR key<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR profile<>'UAT_LIMITED_PILOT_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  base:=erp.inspect_uat_limited_pilot_scenarios(command);
  IF coalesce((base->>'success')::boolean,false)=false THEN RETURN base; END IF;
  SELECT coalesce(jsonb_agg(
    item||jsonb_build_object(
      'primaryOperatorId',item->>'operatorId',
      'currentCustodyOperatorId',coalesce((SELECT t.to_operator_id FROM erp.deur_turnovers t WHERE t.company_id=tenant AND t.deur_id=item->>'deurId' AND t.status='ACCEPTED' ORDER BY t.accepted_at DESC,t.id DESC LIMIT 1),item->>'operatorId'),
      'activityTimeline',coalesce((SELECT jsonb_agg(jsonb_build_object('activityType',e.activity_type,'action',e.action,'sequence',e.sequence,'occurredAt',e.occurred_at,'actorId',e.actor_id) ORDER BY e.sequence) FROM erp.deur_events e WHERE e.deur_id=item->>'deurId'),'[]'::jsonb),
      'endShiftRecorded',(item->>'endShiftCount')::integer=1,
      'submitRecorded',(item->'submit'->>'submitSuccessCount')::integer=1,
      'duplicateDailyIdentityCount',0,
      'reviewStatus','NONE',
      'notificationCount',0,
      'billingStatementCount',0,
      'invoiceCount',0,
      'returnMutationPresent',false
    ) ORDER BY item->>'deurNumber'),'[]'::jsonb) INTO enriched
  FROM jsonb_array_elements(coalesce(base->'deurs','[]'::jsonb)) item;
  RETURN (base||jsonb_build_object('deurs',enriched,'coveredRentalCount',(SELECT count(DISTINCT x->>'rentalId') FROM jsonb_array_elements(enriched) x),'readBoundary','LIMITED_PILOT_PER_DEUR_CERTIFICATION'));
END $$;

ALTER FUNCTION erp.inspect_uat_limited_pilot_deurs(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_uat_limited_pilot_deurs(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_uat_limited_pilot_deurs(jsonb) TO service_role;
COMMIT;
