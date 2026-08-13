import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertSafeSupabaseTestConfiguration, assertSupabaseFixtureMutationAllowed, createSupabasePhaseC2Harness, readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";
import { SupabaseTrustedNotificationRepository } from "../server/notifications/SupabaseTrustedNotificationRepository";
import { ResendEmailDeliveryProvider } from "../server/notifications/ResendEmailDeliveryProvider";
import { parseNotificationServerConfiguration } from "../server/notifications/config";
import { renderNotificationTemplate } from "../src/features/notifications/templates";
import { loadIgnoredLocalTestEnvironment } from "./support/loadLiveTestEnvironment";

loadIgnoredLocalTestEnvironment();
const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = process.env.RUN_PHASE_C12_MANAGER_EMAIL_PREFLIGHT === "true";
const runPreSend = process.env.RUN_PHASE_C12_MANAGER_EMAIL_PRE_SEND === "true";
const runCertification = process.env.RUN_PHASE_C12_MANAGER_EMAIL_CERTIFICATION === "true";
const tenant = "TENANT-UAT-C12-MANAGER-EMAIL-001";
const id = {
  operator: "OPR-UAT-C12-MANAGER-EMAIL-001", customer: "CUST-UAT-C12-MANAGER-EMAIL-001",
  project: "PRJ-UAT-C12-MANAGER-EMAIL-001", equipment: "EQP-UAT-C12-MANAGER-EMAIL-001",
  assignment: "ASN-UAT-C12-MANAGER-EMAIL-001", rental: "RENT-UAT-C12-MANAGER-EMAIL-001",
  line: "LINE-UAT-C12-MANAGER-EMAIL-001", contract: "CONTRACT-UAT-C12-MANAGER-EMAIL-001",
  snapshot: "SNAP-UAT-C12-MANAGER-EMAIL-001", deur: "DEUR-UAT-C12-MANAGER-EMAIL-001",
};
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const checkpoint = (value: string) => console.info(value);

function readMigrationAlignment(): { latest: string; pending: number } {
  const executable = process.env.SUPABASE_CLI_PATH ?? "C:\\Users\\JUANCHO\\scoop\\shims\\supabase.exe";
  const result = spawnSync(executable, ["migration", "list", "--linked"], { cwd: process.cwd(), encoding: "utf8", windowsHide: true, env: process.env });
  if (result.status !== 0) throw new Error(`Linked migration preflight failed (${result.status ?? "unknown"}).`);
  const parsed = JSON.parse(result.stdout) as { migrations?: Array<{ local?: string; remote?: string }> };
  const rows = parsed.migrations ?? [];
  if (!rows.length) throw new Error("Linked migration preflight returned no aligned migrations.");
  return { latest: rows.at(-1)!.local ?? "", pending: rows.filter((row) => row.local !== row.remote).length };
}

async function verifyRenderedManagerReviewReadOnly(reviewUrl: string): Promise<void> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const response = await page.goto(reviewUrl, { waitUntil: "networkidle" });
    expect(response?.ok()).toBe(true);
    const body = await page.locator("body").innerText();
    for (const evidence of ["C12 Manager Email UAT", "C12 Manager Customer", "C12-MANAGER-EMAIL-001", "C12 Manager Project", "R1", "C12 Manager Excavator", "C12-MGR-001", "C12 Controlled Operator", "Work Date", "Shift Start", "Shift End", "ACKNOWLEDGE", "Operation", "Idle", "Standby", "Activity Timeline", "Approve", "Reject", "Request Correction"])
      expect(body, evidence).toContain(evidence);
  } finally {
    await browser.close();
  }
}

describe.skipIf(!enabled)("C12 controlled Manager real-email preflight", () => {
  it("proves the isolated target, zero residue, and certified live contracts", async () => {
    assertSafeSupabaseTestConfiguration(configuration);
    expect(spawnSync("git", ["branch", "--show-current"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim()).toBe("feature/multi-equipment-realtime");
    const linked = JSON.parse(readFileSync("supabase/.temp/linked-project.json", "utf8")) as { ref?: string; name?: string };
    expect(linked).toEqual(expect.objectContaining({ ref: "jtkctarqbwmqdcewthkn", name: "equipment-rental-isolated-uat" }));
    expect(readFileSync("supabase/.temp/project-ref", "utf8").trim()).toBe("jtkctarqbwmqdcewthkn");
    expect(configuration.projectRef).toBe("jtkctarqbwmqdcewthkn");
    expect(configuration.allowMutation).toBe(true);
    expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
    const forbiddenViteSecrets = Object.keys(process.env).filter((name) => name.startsWith("VITE_") && /(SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|RESEND|READBACK|TOKEN)/i.test(name));
    expect(forbiddenViteSecrets).toEqual([]);
    for (const name of ["RESEND_API_KEY", "RESEND_READBACK_API_KEY", "RESEND_FROM_ADDRESS", "EMAIL_UAT_RECIPIENT_OVERRIDE", "REVIEW_PUBLIC_BASE_URL"])
      expect(process.env[name]?.trim(), `${name} must be configured`).toBeTruthy();

    const harness = createSupabasePhaseC2Harness(configuration);
    const sql = `SELECT jsonb_build_object(
      'localTenant',(SELECT count(*) FROM erp.companies WHERE id=('TENANT-'||'LOCAL-001') AND code='LOCAL' AND environment_class='compatibility'),
      'uatCompanies',(SELECT count(*) FROM erp.companies WHERE id LIKE ('TENANT-'||'UAT-%')),
      'uatUsers',(SELECT count(*) FROM erp.users WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatRoles',(SELECT count(*) FROM erp.user_roles ur JOIN erp.users u ON u.id=ur.user_id WHERE u.company_id LIKE ('TENANT-'||'UAT-%')),
      'uatOperators',(SELECT count(*) FROM erp.operators WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatCustomers',(SELECT count(*) FROM erp.customers WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatProjects',(SELECT count(*) FROM erp.projects WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatEquipment',(SELECT count(*) FROM erp.equipment WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatAssignments',(SELECT count(*) FROM erp.assignments WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatRentals',(SELECT count(*) FROM erp.rentals WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatLines',(SELECT count(*) FROM erp.rental_equipment_lines WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatContracts',(SELECT count(*) FROM erp.rental_contracts c JOIN erp.rentals r ON r.id=c.rental_id WHERE r.company_id LIKE ('TENANT-'||'UAT-%')),
      'uatSnapshots',(SELECT count(*) FROM erp.commercial_snapshots s JOIN erp.rentals r ON r.id=s.rental_id WHERE r.company_id LIKE ('TENANT-'||'UAT-%')),
      'uatDeurs',(SELECT count(*) FROM erp.deurs WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatDeurEvents',(SELECT count(*) FROM erp.deur_events WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatCustomerReviews',(SELECT count(*) FROM erp.customer_review_requests WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatCustomerOutcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatManagerReviews',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatManagerOutcomes',(SELECT count(*) FROM erp.manager_review_outcomes WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatNotifications',(SELECT count(*) FROM erp.notification_outbox WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatAttempts',(SELECT count(*) FROM erp.notification_delivery_attempts WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatOperationalCommands',(SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatDeurCommands',(SELECT count(*) FROM erp.deur_command_idempotency WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatAudit',(SELECT count(*) FROM erp.audit_log WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatSequences',(SELECT count(*) FROM erp.number_sequences WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'uatDesignations',(SELECT count(*) FROM erp.manager_review_recipient_configurations WHERE company_id LIKE ('TENANT-'||'UAT-%')),
      'cleanupSecurity',(SELECT prosecdef AND proconfig @> ARRAY['search_path=erp, pg_catalog'] FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='cleanup_c12_manager_real_email_fixture'),
      'designationTable',to_regclass('erp.manager_review_recipient_configurations') IS NOT NULL,
      'timelineBuilder',(SELECT pg_get_functiondef(p.oid) LIKE '%timeline%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='build_manager_review_evidence'),
      'cleanupInstalled',(SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='cleanup_c12_manager_real_email_fixture'),
      'resolverInstalled',(SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='resolve_manager_review_recipient'),
      'configureInstalled',(SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='configure_manager_review_recipient')
      ,'usersManageRoles',(SELECT jsonb_agg(DISTINCT role.code ORDER BY role.code) FROM erp.app_roles role JOIN erp.role_permissions rp ON rp.role_id=role.id JOIN erp.app_permissions permission ON permission.id=rp.permission_id WHERE permission.code='users.manage')
      ,'usersManagePermissionCount',(SELECT count(*) FROM erp.app_permissions WHERE code='users.manage')
      ,'rentalApproveRoles',(SELECT jsonb_agg(DISTINCT role.code ORDER BY role.code) FROM erp.app_roles role JOIN erp.role_permissions rp ON rp.role_id=role.id JOIN erp.app_permissions permission ON permission.id=rp.permission_id WHERE permission.code='rental.approve')
      ,'canonicalRoles',(SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name) ORDER BY code) FROM erp.app_roles WHERE code IN('system-administrator','rental-operations','finance','management'))
      ,'adminPermissionIds',(SELECT jsonb_agg(jsonb_build_object('id',permission.id,'code',permission.code) ORDER BY permission.code) FROM erp.app_roles role JOIN erp.role_permissions rp ON rp.role_id=role.id JOIN erp.app_permissions permission ON permission.id=rp.permission_id WHERE role.code='system-administrator')
      ,'operationsPermissionIds',(SELECT jsonb_agg(jsonb_build_object('id',permission.id,'code',permission.code) ORDER BY permission.code) FROM erp.app_roles role JOIN erp.role_permissions rp ON rp.role_id=role.id JOIN erp.app_permissions permission ON permission.id=rp.permission_id WHERE role.code='rental-operations')
    );`;
    const raw = executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
    const evidence = JSON.parse(raw).rows[0].jsonb_build_object as Record<string, unknown>;
    expect(evidence.localTenant).toBe(1);
    for (const [key, value] of Object.entries(evidence).filter(([key]) => key.startsWith("uat"))) expect(value, key).toBe(0);
    expect(evidence).toMatchObject({ cleanupSecurity: true, cleanupInstalled: true, designationTable: true, resolverInstalled: true, configureInstalled: true, timelineBuilder: true, usersManagePermissionCount: 1, usersManageRoles: ["system-administrator"] });
    console.info(JSON.stringify({ usersManagePermissionCount: evidence.usersManagePermissionCount, usersManageRoles: evidence.usersManageRoles, rentalApproveRoles: evidence.rentalApproveRoles, canonicalRoles: evidence.canonicalRoles, adminPermissionIds: evidence.adminPermissionIds, operationsPermissionIds: evidence.operationsPermissionIds }));

    let authResidue = 0;
    for (let page = 1; ; page++) {
      const listed = await harness.admin.auth.admin.listUsers({ page, perPage: 100 });
      if (listed.error) throw listed.error;
      authResidue += listed.data.users.filter((user) => String(user.user_metadata?.fixtureTenant ?? "").startsWith("TENANT-UAT-")).length;
      if (listed.data.users.length < 100) break;
    }
    expect(authResidue).toBe(0);

    const migrations = readMigrationAlignment();
    expect(migrations).toEqual({ latest: "20260803005600", pending: 0 });

    const html = await (await fetch("https://psc-ed.equipmentdept-psc.workers.dev/review/manager/invalid-test-credential")).text();
    const assets = [...html.matchAll(/src="([^"]+\.js)"/g)].map((match) => new URL(match[1], "https://psc-ed.equipmentdept-psc.workers.dev").toString());
    expect(assets.length).toBeGreaterThan(0);
    const bundle = (await Promise.all(assets.map(async (url) => (await fetch(url)).text()))).join("\n");
    expect(bundle).toContain(configuration.projectRef);
    expect(bundle).not.toContain("zptikhooyvtxqothcrjt");
    for (const marker of ["get_manager_review", "approve_manager_review", "reject_manager_review", "request_manager_correction", "Activity Timeline", "Company", "Customer", "Rental", "Project", "Asset Number", "Operator", "Work Date", "Shift Start", "Shift End", "Approve", "Reject", "Request Correction"])
      expect(bundle, marker).toContain(marker);
    expect(createClient).toBeTypeOf("function");
    checkpoint("PRECHECK_OK");
  }, 120_000);
});

describe.skipIf(!runPreSend && !runCertification)("C12 controlled Manager real-email positive fixture", () => {
  it("certifies the pre-send boundary or retains one delivered review only in explicit real-email mode", async () => {
    expect(runPreSend && runCertification, "Pre-send and real-email modes are mutually exclusive.").toBe(false);
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
    const notification = parseNotificationServerConfiguration(process.env);
    const recipient = notification.uatRecipientOverride?.trim().toLowerCase();
    const readbackKey = process.env.RESEND_READBACK_API_KEY?.trim();
    if (!recipient || !readbackKey) throw new Error("Controlled recipient/readback configuration is missing.");
    const harness = createSupabasePhaseC2Harness(configuration);
    const owner = (sql: string) => executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
    const ownerValue = (sql: string) => JSON.parse(owner(sql)).rows[0].jsonb_build_object as Record<string, any>;
    const cleanup = () => owner(`SELECT erp.cleanup_c12_manager_real_email_fixture('${tenant}','${tenant}','CONFIRM-C12-MANAGER-EMAIL-CLEANUP');`);
    const password = `C12-${randomBytes(24).toString("base64url")}`;
    const administratorEmail = `c12-manager-administrator-${randomUUID()}@example.invalid`;
    const operatorEmail = `c12-manager-operator-${randomUUID()}@example.invalid`;
    const managerLoginEmail = `c12-manager-reviewer-${randomUUID()}@example.invalid`;
    let administratorUserId = "", operatorUserId = "", managerUserId = "", providerAccepted = false;
    try {
      for (const identity of [{ email: administratorEmail, kind: "administrator" }, { email: managerLoginEmail, kind: "manager" }, { email: operatorEmail, kind: "operator" }] as const) {
        const created = await harness.admin.auth.admin.createUser({ email: identity.email, password, email_confirm: true, user_metadata: { fixtureTenant: tenant, fixtureKind: identity.kind } });
        if (created.error || !created.data.user) throw created.error ?? new Error("Temporary Auth creation failed.");
        if (identity.kind === "administrator") administratorUserId = created.data.user.id;
        else if (identity.kind === "operator") operatorUserId = created.data.user.id;
        else managerUserId = created.data.user.id;
      }
      checkpoint("AUTH_CREATED");
      owner(`BEGIN;
        INSERT INTO erp.companies(id,code,name,environment_class) VALUES('${tenant}','${tenant}','C12 Manager Email UAT','test');
        INSERT INTO erp.operators(id,name,status,company_id) VALUES('${id.operator}','C12 Controlled Operator','Active','${tenant}');
        INSERT INTO erp.users(id,username,email,display_name,status,operator_id,company_id) VALUES
          ('${administratorUserId}'::uuid,${quote(administratorEmail)},${quote(administratorEmail)},'C12 Controlled Administrator','active',NULL,'${tenant}'),
          ('${operatorUserId}'::uuid,${quote(operatorEmail)},${quote(operatorEmail)},'C12 Controlled Operator','active','${id.operator}','${tenant}'),
          ('${managerUserId}'::uuid,${quote(managerLoginEmail)},${quote(recipient)},'C12 Controlled Manager','active',NULL,'${tenant}');
        INSERT INTO erp.user_roles(user_id,role_id) VALUES ('${administratorUserId}'::uuid,'ROLE-CANON-SYSTEM-ADMINISTRATOR');
        INSERT INTO erp.user_roles(user_id,role_id) SELECT '${operatorUserId}'::uuid,id FROM erp.app_roles WHERE code='rental-operations';
        INSERT INTO erp.user_roles(user_id,role_id) SELECT '${managerUserId}'::uuid,id FROM erp.app_roles WHERE code='rental-operations';
        INSERT INTO erp.customers(id,customer_code,name,email,company_id) VALUES('${id.customer}','C12-MANAGER','C12 Manager Customer','customer-master@example.invalid','${tenant}');
        INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES('${id.project}','C12-MANAGER','C12 Manager Project','${id.customer}','${tenant}');
        INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
          SELECT '${id.equipment}','C12-MGR-001','C12 Manager Excavator','None',s.id,'${id.project}','${id.operator}','${tenant}' FROM erp.equipment_statuses s WHERE lower(s.code)='assigned' ORDER BY s.id LIMIT 1;
        INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
          VALUES('${id.assignment}','${id.equipment}','${id.operator}','${id.project}',current_date,current_date+7,'Active','${tenant}');
        INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,rented_by,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
          VALUES('${id.rental}','C12-MANAGER-EMAIL-001','${id.customer}','${id.project}','C12 Manager Customer','C12 Manager Project','C12 UAT',current_date,current_date+7,'Operated Rental','Reserved','PER_WORKDAY',current_date,'{"approvalStatus":"Approved"}','Controlled Customer Representative',${quote(recipient)},clock_timestamp(),'${tenant}');
        INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,commercial_snapshot_required,company_id)
          VALUES('${id.line}','${id.rental}','${id.equipment}','${id.assignment}','${id.operator}','Reserved',jsonb_build_object('costCode',jsonb_build_object('code','C12-COST'),'activityCode',jsonb_build_object('code','C12-ACT'),'deurExpectationSnapshot',jsonb_build_object('rentalEquipmentLineId','${id.line}','rentalId','${id.rental}','equipmentId','${id.equipment}','assignmentId','${id.assignment}','operatorId','${id.operator}','projectId','${id.project}','customerId','${id.customer}','policy',jsonb_build_object('frequency','PER_WORKDAY'),'shiftWindows','[]'::jsonb,'workDescription',jsonb_build_object('id','WORK-C12-MANAGER','code','C12-WORK','name','Controlled manager certification work','requiresRemarks',false),'workDateRule','RENTAL_DATE_OUT','workDate',current_date::text,'meterRequirement','none','fuelEvidenceRequired',false,'billingMethod','Per Hour','operationalMetadata',jsonb_build_object('costCode',jsonb_build_object('code','C12-COST'),'activityCode',jsonb_build_object('code','C12-ACT')),'sourceFingerprint','PENDING')),true,'${tenant}');
        INSERT INTO erp.rental_contracts(id,rental_id,rental_equipment_line_id,contract_no,customer_id,equipment_id,project_id,rental_type,billing_method,currency,unit_rate,operator_included,start_date,expected_end_date,status)
          VALUES('${id.contract}','${id.rental}','${id.line}','C12-MGR-CONTRACT-001','${id.customer}','${id.equipment}','${id.project}','Operated Rental','Per Hour','PHP',100,true,current_date,current_date+7,'Active');
        INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,source_contract_id,billing_method,unit_rate,operator_included,currency,captured_at)
          VALUES('${id.snapshot}','${id.rental}','${id.line}','${id.contract}','Per Hour',100,true,'PHP',clock_timestamp());
        UPDATE erp.rental_equipment_lines SET operational_metadata=jsonb_set(operational_metadata,'{deurExpectationSnapshot,sourceFingerprint}',to_jsonb(erp.current_deur_expectation_fingerprint(id)),true) WHERE id='${id.line}';
        COMMIT;`);
      checkpoint("BUSINESS_FIXTURE_CREATED");
      checkpoint("USERS_CREATED");
      const options = (storageKey: string) => ({ auth: { persistSession: false, autoRefreshToken: false, storageKey } });
      const administrator = createClient(configuration.url!, configuration.publishableKey!, options(`c12-manager-administrator-${randomUUID()}`));
      const operator = createClient(configuration.url!, configuration.publishableKey!, options(`c12-manager-operator-${randomUUID()}`));
      const manager = createClient(configuration.url!, configuration.publishableKey!, options(`c12-manager-reviewer-${randomUUID()}`));
      expect((await administrator.auth.signInWithPassword({ email: administratorEmail, password })).error).toBeNull();
      expect((await operator.auth.signInWithPassword({ email: operatorEmail, password })).error).toBeNull();
      expect((await manager.auth.signInWithPassword({ email: managerLoginEmail, password })).error).toBeNull();
      const configure = await administrator.schema("erp").rpc("configure_manager_review_recipient", { target_user_id: managerUserId });
      expect(configure.error).toBeNull(); expect(configure.data).toMatchObject({ success: true, code: "CONFIGURED" });
      checkpoint("ADMIN_CONFIGURED_MANAGER");
      const managerDenied = await manager.schema("erp").rpc("configure_manager_review_recipient", { target_user_id: managerUserId });
      expect(managerDenied.error).toBeNull(); expect(managerDenied.data).toEqual({ success: false, code: "FORBIDDEN" }); checkpoint("MANAGER_CONFIG_FORBIDDEN");
      const operatorDenied = await operator.schema("erp").rpc("configure_manager_review_recipient", { target_user_id: operatorUserId });
      expect(operatorDenied.error).toBeNull(); expect(operatorDenied.data).toEqual({ success: false, code: "FORBIDDEN" }); checkpoint("OPERATOR_CONFIG_FORBIDDEN");
      const designation = ownerValue(`WITH claim AS (SELECT set_config('request.jwt.claim.sub','${administratorUserId}',true)), resolved AS (SELECT * FROM erp.resolve_manager_review_recipient('${tenant}')) SELECT jsonb_build_object('count',(SELECT count(*) FROM erp.manager_review_recipient_configurations WHERE company_id='${tenant}' AND active),'manager',(SELECT user_id='${managerUserId}'::uuid FROM erp.manager_review_recipient_configurations WHERE company_id='${tenant}'),'operatorDesignated',(SELECT user_id='${operatorUserId}'::uuid FROM erp.manager_review_recipient_configurations WHERE company_id='${tenant}'),'resolver',(SELECT resolution_code FROM resolved),'resolverUser',(SELECT user_id='${managerUserId}'::uuid FROM resolved),'resolverDestination',(SELECT lower(destination)=lower(${quote(recipient)}) FROM resolved),'approvers',(SELECT count(DISTINCT ur.user_id) FROM erp.user_roles ur JOIN erp.role_permissions rp ON rp.role_id=ur.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE ur.user_id IN('${managerUserId}'::uuid,'${operatorUserId}'::uuid) AND p.code='rental.approve')) FROM claim;`);
      expect(designation).toEqual({ count: 1, manager: true, operatorDesignated: false, resolver: "OK", resolverUser: true, resolverDestination: true, approvers: 2 }); checkpoint("MANAGER_RESOLVER_OK");
      const release = await operator.schema("erp").rpc("command_release_rental", { command: { commandId: randomUUID(), idempotencyKey: randomUUID(), rentalId: id.rental, expectedVersion: 1 } });
      expect(release.error).toBeNull(); expect(release.data).toMatchObject({ success: true, disposition: "ACCEPTED", value: { status: "Released" } });
      checkpoint("RENTAL_RELEASED");
      const started = ownerValue(`BEGIN; SELECT set_config('request.jwt.claim.sub','${operatorUserId}',true); SELECT set_config('erp.c4c_test_clock','2026-08-11T08:00:00Z',true); SELECT jsonb_build_object('result',erp.command_start_deur_shift(jsonb_build_object('commandId','C12-MGR-START','idempotencyKey','C12-MGR-START','rentalId','${id.rental}','rentalLineId','${id.line}','equipmentId','${id.equipment}','assignmentId','${id.assignment}','operatorId','${id.operator}','deviceId','C12-MANAGER','draft',jsonb_build_object('id','${id.deur}','workDate','2026-08-11','shift','Day','evidenceMode','TIME_TIMELINE','operationalRemarks','Controlled Manager review certification.')))); COMMIT;`);
      expect(started.result).toMatchObject({ success: true, disposition: "ACCEPTED" }); checkpoint("DEUR_STARTED");
      const completed = ownerValue(`BEGIN; SELECT set_config('request.jwt.claim.sub','${operatorUserId}',true); SELECT set_config('erp.c4c_test_clock','2026-08-11T10:00:00Z',true); SELECT jsonb_build_object('result',erp.command_complete_deur_shift(jsonb_build_object('commandId','C12-MGR-COMPLETE','idempotencyKey','C12-MGR-COMPLETE','rentalId','${id.rental}','rentalLineId','${id.line}','equipmentId','${id.equipment}','assignmentId','${id.assignment}','operatorId','${id.operator}','deurId','${id.deur}','expectedVersion',1,'meterRequirement','none','deviceId','C12-MANAGER'))); COMMIT;`);
      expect(completed.result).toMatchObject({ success: true, disposition: "ACCEPTED" }); checkpoint("DEUR_COMPLETED");
      const completedVersion = Number(completed.result.version);
      expect(Number.isSafeInteger(completedVersion)).toBe(true);
      const submitted = ownerValue(`BEGIN; SELECT set_config('request.jwt.claim.sub','${operatorUserId}',true); SELECT jsonb_build_object('result',erp.command_submit_deur(jsonb_build_object('commandId','C12-MGR-SUBMIT','idempotencyKey','C12-MGR-SUBMIT','rentalId','${id.rental}','rentalLineId','${id.line}','equipmentId','${id.equipment}','assignmentId','${id.assignment}','operatorId','${id.operator}','deurId','${id.deur}','expectedVersion',${completedVersion},'deviceId','C12-MANAGER'))); COMMIT;`);
      expect(submitted.result).toMatchObject({ success: true, disposition: "ACCEPTED" }); checkpoint("DEUR_SUBMITTED");
      const lifecycle = ownerValue(`SELECT jsonb_build_object('status',(SELECT status FROM erp.deurs WHERE id='${id.deur}'),'operationMinutes',(SELECT total_operating_minutes FROM erp.deurs WHERE id='${id.deur}'),'events',(SELECT count(*) FROM erp.deur_events WHERE deur_id='${id.deur}'),'openEvents',(SELECT count(*) FROM erp.deur_events WHERE deur_id='${id.deur}' AND is_open),'shiftStarts',(SELECT count(*) FROM erp.deur_events WHERE deur_id='${id.deur}' AND activity_type='shift' AND action='start'),'shiftEnds',(SELECT count(*) FROM erp.deur_events WHERE deur_id='${id.deur}' AND activity_type='shift' AND action='end'));`);
      expect(lifecycle).toMatchObject({ status: "Submitted", operationMinutes: 120, events: 4, openEvents: 0, shiftStarts: 1, shiftEnds: 1 });
      const customerIssue = await operator.schema("erp").rpc("trusted_issue_customer_review", { command: { commandId: randomUUID(), idempotencyKey: randomUUID(), deurId: id.deur, rentalLineId: id.line, revisionId: id.deur } });
      expect(customerIssue.error).toBeNull(); expect(customerIssue.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
      const customerPath = customerIssue.data.value.notification.reviewPath as string;
      const customerToken = customerPath.slice("/review/deur/".length);
      const acknowledge = await harness.anonymous.schema("erp").rpc("public_acknowledge_customer_review", { command: { token: customerToken, commandId: randomUUID(), idempotencyKey: randomUUID() } });
      expect(acknowledge.error).toBeNull(); expect(acknowledge.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
      const prerequisite = ownerValue(`SELECT jsonb_build_object('requests',(SELECT count(*) FROM erp.customer_review_requests WHERE company_id='${tenant}' AND deur_id='${id.deur}' AND revision_id='${id.deur}'),'outcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}' AND deur_id='${id.deur}' AND revision_id='${id.deur}' AND action='ACKNOWLEDGE'),'corrections',(SELECT count(*) FROM erp.customer_correction_requests WHERE company_id='${tenant}'),'status',(SELECT status FROM erp.deurs WHERE id='${id.deur}'),'revision',(SELECT coalesce(revision_number,1) FROM erp.deurs WHERE id='${id.deur}'),'consumed',(SELECT consumed_at IS NOT NULL FROM erp.customer_review_requests WHERE company_id='${tenant}' AND deur_id='${id.deur}'));`);
      expect(prerequisite).toEqual({ requests: 1, outcomes: 1, corrections: 0, status: "Acknowledged", revision: 1, consumed: true }); checkpoint("CUSTOMER_ACKNOWLEDGED");
      const repository = new SupabaseTrustedNotificationRepository(manager, harness.admin);
      const issue = await repository.issue("manager", { commandId: randomUUID(), idempotencyKey: randomUUID(), deurId: id.deur, rentalLineId: id.line, revisionId: id.deur });
      expect(issue).toMatchObject({ success: true, disposition: "ACCEPTED" });
      const reviewPath = issue.reviewPath!;
      const managerToken = reviewPath.slice("/review/manager/".length);
      checkpoint("MANAGER_REQUEST_CREATED");
      const snapshot = ownerValue(`SELECT jsonb_build_object('requestCount',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id='${tenant}'),'pending',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id='${tenant}' AND status='Pending' AND consumed_at IS NULL),'status',(SELECT status FROM erp.manager_review_requests WHERE company_id='${tenant}'),'recipient',(SELECT recipient_user_id='${managerUserId}'::uuid FROM erp.manager_review_requests WHERE company_id='${tenant}'),'snapshot',(SELECT snapshot FROM erp.manager_review_requests WHERE company_id='${tenant}'),'managerIntents',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}' AND notification_type='MANAGER_REVIEW_REQUESTED'),'managerAttempts',(SELECT count(*) FROM erp.notification_delivery_attempts a JOIN erp.notification_outbox n ON n.id=a.notification_id WHERE n.company_id='${tenant}' AND n.notification_type='MANAGER_REVIEW_REQUESTED'),'outcomes',(SELECT count(*) FROM erp.manager_review_outcomes WHERE company_id='${tenant}'),'corrections',(SELECT count(*) FROM erp.manager_correction_requests WHERE company_id='${tenant}'));`);
      expect(snapshot).toMatchObject({ requestCount: 1, pending: 1, status: "Pending", recipient: true, managerIntents: 1, managerAttempts: 0, outcomes: 0, corrections: 0 });
      expect(snapshot.snapshot).toMatchObject({ companyName: "C12 Manager Email UAT", customerName: "C12 Manager Customer", rentalReference: "C12-MANAGER-EMAIL-001", project: "C12 Manager Project", submittedRevision: expect.stringMatching(/ R1$/), equipment: "C12 Manager Excavator", assetNumber: "C12-MGR-001", operator: "C12 Controlled Operator", workDate: "2026-08-11", shiftStart: expect.any(String), shiftEnd: expect.any(String), operationMinutes: 120, idleMinutes: 0, standbyMinutes: 0, breakdownMinutes: 0, customerDecision: { action: "ACKNOWLEDGE", occurredAt: expect.any(String) }, billingEligible: true });
      expect(snapshot.snapshot.timeline).toHaveLength(2);
      expect(snapshot.snapshot.timeline.map((event: any) => `${event.activity}:${event.action}`)).toEqual(["operation:start", "operation:end"]);
      expect(JSON.stringify(snapshot.snapshot)).not.toMatch(/companyId|tenantId|recipientDestination|token|hash|credential/i);
      const immutable = ownerValue(`BEGIN; UPDATE erp.companies SET name='C12 Temporary Rename' WHERE id='${tenant}'; SELECT jsonb_build_object('frozen',(SELECT snapshot->>'companyName'='C12 Manager Email UAT' FROM erp.manager_review_requests WHERE company_id='${tenant}')); ROLLBACK;`);
      expect(immutable).toEqual({ frozen: true });
      checkpoint("MANAGER_SNAPSHOT_OK");
      const secureLookup = await harness.anonymous.schema("erp").rpc("get_manager_review", { command: { token: managerToken } });
      expect(secureLookup.error).toBeNull();
      expect(secureLookup.data).toMatchObject({ success: true, disposition: "AVAILABLE", value: { companyName: "C12 Manager Email UAT", customerName: "C12 Manager Customer", rentalReference: "C12-MANAGER-EMAIL-001", project: "C12 Manager Project", submittedRevision: expect.stringMatching(/ R1$/), equipment: "C12 Manager Excavator", assetNumber: "C12-MGR-001", operator: "C12 Controlled Operator", operationMinutes: 120, availableActions: ["APPROVE", "REJECT", "REQUEST_CORRECTION"] } });
      const afterGet = ownerValue(`SELECT jsonb_build_object('pending',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id='${tenant}' AND status='Pending' AND consumed_at IS NULL),'outcomes',(SELECT count(*) FROM erp.manager_review_outcomes WHERE company_id='${tenant}'),'corrections',(SELECT count(*) FROM erp.manager_correction_requests WHERE company_id='${tenant}'),'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts a JOIN erp.notification_outbox n ON n.id=a.notification_id WHERE n.company_id='${tenant}' AND n.notification_type='MANAGER_REVIEW_REQUESTED'));`);
      expect(afterGet).toEqual({ pending: 1, outcomes: 0, corrections: 0, attempts: 0 });
      checkpoint("READY_FOR_PROVIDER_SEND");
      if (runPreSend) return;
      const intent = await repository.getIntent(issue.notificationIntentId!);
      const workerId = randomUUID(); expect(await repository.claim(intent.id, workerId)).toBe(true);
      const provider = new ResendEmailDeliveryProvider({ apiKey: notification.resendApiKey, uatRecipientOverride: recipient, timeoutMs: 15_000 });
      const reviewUrl = new URL(reviewPath, notification.publicBaseUrl).toString();
      const delivered = await provider.send({ from: notification.fromAddress, to: intent.recipient.destination, recipientName: intent.recipient.displayName, email: renderNotificationTemplate(intent.type, { ...intent.input, reviewUrl }), idempotencyKey: intent.idempotencyKey });
      expect(delivered.accepted).toBe(true); if (!delivered.accepted) throw new Error("Manager provider delivery was not accepted.");
      await repository.complete({ id: intent.id, workerId, status: "ProviderAccepted", providerName: delivered.provider, providerMessageId: delivered.providerMessageId });
      providerAccepted = true;
      const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(delivered.providerMessageId)}`, { headers: { Authorization: `Bearer ${readbackKey}` } });
      expect(response.status).toBe(200);
      const message = await response.json() as { id?: string; to?: string[]; from?: string; subject?: string; html?: string; text?: string };
      expect(message.id).toBe(delivered.providerMessageId); expect(message.to).toContain(recipient); expect(message.from).toContain(notification.fromAddress); expect(message.subject).toMatch(/manager|DEUR|review/i);
      const content = `${message.html ?? ""}\n${message.text ?? ""}`;
      expect(content).toContain(reviewUrl); expect(content).toContain(managerToken);
      await verifyRenderedManagerReviewReadOnly(reviewUrl);
      const state = ownerValue(`SELECT jsonb_build_object('requests',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id='${tenant}'),'pending',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id='${tenant}' AND status='Pending' AND consumed_at IS NULL),'outcomes',(SELECT count(*) FROM erp.manager_review_outcomes WHERE company_id='${tenant}'),'corrections',(SELECT count(*) FROM erp.manager_correction_requests WHERE company_id='${tenant}'),'intents',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}' AND notification_type='MANAGER_REVIEW_REQUESTED'),'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts a JOIN erp.notification_outbox n ON n.id=a.notification_id WHERE n.company_id='${tenant}' AND n.notification_type='MANAGER_REVIEW_REQUESTED'),'accepted',(SELECT count(*) FROM erp.notification_delivery_attempts a JOIN erp.notification_outbox n ON n.id=a.notification_id WHERE n.company_id='${tenant}' AND n.notification_type='MANAGER_REVIEW_REQUESTED' AND a.status='ProviderAccepted'));`);
      expect(state).toEqual({ requests: 1, pending: 1, outcomes: 0, corrections: 0, intents: 1, attempts: 1, accepted: 1 });
      await administrator.auth.signOut(); await operator.auth.signOut(); await manager.auth.signOut();
    } finally {
      if (!providerAccepted) {
        try { cleanup(); } catch { /* preserve first failure */ }
        if (administratorUserId) await harness.admin.auth.admin.deleteUser(administratorUserId);
        if (operatorUserId) await harness.admin.auth.admin.deleteUser(operatorUserId);
        if (managerUserId) await harness.admin.auth.admin.deleteUser(managerUserId);
        try { cleanup(); } catch { /* preserve first failure */ }
        const residue = ownerValue(`SELECT jsonb_build_object('companies',(SELECT count(*) FROM erp.companies WHERE id='${tenant}'),'users',(SELECT count(*) FROM erp.users WHERE company_id='${tenant}'),'designations',(SELECT count(*) FROM erp.manager_review_recipient_configurations WHERE company_id='${tenant}'),'uatSequences',(SELECT count(*) FROM erp.number_sequences WHERE company_id LIKE ('TENANT-'||'UAT-%')),'localTenant',(SELECT count(*) FROM erp.companies WHERE id=('TENANT-'||'LOCAL-001') AND code='LOCAL' AND environment_class='compatibility'));`);
        expect(residue).toEqual({ companies: 0, users: 0, designations: 0, uatSequences: 0, localTenant: 1 });
        let authResidue = 0;
        for (let page = 1; ; page++) { const listed = await harness.admin.auth.admin.listUsers({ page, perPage: 100 }); if (listed.error) throw listed.error; authResidue += listed.data.users.filter((user) => user.user_metadata?.fixtureTenant === tenant).length; if (listed.data.users.length < 100) break; }
        expect(authResidue).toBe(0);
      }
    }
  }, 240_000);
});
