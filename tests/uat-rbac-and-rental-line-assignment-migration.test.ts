import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { SupabaseCanonicalRentalRepository } from "@/integrations/supabase/SupabaseCanonicalRentalRepository";
import { PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { canUseCanonicalRemoteRentalLineAssignmentMutation } from "@/features/rental/services/rentalRuntimeCapability";

const migration = readFileSync(resolve("supabase/migrations/20261011000100_uat_operations_administrator_and_rental_line_assignment.sql"), "utf8");

describe("UAT administrator coverage and Rental Workspace assignment migration", () => {
  it("backfills every active System Administrator permission without changing other roles or user assignments", () => {
    expect(migration).toContain("administrator.code='system-administrator'");
    expect(migration).toContain("CROSS JOIN erp.app_permissions permission");
    expect(migration).toContain("permission.active");
    expect(migration).toContain("grant_catalog_permission_to_system_administrator");
    expect(migration).toContain("AFTER INSERT OR UPDATE OF active ON erp.app_permissions");
    expect(migration).toContain("User role assignments must not change");
    expect(migration).toContain("Non-administrator role mappings must not change");
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+erp\.user_roles/i);
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY|GRANT\s+(?:INSERT|UPDATE|DELETE).*authenticated/i);
  });

  it("reconciles active catalog permissions when System Administrator is reactivated", () => {
    expect(migration).toContain("reconcile_reactivated_system_administrator_permissions");
    expect(migration).toContain("NEW.code='system-administrator' AND NEW.active AND NOT OLD.active");
    expect(migration).toContain("AFTER UPDATE OF active ON erp.app_roles");
    expect(migration).toContain("SELECT NEW.id,permission.id FROM erp.app_permissions permission WHERE permission.active");
  });

  it("keeps the existing commitment as one linked Assignment and line transaction", () => {
    for (const marker of [
      "command_configure_rental_line_assignment", "SET CONSTRAINTS fk_lines_company_assignment DEFERRED",
      "erp.assert_equipment_interval_available", "enforce_assignment_commitment_interval",
      "assignment.operator.replace", "RENTAL_LINE_ASSIGNMENT_CONFIGURED",
      "erp.begin_operational_command", "erp.finish_operational_command",
      "erp.billing_statement_lines", "erp.deurs",
    ]) expect(migration).toContain(marker);
    expect(migration).toContain("FOREIGN KEY(company_id,assignment_id) REFERENCES erp.assignments(company_id,id) DEFERRABLE INITIALLY IMMEDIATE");
    expect(migration).toContain("UPDATE erp.rental_equipment_lines SET assignment_id=assignment_id_value");
    expect(migration).toContain("INSERT INTO erp.assignments");
    expect(migration).toContain("WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','CONFLICT')");
  });

  it("serializes simultaneous operator claims and returns only authorized conflict details", () => {
    expect(migration).toContain("FROM erp.operators WHERE id=command->>'operatorId'");
    expect(migration).toMatch(/FROM erp\.operators[^;]+FOR UPDATE/s);
    expect(migration.match(/'code','OPERATOR_ALREADY_ASSIGNED'/g)).toHaveLength(2);
    expect(migration.match(/IF erp\.current_user_has_permission\('assignment\.read'\) THEN/g)).toHaveLength(2);
    expect(migration).toContain("'assignmentId',conflicting_assignment.id");
    expect(migration).not.toContain("'operatorId',conflicting_assignment.operator_id");
    expect(migration).not.toContain("'projectId',conflicting_assignment.project_id");
    expect(migration).not.toContain("'equipmentId',conflicting_assignment.equipment_id");
  });

  it("enables the workspace command only through its explicit UAT capability", () => {
    const base = { persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: false } as ApplicationDependencies["configuration"];
    expect(canUseCanonicalRemoteRentalLineAssignmentMutation(base)).toBe(false);
    expect(canUseCanonicalRemoteRentalLineAssignmentMutation({ ...base, remoteRentalLineAssignmentEnabled: true })).toBe(true);
    expect(canUseCanonicalRemoteRentalLineAssignmentMutation({ ...base, persistenceMode: PersistenceMode.Local, remoteRentalLineAssignmentEnabled: true })).toBe(false);
  });

  it("maps the line command to its canonical RPC without exposing direct table writes", async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, disposition: "ACCEPTED", value: { rentalId: "rental-1", version: 4, status: "Draft" } }, error: null }));
    const repository = new SupabaseCanonicalRentalRepository({ schema: () => ({ rpc }) } as never);
    await expect(repository.configureLineAssignment({ commandId: "command-1", idempotencyKey: "key-1", rentalId: "rental-1", rentalLineId: "line-1", expectedVersion: 3, operatorId: "operator-1", effectiveStartDate: "2026-10-11", activityCodeId: "activity-1" })).resolves.toMatchObject({ success: true, value: { rentalId: "rental-1", version: 4 } });
    expect(rpc).toHaveBeenCalledWith("command_configure_rental_line_assignment", { command: expect.objectContaining({ rentalLineId: "line-1", operatorId: "operator-1" }) });
  });

  it("maps operator conflicts and suppresses unapproved detail fields", async () => {
    const rpc = vi.fn(async () => ({ data: { success: false, code: "OPERATOR_ALREADY_ASSIGNED", details: { assignmentId: "assignment-2", assignedDate: "2026-10-10", projectId: "protected-project", operatorId: "protected-operator" } }, error: null }));
    const repository = new SupabaseCanonicalRentalRepository({ schema: () => ({ rpc }) } as never);
    await expect(repository.configureLineAssignment({ commandId: "command-2", idempotencyKey: "key-2", rentalId: "rental-1", rentalLineId: "line-1", expectedVersion: 3, operatorId: "operator-1", effectiveStartDate: "2026-10-11" })).resolves.toEqual({
      success: false,
      code: "OPERATOR_ALREADY_ASSIGNED",
      message: "This operator already has an active Assignment. Choose another operator or review the existing Assignment.",
      details: { assignmentId: "assignment-2", assignedDate: "2026-10-10" },
      currentVersion: undefined,
    });
  });

  it("does not invent conflict details when assignment.read withheld them", async () => {
    const rpc = vi.fn(async () => ({ data: { success: false, code: "OPERATOR_ALREADY_ASSIGNED" }, error: null }));
    const repository = new SupabaseCanonicalRentalRepository({ schema: () => ({ rpc }) } as never);
    await expect(repository.configureLineAssignment({ commandId: "command-3", idempotencyKey: "key-3", rentalId: "rental-1", rentalLineId: "line-1", expectedVersion: 3, operatorId: "operator-1", effectiveStartDate: "2026-10-11" })).resolves.toMatchObject({ success: false, code: "OPERATOR_ALREADY_ASSIGNED", details: undefined });
  });
});
