import { describe, expect, it } from "vitest";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C12_RETAINED_CLEANUP === "true";
const tenant = "TENANT-UAT-C12-CUSTOMER-EMAIL-001";
const cleanupSql = `SELECT erp.cleanup_c12_customer_email_certification_fixture(
  '${tenant}','${tenant}','CONFIRM-C12-CUSTOMER-EMAIL-CLEANUP'
);`;
const auditSql = `SELECT jsonb_build_object(
  'companies',(SELECT count(*) FROM erp.companies WHERE id='${tenant}'),
  'users',(SELECT count(*) FROM erp.users WHERE company_id='${tenant}'),
  'userRoles',(SELECT count(*) FROM erp.user_roles role JOIN erp.users app_user ON app_user.id=role.user_id WHERE app_user.company_id='${tenant}'),
  'operators',(SELECT count(*) FROM erp.operators WHERE company_id='${tenant}'),
  'customers',(SELECT count(*) FROM erp.customers WHERE company_id='${tenant}'),
  'projects',(SELECT count(*) FROM erp.projects WHERE company_id='${tenant}'),
  'equipment',(SELECT count(*) FROM erp.equipment WHERE company_id='${tenant}'),
  'assignments',(SELECT count(*) FROM erp.assignments WHERE company_id='${tenant}'),
  'rentals',(SELECT count(*) FROM erp.rentals WHERE company_id='${tenant}'),
  'lines',(SELECT count(*) FROM erp.rental_equipment_lines WHERE company_id='${tenant}'),
  'deurs',(SELECT count(*) FROM erp.deurs WHERE company_id='${tenant}'),
  'events',(SELECT count(*) FROM erp.deur_events WHERE company_id='${tenant}'),
  'activityLogs',(SELECT count(*) FROM erp.deur_activity_logs WHERE deur_id='DEUR-UAT-C12-CUSTOMER-EMAIL-001'),
  'reviewHistory',(SELECT count(*) FROM erp.deur_review_history WHERE company_id='${tenant}'),
  'checkpoints',(SELECT count(*) FROM erp.deur_meter_checkpoints WHERE company_id='${tenant}'),
  'requests',(SELECT count(*) FROM erp.customer_review_requests WHERE company_id='${tenant}'),
  'outcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}'),
  'corrections',(SELECT count(*) FROM erp.customer_correction_requests WHERE company_id='${tenant}'),
  'notifications',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}'),
  'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts WHERE company_id='${tenant}'),
  'billing',(SELECT count(*) FROM erp.billing_statements WHERE company_id='${tenant}'),
  'managerReviews',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id='${tenant}'),
  'managerOutcomes',(SELECT count(*) FROM erp.manager_review_outcomes WHERE company_id='${tenant}'),
  'audit',(SELECT count(*) FROM erp.audit_log WHERE company_id='${tenant}'),
  'operationalCommands',(SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id='${tenant}'),
  'deurCommands',(SELECT count(*) FROM erp.deur_command_idempotency WHERE company_id='${tenant}'),
  'commercialSnapshots',(SELECT count(*) FROM erp.commercial_snapshots WHERE rental_id='RENT-UAT-C12-CUSTOMER-EMAIL-001'),
  'rentalContracts',(SELECT count(*) FROM erp.rental_contracts WHERE rental_id='RENT-UAT-C12-CUSTOMER-EMAIL-001'),
  'shiftSnapshots',(SELECT count(*) FROM erp.rental_shift_window_snapshots WHERE rental_id='RENT-UAT-C12-CUSTOMER-EMAIL-001'),
  'equipmentHistory',(SELECT count(*) FROM erp.equipment_history WHERE equipment_id='EQP-UAT-C12-CUSTOMER-EMAIL-001'),
  'numberSequences',(SELECT count(*) FROM erp.number_sequences WHERE company_id='${tenant}')
);`;

function owner(sql: string) {
  return executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
}

function evidence(output: string): Record<string, number> {
  return JSON.parse(output).rows[0].jsonb_build_object;
}

function expectZero(value: Record<string, number>) {
  expect(Object.values(value).every((count) => count === 0)).toBe(true);
}

describe.skipIf(!enabled)("C12 retained customer-email exact cleanup", () => {
  it("cleans ERP evidence twice and deletes only the tagged temporary Auth identity", async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    const harness = createSupabasePhaseC2Harness(configuration);
    const before = evidence(owner(auditSql));
    expect(before).toMatchObject({ companies: 1, users: 1, requests: 1, outcomes: 1, corrections: 0 });
    const auth = await harness.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (auth.error) throw new Error("Temporary Auth identity audit failed.");
    const tagged = auth.data.users.filter((user) => user.user_metadata?.fixtureTenant === tenant);
    expect(tagged).toHaveLength(1);

    const first = JSON.parse(owner(cleanupSql)).rows[0]
      .cleanup_c12_customer_email_certification_fixture as Record<string, number>;
    expect(first).toMatchObject({ companies: 1, application_users: 1, customer_review_requests: 1 });
    expectZero(evidence(owner(auditSql)));

    const removed = await harness.admin.auth.admin.deleteUser(tagged[0].id);
    if (removed.error) throw new Error("Temporary Auth identity removal failed.");
    const afterAuth = await harness.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (afterAuth.error) throw new Error("Temporary Auth identity re-audit failed.");
    expect(afterAuth.data.users.filter((user) => user.user_metadata?.fixtureTenant === tenant)).toHaveLength(0);

    const second = JSON.parse(owner(cleanupSql)).rows[0]
      .cleanup_c12_customer_email_certification_fixture as Record<string, number>;
    expect(Object.values(second).every((count) => count === 0)).toBe(true);
    expectZero(evidence(owner(auditSql)));
    expectZero(evidence(owner(auditSql)));

    console.info(JSON.stringify({
      cleanupPassOne: "ERP_FIXTURE_REMOVED",
      authCleanup: "ONE_TAGGED_IDENTITY_REMOVED",
      cleanupPassTwo: "ZERO",
      residueAuditOne: "ZERO",
      residueAuditTwo: "ZERO",
    }));
  }, 60_000);
});
