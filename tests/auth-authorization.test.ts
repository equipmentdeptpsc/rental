import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  type Permission,
} from "@/features/auth/domain/permission";
import {
  getSystemRoleDefinition,
  SYSTEM_ROLE_DEFINITIONS,
} from "@/features/auth/domain/rolePermissions";
import type { SystemRole } from "@/features/auth/domain/systemRole";
import type { User } from "@/features/auth/domain/user";
import { AuthorizationService } from "@/features/auth/services/AuthorizationService";

const authorization = new AuthorizationService();

function user(
  systemRoles: readonly SystemRole[],
  status: User["status"] = "active",
): User {
  return {
    id: "user-1",
    username: "test.user",
    displayName: "Test User",
    systemRoles,
    status,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
}

function permissionsFor(role: SystemRole): ReadonlySet<Permission> {
  return SYSTEM_ROLE_DEFINITIONS[role].permissions;
}

describe("system role permission mappings", () => {
  it("gives System Administrator every catalog permission", () => {
    expect([...permissionsFor("system-administrator")].sort()).toEqual(
      [...ALL_PERMISSIONS].sort(),
    );
  });

  it("gives Rental Operations operational access but no administration", () => {
    const permissions = permissionsFor("rental-operations");

    expect(permissions).toContain("rental.manage");
    expect(permissions).toContain("rental.approval.submit");
    expect(permissions).not.toContain("rental.approval.decide");
    expect(permissions).toContain("deur.correct");
    expect(permissions).toContain("billing.read");
    expect(permissions).toContain("maintenance.read");
    expect(permissions).toContain("maintenance.manage");
    expect(permissions).not.toContain("billing.update");
    expect(permissions).not.toContain("users.manage");
    expect(permissions).not.toContain("settings.manage");
  });

  it("gives Finance finance mutations and supporting read access only", () => {
    const permissions = permissionsFor("finance");

    expect(permissions).toContain("billing.update");
    expect(permissions).toContain("collections.manage");
    expect(permissions).toContain("rental.read");
    expect(permissions).not.toContain("rental.manage");
    expect(permissions).not.toContain("rental.release");
    expect(permissions).not.toContain("deur.create");
  });

  it("gives Management rental decision authority without unrelated mutations", () => {
    const permissions = permissionsFor("management");
    const mutationSuffixes = [
      ".create",
      ".update",
      ".delete",
      ".restore",
      ".manage",
      ".release",
      ".return",
      ".approve",
      ".correct",
    ];

    expect(permissions).toContain("equipment.read");
    expect(permissions).toContain("billing.read");
    expect(permissions).toContain("reports.view");
    expect(permissions).toContain("maintenance.read");
    expect(permissions).toContain("rental.approval.decide");
    expect(permissions).not.toContain("rental.approval.submit");
    expect(permissions).not.toContain("maintenance.manage");
    expect(
      [...permissions].some((permission) =>
        mutationSuffixes.some((suffix) => permission.endsWith(suffix)),
      ),
    ).toBe(false);
  });
});

describe("AuthorizationService", () => {
  it("restricts an active operator-linked persona without changing the role bundle", () => {
    const scoped = new AuthorizationService({ getById: (id) => id === "operator-1" ? { id, status: "Active" } : undefined });
    const operatorUser = { ...user(["rental-operations"]), operatorId: "operator-1" };

    expect(scoped.isOperatorPersona(operatorUser)).toBe(true);
    expect(scoped.hasPermission(operatorUser, "deur.read")).toBe(true);
    expect(scoped.hasPermission(operatorUser, "deur.create")).toBe(true);
    expect(scoped.hasPermission(operatorUser, "rental.read")).toBe(false);
    expect(scoped.hasPermission(operatorUser, "maintenance.manage")).toBe(false);
  });

  it("honors remote effective permissions while retaining operator persona restrictions", () => {
    const scoped = new AuthorizationService({ getById: (id) => id === "operator-1" ? { id, status: "Active" } : undefined });
    const operatorUser = { ...user([]), operatorId: "operator-1" };

    expect(scoped.hasGrantedPermission(operatorUser, "deur.read", new Set(["deur.read"]))).toBe(true);
    expect(scoped.hasGrantedPermission(operatorUser, "rental.read", new Set(["rental.read"]))).toBe(false);
    expect(scoped.hasGrantedPermission({ ...operatorUser, status: "inactive" }, "deur.read", new Set(["deur.read"]))).toBe(false);
  });

  it("does not classify missing or inactive Operator links as an Operator persona", () => {
    const scoped = new AuthorizationService({ getById: (id) => id === "inactive" ? { id, status: "Suspended" } : undefined });
    expect(scoped.isOperatorPersona({ ...user(["rental-operations"]), operatorId: "missing" })).toBe(false);
    expect(scoped.isOperatorPersona({ ...user(["rental-operations"]), operatorId: "inactive" })).toBe(false);
  });
  it("combines permissions from multiple roles", () => {
    const combined = authorization.getEffectivePermissions(
      user(["finance", "rental-operations"]),
    );

    expect(combined).toContain("rental.release");
    expect(combined).toContain("billing.update");
  });

  it("deduplicates duplicate roles and permissions", () => {
    const combined = [
      ...authorization.getEffectivePermissions(
        user(["management", "management", "finance"]),
      ),
    ];

    expect(new Set(combined).size).toBe(combined.length);
    expect(combined.filter((permission) => permission === "billing.read")).toHaveLength(1);
  });

  it("gives inactive users no effective permissions", () => {
    expect(
      authorization.getEffectivePermissions(
        user(["system-administrator"], "inactive"),
      ).size,
    ).toBe(0);
  });

  it("answers single, any, and all permission checks", () => {
    const finance = user(["finance"]);

    expect(authorization.hasPermission(finance, "billing.update")).toBe(true);
    expect(
      authorization.hasAnyPermission(finance, [
        "rental.release",
        "collections.manage",
      ]),
    ).toBe(true);
    expect(
      authorization.hasAllPermissions(finance, [
        "billing.read",
        "billing.create",
        "collections.manage",
      ]),
    ).toBe(true);
    expect(
      authorization.hasAllPermissions(finance, [
        "billing.read",
        "rental.manage",
      ]),
    ).toBe(false);
  });

  it("ignores unknown or malformed runtime role identifiers", () => {
    const malformed = {
      ...user([]),
      systemRoles: ["finance", "unknown-role", "", null],
    } as unknown as User;

    expect(authorization.hasPermission(malformed, "billing.read")).toBe(true);
    expect(authorization.hasPermission(malformed, "users.manage")).toBe(false);
    expect(getSystemRoleDefinition("unknown-role")).toBeUndefined();
  });

  it("does not mutate users, role assignments, or role mappings", () => {
    const roles = Object.freeze(["finance", "management"] as const);
    const input = Object.freeze({ ...user(roles), systemRoles: roles });
    const before = [...permissionsFor("finance")];

    authorization.getEffectivePermissions(input);

    expect(input.systemRoles).toEqual(["finance", "management"]);
    expect([...permissionsFor("finance")]).toEqual(before);
  });

  it("returns permission collections without mutable Set methods", () => {
    const effective = authorization.getEffectivePermissions(user(["finance"]));

    expect("add" in effective).toBe(false);
    expect("delete" in effective).toBe(false);
    expect("clear" in effective).toBe(false);
  });
});
