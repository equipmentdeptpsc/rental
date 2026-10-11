BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Preserve historical rows (NULL) while making new Assignment identity explicit.
ALTER TABLE erp.assignments ADD COLUMN customer_id text;
ALTER TABLE erp.assignments ADD CONSTRAINT fk_assignment_company_customer
 FOREIGN KEY(company_id,customer_id) REFERENCES erp.customers(company_id,id) NOT VALID;
ALTER TABLE erp.assignments VALIDATE CONSTRAINT fk_assignment_company_customer;

CREATE FUNCTION erp.assignment_customer_from_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE project_customer text;
BEGIN
 SELECT customer_id INTO project_customer FROM erp.projects
 WHERE id=NEW.project_id AND company_id=NEW.company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_PROJECT_NOT_FOUND'; END IF;
 IF NEW.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM project_customer
 THEN RAISE EXCEPTION 'CUSTOMER_PROJECT_MISMATCH'; END IF;
 NEW.customer_id=project_customer;
 RETURN NEW;
END $$;
CREATE TRIGGER assignment_customer_project_guard
 BEFORE INSERT OR UPDATE OF project_id,customer_id ON erp.assignments
 FOR EACH ROW EXECUTE FUNCTION erp.assignment_customer_from_project();

CREATE FUNCTION erp.command_create_assignment_with_customer(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); selected_customer text=nullif(btrim(command->>'customerId'),''); result jsonb; canonical_customer text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
 IF NOT erp.current_user_has_permission('assignment.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
 IF selected_customer IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.customers c JOIN erp.projects p ON p.customer_id=c.id AND p.company_id=c.company_id
  WHERE c.id=selected_customer AND c.company_id=tenant AND c.active AND c.deleted_at IS NULL
    AND p.id=command->>'projectId' AND p.active AND p.deleted_at IS NULL
 ) THEN RETURN jsonb_build_object('success',false,'code','CUSTOMER_PROJECT_MISMATCH'); END IF;
 result=erp.command_create_assignment(command-'customerId');
 IF result->>'success'<>'true' THEN RETURN result; END IF;
 SELECT customer_id INTO canonical_customer FROM erp.assignments WHERE id=result->'value'->>'id' AND company_id=tenant;
 IF canonical_customer IS DISTINCT FROM selected_customer THEN RAISE EXCEPTION 'CUSTOMER_PROJECT_MISMATCH'; END IF;
 RETURN jsonb_set(result,'{value,customerId}',to_jsonb(canonical_customer),true);
END $$;

ALTER FUNCTION erp.assignment_customer_from_project() OWNER TO postgres;
ALTER FUNCTION erp.command_create_assignment_with_customer(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_assignment_with_customer(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_assignment_with_customer(jsonb) TO authenticated;
COMMIT;
