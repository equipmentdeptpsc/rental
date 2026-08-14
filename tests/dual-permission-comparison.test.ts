import { describe, expect, it } from "vitest";

import type { SystemRole } from "@/features/auth/domain/systemRole";
import type { User } from "@/features/auth/domain/user";
import { AuthorizationService } from "@/features/auth/services/AuthorizationService";
import { DualPermissionComparisonService } from "@/features/auth/services/DualPermissionComparisonService";

const service = new DualPermissionComparisonService();
const user = (role: SystemRole, status: User["status"] = "active"): User => ({
  id: `user-${role}`, username: role, displayName: role, systemRoles: [role], status,
  createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
});

describe("DualPermissionComparisonService", () => {
  it.each([
    ["system-administrator", "system-administrator", false],
    ["finance", "billing-staff", false],
    ["rental-operations", "operations-manager", true],
    ["management", "read-only-auditor", false],
  ] as const)("projects %s to %s without changing legacy authority", (legacyRole, canonicalRole, manual) => {
    const input = user(legacyRole);
    const legacyBefore = [...new AuthorizationService().getEffectivePermissions(input)].sort();
    const result = service.compare(input);

    expect(result.roleMappingUsed).toEqual([expect.objectContaining({ legacyRole, canonicalRole, manualClassificationRequired: manual })]);
    expect(result.legacyEffectivePermissions).toEqual(legacyBefore);
    expect(input.systemRoles).toEqual([legacyRole]);
  });

  it("marks Rental Operations as temporary and requiring manual classification", () => {
    const result = service.compare(user("rental-operations"));
    expect(result.manualClassificationRequired).toBe(true);
    expect(result.roleMappingUsed[0]?.rationale).toContain("Temporary comparison only");
    expect(result.roleMappingUsed[0]?.canonicalRole).toBe("operations-manager");
  });

  it("never upgrades Management to Operations Manager", () => {
    const result = service.compare(user("management"));
    expect(result.roleMappingUsed.map(mapping => mapping.canonicalRole)).toEqual(["read-only-auditor"]);
    expect(result.roleMappingUsed.some(mapping => mapping.canonicalRole === "operations-manager")).toBe(false);
  });

  it("explains compatibility aliases and excludes covered targets from unexplained increases", () => {
    const result = service.compare(user("finance"));
    const collections = result.compatibilityAliasExplanations.find(x => x.legacyPermission === "collections.manage");
    expect(collections?.projectedTargets).toContain("collections.reconcile");
    expect(result.unexplainedCanonicalOnlyPermissions).not.toContain("collections.reconcile");
    expect(result.canonicalOnlyPermissions).toContain("collections.reconcile");
  });

  it("treats every unexpected canonical privilege increase as blocking", () => {
    for (const role of ["finance", "rental-operations", "management"] as const) {
      const result = service.compare(user(role));
      expect(result.unexplainedCanonicalOnlyPermissions.length).toBeGreaterThan(0);
      expect(result.canonicalMappingWouldIncreaseAuthority).toBe(true);
      expect(result.blockingDiscrepancy).toBe(true);
    }
  });

  it("treats unrestricted administrator catalogs as authority-equivalent", () => {
    const result = service.compare(user("system-administrator"));
    expect(result.canonicalProjectedPermissions).toHaveLength(168);
    expect(result.unexplainedCanonicalOnlyPermissions).toEqual([]);
    expect(result.canonicalMappingWouldIncreaseAuthority).toBe(false);
  });

  it("returns deterministic, sorted, deduplicated deltas", () => {
    const input = { ...user("finance"), systemRoles: ["finance", "management", "finance"] } as User;
    const first = service.compare(input);
    const second = service.compare(input);
    expect(first).toEqual(second);
    for (const values of [first.legacyEffectivePermissions, first.canonicalProjectedPermissions, first.permissionsPresentInBoth, first.legacyOnlyPermissions, first.canonicalOnlyPermissions]) {
      expect(values).toEqual([...new Set(values)].sort());
    }
  });

  it("projects no authority for inactive users", () => {
    const result = service.compare(user("finance", "inactive"));
    expect(result.legacyEffectivePermissions).toEqual([]);
    expect(result.canonicalProjectedPermissions).toEqual([]);
    expect(result.roleMappingUsed).toEqual([]);
    expect(result.blockingDiscrepancy).toBe(false);
  });
});
