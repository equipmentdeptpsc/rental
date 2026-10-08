BEGIN;
SET LOCAL search_path = erp, auth, extensions, pg_catalog;

-- Rental workspace and its reference codes are read-only projections.
CREATE OR REPLACE FUNCTION erp.can_read_canonical_rental_workspace()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
  SELECT erp.current_company_id() IS NOT NULL AND (
    erp.current_user_has_permission('billing.read') OR
    erp.current_user_has_permission('rental.commercialTerms.read') OR
    erp.current_user_has_permission('rental.manage') OR
    erp.current_user_has_permission('rental.commercialTerms.manage') OR
    erp.current_user_has_permission('rental.approval.submit') OR
    erp.current_user_has_permission('rental.approval.decide') OR
    erp.current_user_has_permission('rental.release'))
$$;

CREATE OR REPLACE FUNCTION erp.read_canonical_rental_reference_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();
BEGIN
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT (erp.current_user_has_permission('rental.read') OR erp.can_read_canonical_rental_workspace()) THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  RETURN jsonb_build_object('success',true,
    'costCodes',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'code',c.code,'name',c.name,'active',c.active,'sortOrder',c.sort_order)
      ORDER BY c.sort_order,c.code,c.id),'[]'::jsonb)
      FROM erp.cost_codes c WHERE c.active AND c.deleted_at IS NULL),
    'activityCodes',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'code',a.code,'name',a.name,'active',a.active,'sortOrder',a.sort_order)
      ORDER BY a.sort_order,a.code,a.id),'[]'::jsonb)
      FROM erp.activity_codes a WHERE a.active AND a.deleted_at IS NULL));
END $$;

-- Catalog permissions are deliberately scoped to existing roles.
INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM erp.app_roles r CROSS JOIN erp.app_permissions p
WHERE r.code='operations-manager' AND p.code IN ('dashboard.financial.read','billing.approve')
ON CONFLICT DO NOTHING;

CREATE FUNCTION erp.current_user_is_management_approver()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM erp.users u JOIN erp.user_roles ur ON ur.user_id=u.id
    JOIN erp.app_roles role ON role.id=ur.role_id
    WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=erp.current_company_id()
      AND role.active AND role.code IN ('operations-manager','system-administrator'))
$$;

-- A table boundary also closes direct-RPC and legacy-payload release bypasses.
CREATE FUNCTION erp.require_management_approval_for_rental_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE approval text;
BEGIN
  IF TG_TABLE_NAME='rentals' THEN
    IF NEW.approval_status IN ('Approved','Rejected') AND OLD.approval_status IS DISTINCT FROM NEW.approval_status
       AND (OLD.approval_status IS DISTINCT FROM 'Pending'
         OR NOT erp.current_user_has_permission('rental.approval.decide')
         OR NOT erp.current_user_is_management_approver()
         OR NEW.approval_decided_by IS DISTINCT FROM auth.uid()
         OR OLD.approval_requested_by=auth.uid()) THEN
      RAISE EXCEPTION 'Rental approval decision is not authorized.' USING ERRCODE='42501';
    END IF;
    IF NEW.status::text='Released' AND OLD.status::text IS DISTINCT FROM 'Released'
       AND OLD.approval_status IS DISTINCT FROM 'Approved' THEN
      RAISE EXCEPTION 'Operations Manager approval is required before this rental can be released.' USING ERRCODE='23514';
    END IF;
  ELSE
    IF (NEW.status::text='Released' AND OLD.status::text IS DISTINCT FROM 'Released')
       OR (NEW.canonical_line_status::text='Released' AND OLD.canonical_line_status::text IS DISTINCT FROM 'Released') THEN
      SELECT r.approval_status INTO approval FROM erp.rentals r WHERE r.id=NEW.rental_id AND r.company_id=NEW.company_id;
      IF approval IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'Operations Manager approval is required before this rental can be released.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER require_parent_rental_release_approval BEFORE UPDATE ON erp.rentals
FOR EACH ROW EXECUTE FUNCTION erp.require_management_approval_for_rental_release();
CREATE TRIGGER require_line_rental_release_approval BEFORE UPDATE ON erp.rental_equipment_lines
FOR EACH ROW EXECUTE FUNCTION erp.require_management_approval_for_rental_release();

CREATE FUNCTION erp.enrich_rental_approval_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE actor_roles text[];
BEGIN
  IF NEW.aggregate_type='Rental' AND NEW.action IN ('RENTAL_APPROVED','RENTAL_REJECTED') THEN
    SELECT u.display_name INTO NEW.actor_name FROM erp.users u
    WHERE u.id::text=NEW.actor_id AND u.company_id=NEW.company_id;
    SELECT array_agg(DISTINCT role.code ORDER BY role.code) INTO actor_roles
    FROM erp.user_roles ur JOIN erp.app_roles role ON role.id=ur.role_id AND role.active
    WHERE ur.user_id=NEW.actor_id::uuid AND role.code IN ('operations-manager','system-administrator');
    NEW.metadata=coalesce(NEW.metadata,'{}'::jsonb)||jsonb_build_object('approverRoles',coalesce(to_jsonb(actor_roles),'[]'::jsonb));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enrich_rental_approval_audit BEFORE INSERT ON erp.audit_log
FOR EACH ROW EXECUTE FUNCTION erp.enrich_rental_approval_audit();

CREATE FUNCTION erp.require_scoped_billing_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
BEGIN
  IF NEW.approval_status='Approved' AND OLD.approval_status IS DISTINCT FROM 'Approved'
     AND (OLD.approval_status IS DISTINCT FROM 'Draft'
       OR NOT erp.current_user_has_permission('billing.approve')
       OR NOT erp.current_user_is_management_approver()
       OR NEW.approved_by IS DISTINCT FROM auth.uid()::text) THEN
    RAISE EXCEPTION 'Operations Manager approval is required before this billing statement can be approved.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER require_scoped_billing_approval BEFORE UPDATE OF approval_status ON erp.billing_statements
FOR EACH ROW EXECUTE FUNCTION erp.require_scoped_billing_approval();

-- Billing email is the only billing-statement customer-send path. DEUR customer
-- review requests precede statement creation and are a separate workflow.
CREATE FUNCTION erp.require_management_approval_for_billing_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
BEGIN
  IF NEW.notification_type='BILLING_STATEMENT_EMAIL' AND NOT EXISTS (
    SELECT 1 FROM erp.billing_statements s
    JOIN erp.users u ON u.id::text=s.approved_by AND u.company_id=s.company_id
    JOIN erp.user_roles ur ON ur.user_id=u.id
    JOIN erp.app_roles role ON role.id=ur.role_id
    WHERE s.id=NEW.source_aggregate_id AND s.company_id=NEW.company_id
      AND s.approval_status='Approved' AND s.approved_at IS NOT NULL
      AND role.code IN ('operations-manager','system-administrator')
  ) THEN
    RAISE EXCEPTION 'Operations Manager approval is required before this billing statement can be sent to the customer.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER require_billing_email_approval BEFORE INSERT ON erp.notification_outbox
FOR EACH ROW EXECUTE FUNCTION erp.require_management_approval_for_billing_email();

-- Billing Officer may prepare statements, but only this approval capability finalizes one.
CREATE OR REPLACE FUNCTION erp.execute_billing_statement_transition(command jsonb,command_type text,required_approval erp.billing_approval_status,next_approval erp.billing_approval_status)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); actor text=auth.uid()::text; statement erp.billing_statements;
 idem jsonb; payload_hash text; response jsonb; now_at timestamptz=clock_timestamp(); actor_name text; actor_roles text[];
BEGIN
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.'); END IF;
  IF command_type<>'FINALIZE_BILLING_STATEMENT' OR required_approval<>'Draft' OR next_approval<>'Approved'
     OR NOT erp.current_user_has_permission('billing.approve') OR NOT erp.current_user_is_management_approver() THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Operations Manager approval is required.');
  END IF;
  SELECT * INTO statement FROM erp.billing_statements WHERE id=command->>'statementId' AND company_id=tenant FOR UPDATE;
  IF statement.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Billing statement is unavailable.'); END IF;
  idem=erp.begin_operational_command(command,command_type,'BILLING_STATEMENT',statement.id,tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.'); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  IF statement.row_version<>coalesce((command->>'expectedVersion')::bigint,statement.row_version) THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Billing statement version is stale.','currentVersion',statement.row_version); END IF;
  IF statement.approval_status<>required_approval OR statement.invoice_status<>'Not Invoiced'
     OR NOT EXISTS(SELECT 1 FROM erp.billing_statement_lines l WHERE l.billing_statement_id=statement.id) THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Billing statement cannot be finalized.'); END IF;
  SELECT display_name INTO actor_name FROM erp.users WHERE id=auth.uid();
  SELECT array_agg(DISTINCT role.code ORDER BY role.code) INTO actor_roles
  FROM erp.user_roles ur JOIN erp.app_roles role ON role.id=ur.role_id AND role.active
  JOIN erp.role_permissions rp ON rp.role_id=role.id
  JOIN erp.app_permissions p ON p.id=rp.permission_id AND p.code='billing.approve'
    WHERE ur.user_id=actor::uuid;
  UPDATE erp.billing_statements SET approval_status=next_approval,submitted_by=actor,submitted_at=now_at,
    approved_by=actor,approved_at=now_at,updated_by=actor WHERE id=statement.id RETURNING * INTO statement;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,actor_name,occurred_at,correlation_id,previous_values,new_values,metadata,company_id)
  VALUES(extensions.gen_random_uuid()::text,'BillingStatement',statement.id,command_type,actor,actor_name,now_at,command->>'commandId',
    jsonb_build_object('approvalStatus',required_approval),jsonb_build_object('approvalStatus',next_approval,'version',statement.row_version),
    jsonb_build_object('source','billing_statement_transition','approverRoles',coalesce(to_jsonb(actor_roles),'[]'::jsonb)),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(statement.id,statement.rental_id),
    'value',jsonb_build_object('statementId',statement.id,'approvalStatus',statement.approval_status,'invoiceStatus',statement.invoice_status,'version',statement.row_version));
  RETURN erp.finish_operational_command(command,command_type,'BILLING_STATEMENT',statement.id,tenant,actor,payload_hash,response,statement.row_version);
END $$;

CREATE FUNCTION erp.read_pending_management_approvals()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.approval.decide')
     OR NOT erp.current_user_has_permission('billing.approve') OR NOT erp.current_user_is_management_approver() THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  RETURN jsonb_build_object('success',true,
    'rentalCount',(SELECT count(*) FROM erp.rentals r WHERE r.company_id=tenant AND r.status='Draft' AND r.approval_status='Pending' AND r.approval_requested_by IS DISTINCT FROM auth.uid()),
    'billingCount',(SELECT count(*) FROM erp.billing_statements s WHERE s.company_id=tenant AND s.deleted_at IS NULL AND s.approval_status='Draft' AND s.invoice_status='Not Invoiced' AND EXISTS(SELECT 1 FROM erp.billing_statement_lines l WHERE l.billing_statement_id=s.id)),
    'billingItems',(WITH pending AS (
      SELECT s.id,s.statement_no,s.rental_id,s.customer_snapshot,s.project_snapshot,s.grand_total,s.row_version,s.created_at,s.billing_from,s.billing_to
      FROM erp.billing_statements s WHERE s.company_id=tenant AND s.deleted_at IS NULL
        AND s.approval_status='Draft' AND s.invoice_status='Not Invoiced'
        AND EXISTS(SELECT 1 FROM erp.billing_statement_lines l WHERE l.billing_statement_id=s.id)
      ORDER BY s.created_at DESC LIMIT 20
    ), ranked_lines AS (
      SELECT l.billing_statement_id,l.description,l.work_date,l.grand_total,
        row_number() OVER (PARTITION BY l.billing_statement_id ORDER BY l.work_date,l.id) rn,
        count(*) OVER (PARTITION BY l.billing_statement_id) line_count
      FROM erp.billing_statement_lines l JOIN pending p ON p.id=l.billing_statement_id
    ), details AS (
      SELECT billing_statement_id,max(line_count) AS line_count,
        jsonb_agg(jsonb_build_object('description',description,'workDate',work_date,'amount',grand_total)
          ORDER BY work_date,description) FILTER (WHERE rn<=100) AS lines
      FROM ranked_lines GROUP BY billing_statement_id
    ) SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('line_count',d.line_count,'lines',coalesce(d.lines,'[]'::jsonb))
      ORDER BY p.created_at DESC),'[]'::jsonb)
      FROM pending p JOIN details d ON d.billing_statement_id=p.id));
END $$;

CREATE FUNCTION erp.read_dashboard_management_financial_summary(period_from date,period_to date,compare_from date,compare_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); output jsonb;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('dashboard.financial.read') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF period_from IS NULL OR period_to IS NULL OR compare_from IS NULL OR compare_to IS NULL
     OR period_to<period_from OR compare_to<compare_from OR period_to-period_from>366 OR compare_to-compare_from>366 THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  WITH invoice AS (
    SELECT s.id,s.billing_to,s.grand_total,s.customer_snapshot,s.project_snapshot,s.rental_id
    FROM erp.billing_statements s WHERE s.company_id=tenant AND s.deleted_at IS NULL AND s.invoice_status NOT IN ('Cancelled','Not Invoiced')
  ), payments AS (
    SELECT c.amount,c.collected_at::date AS paid_on,c.billing_statement_id
    FROM erp.collections c JOIN invoice i ON i.id=c.billing_statement_id
  )
  SELECT jsonb_build_object(
    'success',true,
    'revenue',coalesce((SELECT sum(grand_total) FROM invoice WHERE billing_to BETWEEN period_from AND period_to),0),
    'priorRevenue',coalesce((SELECT sum(grand_total) FROM invoice WHERE billing_to BETWEEN compare_from AND compare_to),0),
    'collections',coalesce((SELECT sum(amount) FROM payments WHERE paid_on BETWEEN period_from AND period_to),0),
    'priorCollections',coalesce((SELECT sum(amount) FROM payments WHERE paid_on BETWEEN compare_from AND compare_to),0),
    'outstanding',greatest(0,coalesce((SELECT sum(grand_total) FROM invoice),0)-coalesce((SELECT sum(amount) FROM payments),0)),
    'trend',(SELECT coalesce(jsonb_agg(jsonb_build_object('label',d.label,'revenue',d.revenue,'collections',d.collections) ORDER BY d.label),'[]'::jsonb) FROM (
      SELECT label,sum(revenue) revenue,sum(collections) collections FROM (
        SELECT to_char(billing_to,'YYYY-MM') label,grand_total revenue,0::numeric collections FROM invoice WHERE billing_to BETWEEN period_from AND period_to
        UNION ALL SELECT to_char(paid_on,'YYYY-MM'),0,amount FROM payments WHERE paid_on BETWEEN period_from AND period_to
      ) t GROUP BY label) d),
    'topCustomers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) FROM (
      SELECT customer_snapshot AS label,sum(grand_total) amount FROM invoice WHERE billing_to BETWEEN period_from AND period_to GROUP BY customer_snapshot ORDER BY amount DESC LIMIT 5) x),
    'topProjects',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) FROM (
      SELECT project_snapshot AS label,sum(grand_total) amount FROM invoice WHERE billing_to BETWEEN period_from AND period_to GROUP BY project_snapshot ORDER BY amount DESC LIMIT 5) x),
    'topEquipment',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) FROM (
      SELECT coalesce(e.asset_no||' - '||e.equipment_name,'Equipment unavailable') AS label,sum(l.grand_total) amount
      FROM erp.billing_statement_lines l JOIN invoice i ON i.id=l.billing_statement_id
      LEFT JOIN erp.equipment e ON e.id=l.equipment_id AND e.company_id=tenant
      WHERE i.billing_to BETWEEN period_from AND period_to GROUP BY e.id,e.asset_no,e.equipment_name ORDER BY amount DESC LIMIT 5) x)
  ) INTO output;
  RETURN output;
END $$;

ALTER FUNCTION erp.can_read_canonical_rental_workspace() OWNER TO postgres;
ALTER FUNCTION erp.read_canonical_rental_reference_data() OWNER TO postgres;
ALTER FUNCTION erp.current_user_is_management_approver() OWNER TO postgres;
ALTER FUNCTION erp.require_management_approval_for_rental_release() OWNER TO postgres;
ALTER FUNCTION erp.enrich_rental_approval_audit() OWNER TO postgres;
ALTER FUNCTION erp.require_scoped_billing_approval() OWNER TO postgres;
ALTER FUNCTION erp.require_management_approval_for_billing_email() OWNER TO postgres;
ALTER FUNCTION erp.execute_billing_statement_transition(jsonb,text,erp.billing_approval_status,erp.billing_approval_status) OWNER TO postgres;
ALTER FUNCTION erp.read_pending_management_approvals() OWNER TO postgres;
ALTER FUNCTION erp.read_dashboard_management_financial_summary(date,date,date,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.current_user_is_management_approver(),erp.require_management_approval_for_rental_release(),erp.enrich_rental_approval_audit(),erp.require_scoped_billing_approval(),erp.require_management_approval_for_billing_email(),erp.read_pending_management_approvals(),erp.read_dashboard_management_financial_summary(date,date,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_pending_management_approvals(),erp.read_dashboard_management_financial_summary(date,date,date,date) TO authenticated;
COMMIT;
