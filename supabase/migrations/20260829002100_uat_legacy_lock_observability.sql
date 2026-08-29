CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_advisory_lock(target_tenant text,target_scenario text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=erp,pg_catalog AS $$
WITH k AS (SELECT hashtextextended(target_tenant||':uat-multi-equipment:'||target_scenario,0) AS v)
SELECT jsonb_build_object('advisoryLockHeld',CASE WHEN EXISTS(
 SELECT 1 FROM pg_locks l,k WHERE l.locktype='advisory' AND l.classid=((k.v>>32)&4294967295)::oid AND l.objid=(k.v&4294967295)::oid AND l.objsubid=1
) THEN 'YES' ELSE 'NO' END)
WHERE target_tenant='TENANT-LOCAL-001' AND target_scenario='MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' $$;
ALTER FUNCTION erp.inspect_isolated_uat_advisory_lock(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_advisory_lock(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_advisory_lock(text,text) TO service_role;
