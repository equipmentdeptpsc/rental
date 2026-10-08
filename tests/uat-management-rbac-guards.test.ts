import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canReadDashboard } from "@/app/navigation/navigationConfig";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261008000100_uat_management_approval_guards.sql"), "utf8");
const roleCatalog = JSON.parse(readFileSync(join(process.cwd(), "docs/rbac/role-permission-matrix.json"), "utf8")) as {
  grants: Record<string, { allPermissions?: boolean; standard?: Record<string, string[]>; workflow?: string[] }>;
};
const hasRolePermission = (role: string, permission: string) => {
  const grant = roleCatalog.grants[role];
  const [resource, action] = permission.split(".");
  return Boolean(grant.allPermissions || grant.workflow?.includes(permission) || grant.standard?.[resource]?.includes(action));
};

describe("UAT management RBAC guards", () => {
  it("allows executive and financial dashboard readers through the route without mutation grants", () => {
    for (const role of ["management-viewer", "read-only-auditor", "operations-manager", "dispatcher", "billing-staff", "system-administrator"]) {
      expect(canReadDashboard((permission) => hasRolePermission(role, permission)), role).toBe(true);
    }
    expect(hasRolePermission("management-viewer", "rental.approval.decide")).toBe(false);
    expect(hasRolePermission("management-viewer", "billing.update")).toBe(false);
  });

  it("confirms Dispatcher has every Rentals list permission in the canonical role fixture", () => {
    for (const permission of ["rental.read", "customer.read", "project.read", "equipment.read", "operator.read", "assignment.read", "deur.read", "rental.approval.submit"]) {
      expect(hasRolePermission("dispatcher", permission), permission).toBe(true);
    }
    expect(hasRolePermission("dispatcher", "billing.read")).toBe(false);
    expect(hasRolePermission("dispatcher", "users.manage")).toBe(false);
  });

  it("adds only narrow financial and billing approval grants to Operations Manager", () => {
    expect(migration).toMatch(/r\.code='operations-manager' AND p\.code IN \('dashboard\.financial\.read','billing\.approve'\)/);
    expect(migration).toMatch(/current_user_has_permission\('billing\.approve'\)/);
    expect(migration).not.toMatch(/r\.code='operations-manager' AND p\.code IN \([^)]*'billing\.update'/);
  });

  it("protects parent release, line release, direct approval and customer email at table boundaries", () => {
    expect(migration).toContain("CREATE TRIGGER require_parent_rental_release_approval");
    expect(migration).toContain("CREATE TRIGGER require_line_rental_release_approval");
    expect(migration).toContain("OLD.approval_status IS DISTINCT FROM 'Approved'");
    expect(migration).toContain("NEW.approval_status IN ('Approved','Rejected')");
    expect(migration).toContain("CREATE TRIGGER require_scoped_billing_approval");
    expect(migration).toContain("CREATE TRIGGER require_billing_email_approval");
    expect(migration).toContain("current_user_is_management_approver()");
    expect(migration).toContain("CREATE TRIGGER enrich_rental_approval_audit");
    expect(migration).toContain("Operations Manager approval is required before this rental can be released.");
    expect(migration).toContain("Operations Manager approval is required before this billing statement can be sent to the customer.");
  });

  it("bounds management responses and leaves the billing command idempotency path intact", () => {
    expect(migration).toContain("ORDER BY s.created_at DESC LIMIT 20");
    expect(migration).toContain("r.approval_requested_by IS DISTINCT FROM auth.uid()");
    expect(migration).not.toMatch(/FROM erp\.rentals r WHERE[^\n]*r\.deleted_at/);
    expect(migration).toContain("LIMIT 5");
    expect(migration).toContain("idem->>'state'='REPLAY'");
    expect(migration).toContain("erp.finish_operational_command");
  });
});
