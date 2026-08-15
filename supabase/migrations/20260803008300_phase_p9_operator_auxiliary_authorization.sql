BEGIN;
SET search_path TO erp, auth, pg_catalog;

CREATE FUNCTION erp.current_user_effective_permissions()
RETURNS TABLE(permission_code text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
  SELECT DISTINCT permission.code
  FROM erp.users caller
  JOIN erp.companies company ON company.id=caller.company_id AND company.active
  JOIN erp.user_roles assignment ON assignment.user_id=caller.id
  JOIN erp.app_roles role ON role.id=assignment.role_id AND role.active
  JOIN erp.role_permissions mapping ON mapping.role_id=role.id
  JOIN erp.app_permissions permission ON permission.id=mapping.permission_id AND permission.active
  WHERE caller.id=auth.uid() AND caller.status='active'
  ORDER BY permission.code
$$;

CREATE FUNCTION erp.current_user_roles()
RETURNS TABLE(role_code text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
  SELECT DISTINCT role.code
  FROM erp.users caller
  JOIN erp.companies company ON company.id=caller.company_id AND company.active
  JOIN erp.user_roles assignment ON assignment.user_id=caller.id
  JOIN erp.app_roles role ON role.id=assignment.role_id AND role.active
  WHERE caller.id=auth.uid() AND caller.status='active'
  ORDER BY role.code
$$;

REVOKE ALL ON FUNCTION erp.current_user_effective_permissions(),erp.current_user_roles()
FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.current_user_effective_permissions(),erp.current_user_roles()
TO authenticated;

DROP POLICY IF EXISTS tenant_read ON erp.deur_events;
CREATE POLICY operator_owned_or_deur_evidence_reader
ON erp.deur_events FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND EXISTS (
    SELECT 1 FROM erp.deurs parent
    WHERE parent.id=deur_events.deur_id
      AND parent.company_id=deur_events.company_id
      AND (
        parent.operator_id=erp.current_active_operator_id()
        OR (
          erp.current_linked_operator_id() IS NULL
          AND erp.current_user_has_any_read_permission(
            ARRAY['deur.read','deur.review','deur.acknowledge']
          )
        )
      )
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.deur_meter_checkpoints;
CREATE POLICY operator_owned_or_deur_evidence_reader
ON erp.deur_meter_checkpoints FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND EXISTS (
    SELECT 1 FROM erp.deurs parent
    WHERE parent.id=deur_meter_checkpoints.deur_id
      AND parent.company_id=deur_meter_checkpoints.company_id
      AND parent.rental_equipment_line_id=deur_meter_checkpoints.rental_equipment_line_id
      AND parent.equipment_id=deur_meter_checkpoints.equipment_id
      AND parent.operator_id=deur_meter_checkpoints.operator_id
      AND (
        parent.operator_id=erp.current_active_operator_id()
        OR (
          erp.current_linked_operator_id() IS NULL
          AND erp.current_user_has_any_read_permission(
            ARRAY['deur.read','deur.review','deur.acknowledge']
          )
        )
      )
  )
);

DROP POLICY IF EXISTS users_authenticated_read ON erp.users;
CREATE POLICY self_or_unlinked_user_administrator
ON erp.users FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND (
    id=auth.uid()
    OR (
      erp.current_linked_operator_id() IS NULL
      AND erp.current_user_has_any_read_permission(ARRAY['users.manage'])
    )
  )
);

DROP POLICY IF EXISTS permissions_authenticated_read ON erp.app_permissions;
CREATE POLICY unlinked_authorization_administrator_read
ON erp.app_permissions FOR SELECT TO authenticated
USING (
  erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(ARRAY['users.manage'])
);

DROP POLICY IF EXISTS roles_authenticated_read ON erp.app_roles;
CREATE POLICY unlinked_authorization_administrator_read
ON erp.app_roles FOR SELECT TO authenticated
USING (
  erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(ARRAY['users.manage'])
);

DROP POLICY IF EXISTS role_permissions_authenticated_read ON erp.role_permissions;
CREATE POLICY unlinked_authorization_administrator_read
ON erp.role_permissions FOR SELECT TO authenticated
USING (
  erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(ARRAY['users.manage'])
);

DROP POLICY IF EXISTS tenant_read ON erp.audit_log;
CREATE POLICY unlinked_audit_reader
ON erp.audit_log FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(
    ARRAY['users.manage','users.read','reports.read','reports.view']
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.number_sequences;
CREATE POLICY unlinked_configuration_reader
ON erp.number_sequences FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(
    ARRAY['settings.manage','settings.read','masterData.manage','masterData.read']
  )
);

DROP POLICY IF EXISTS recovery_compensations_tenant_read ON erp.recovery_compensations;
CREATE POLICY unlinked_recovery_reader
ON erp.recovery_compensations FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(
    ARRAY['rental.manage','rental.update','rental.reopen','billing.read','billing.update','billing.reopen']
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.customers;
CREATE POLICY unlinked_customer_reader
ON erp.customers FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(
    ARRAY['customer.read','customer.manage']
  )
);

COMMENT ON FUNCTION erp.current_user_effective_permissions() IS
  'Current-subject-only effective permission projection; accepts no target user identity.';
COMMENT ON FUNCTION erp.current_user_roles() IS
  'Current-subject-only active role-code projection; accepts no target user identity.';
COMMENT ON POLICY operator_owned_or_deur_evidence_reader ON erp.deur_events IS
  'Linked Operators read only events of their server-owned DEURs; authorized unlinked users retain tenant reads.';
COMMENT ON POLICY operator_owned_or_deur_evidence_reader ON erp.deur_meter_checkpoints IS
  'Meter evidence follows the exact parent DEUR, line, equipment and Operator identity chain.';

COMMIT;
