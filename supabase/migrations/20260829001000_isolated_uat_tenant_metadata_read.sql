BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.get_isolated_uat_tenant_metadata(target_tenant text)
RETURNS TABLE(id text,name text,active boolean,environment_class text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=erp,auth,extensions,pg_catalog AS $$
 SELECT c.id,c.name,c.active,c.environment_class FROM erp.companies c
 WHERE c.id=target_tenant AND c.active AND c.environment_class IN ('compatibility','test');
$$;
REVOKE ALL ON FUNCTION erp.get_isolated_uat_tenant_metadata(text) FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION erp.get_isolated_uat_tenant_metadata(text) TO service_role;
COMMIT;
