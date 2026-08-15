BEGIN;
SET search_path TO erp, auth, pg_catalog;

CREATE FUNCTION erp.current_active_operator_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
  SELECT u.operator_id
  FROM erp.users u
  JOIN erp.operators o ON o.id=u.operator_id AND o.company_id=u.company_id
  JOIN erp.companies c ON c.id=u.company_id AND c.active
  WHERE u.id=auth.uid() AND u.status='active' AND o.status='Active' AND o.deleted_at IS NULL
$$;

CREATE FUNCTION erp.current_linked_operator_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
  SELECT u.operator_id FROM erp.users u WHERE u.id=auth.uid() AND u.status='active'
$$;

CREATE FUNCTION erp.current_user_has_any_read_permission(required_permissions text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1
    FROM erp.effective_user_permissions permission
    WHERE permission.user_id=auth.uid()
      AND permission.permission_code=ANY(required_permissions)
  )
$$;

CREATE FUNCTION erp.current_operator_owns_rental(target_company_id text,target_rental_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
  SELECT erp.can_read_company_row(target_company_id) AND EXISTS(
    SELECT 1 FROM erp.rental_equipment_lines l JOIN erp.rentals r ON r.id=l.rental_id AND r.company_id=l.company_id
    WHERE l.company_id=target_company_id AND l.rental_id=target_rental_id
      AND l.operator_id=erp.current_active_operator_id() AND l.deleted_at IS NULL AND l.status IN('Released','Active') AND r.status IN('Released','Active')
  )
$$;

CREATE FUNCTION erp.current_operator_owns_equipment(target_company_id text,target_equipment_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
  SELECT erp.can_read_company_row(target_company_id) AND (
    EXISTS(SELECT 1 FROM erp.assignments a WHERE a.company_id=target_company_id AND a.equipment_id=target_equipment_id AND a.operator_id=erp.current_active_operator_id() AND a.status='Active' AND a.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM erp.rental_equipment_lines l JOIN erp.rentals r ON r.id=l.rental_id AND r.company_id=l.company_id WHERE l.company_id=target_company_id AND l.equipment_id=target_equipment_id AND l.operator_id=erp.current_active_operator_id() AND l.deleted_at IS NULL AND l.status<>'Cancelled' AND r.status IN('Released','Active'))
  )
$$;

CREATE FUNCTION erp.current_operator_owns_project(target_company_id text,target_project_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
  SELECT erp.can_read_company_row(target_company_id) AND (
    EXISTS(SELECT 1 FROM erp.assignments a WHERE a.company_id=target_company_id AND a.project_id=target_project_id AND a.operator_id=erp.current_active_operator_id() AND a.status='Active' AND a.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM erp.rental_equipment_lines l JOIN erp.rentals r ON r.id=l.rental_id AND r.company_id=l.company_id WHERE l.company_id=target_company_id AND r.project_id=target_project_id AND l.operator_id=erp.current_active_operator_id() AND l.deleted_at IS NULL AND l.status<>'Cancelled' AND r.status IN('Released','Active'))
  )
$$;

REVOKE ALL ON FUNCTION erp.current_active_operator_id(),erp.current_linked_operator_id(),erp.current_user_has_any_read_permission(text[]),erp.current_operator_owns_rental(text,text),erp.current_operator_owns_equipment(text,text),erp.current_operator_owns_project(text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.current_active_operator_id(),erp.current_linked_operator_id(),erp.current_user_has_any_read_permission(text[]),erp.current_operator_owns_rental(text,text),erp.current_operator_owns_equipment(text,text),erp.current_operator_owns_project(text,text) TO authenticated;

DROP POLICY IF EXISTS tenant_read ON erp.assignments;
CREATE POLICY operator_owned_or_assignment_reader ON erp.assignments FOR SELECT TO authenticated USING (
  erp.can_read_company_row(company_id) AND (
    (operator_id=erp.current_active_operator_id() AND status='Active' AND deleted_at IS NULL)
    OR (erp.current_linked_operator_id() IS NULL AND erp.current_user_has_any_read_permission(ARRAY['assignment.read','assignment.manage']))
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.rental_equipment_lines;
CREATE POLICY operator_owned_or_rental_reader ON erp.rental_equipment_lines FOR SELECT TO authenticated USING (
  erp.can_read_company_row(company_id) AND (
    (operator_id=erp.current_active_operator_id() AND status IN('Released','Active') AND deleted_at IS NULL)
    OR (erp.current_linked_operator_id() IS NULL AND erp.current_user_has_any_read_permission(ARRAY['rental.read','rental.manage','rental.release']))
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.rentals;
CREATE POLICY operator_owned_or_rental_reader ON erp.rentals FOR SELECT TO authenticated USING (
  erp.can_read_company_row(company_id) AND (
    erp.current_operator_owns_rental(company_id,id)
    OR (erp.current_linked_operator_id() IS NULL AND erp.current_user_has_any_read_permission(ARRAY['rental.read','rental.manage','rental.release']))
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.deurs;
CREATE POLICY operator_owned_or_deur_reader ON erp.deurs FOR SELECT TO authenticated USING (
  erp.can_read_company_row(company_id) AND (
    operator_id=erp.current_active_operator_id()
    OR (erp.current_linked_operator_id() IS NULL AND erp.current_user_has_any_read_permission(ARRAY['deur.read','deur.review','deur.acknowledge']))
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.operators;
CREATE POLICY own_operator_or_operator_reader ON erp.operators FOR SELECT TO authenticated USING (
  erp.can_read_company_row(company_id) AND (
    id=erp.current_active_operator_id()
    OR (erp.current_linked_operator_id() IS NULL AND erp.current_user_has_any_read_permission(ARRAY['operator.read','operator.manage']))
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.equipment;
CREATE POLICY owned_work_equipment_or_equipment_reader ON erp.equipment FOR SELECT TO authenticated USING (
  erp.can_read_company_row(company_id) AND (
    erp.current_operator_owns_equipment(company_id,id)
    OR (erp.current_linked_operator_id() IS NULL AND erp.current_user_has_any_read_permission(ARRAY['equipment.read','equipment.manage']))
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.projects;
CREATE POLICY owned_work_project_or_project_reader ON erp.projects FOR SELECT TO authenticated USING (
  erp.can_read_company_row(company_id) AND (
    erp.current_operator_owns_project(company_id,id)
    OR (erp.current_linked_operator_id() IS NULL AND erp.current_user_has_any_read_permission(ARRAY['project.read','project.manage']))
  )
);

COMMENT ON FUNCTION erp.current_active_operator_id() IS 'Server-derived active Operator identity for auth.uid(); null means fail closed.';
COMMIT;
