import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");
const roles = JSON.parse(read("docs/rbac/canonical-roles.json"));
const permissions = JSON.parse(read("docs/rbac/canonical-permissions.json"));
const matrix = JSON.parse(read("docs/rbac/role-permission-matrix.json"));
const groups = JSON.parse(read("docs/rbac/canonical-permission-groups.json"));
const usersPage = read("src/features/users/pages/UsersPage.tsx");
const userService = read("src/features/users/services/UserManagementService.ts");
const router = read("src/app/router.tsx");
const settings = read("src/pages/Settings.tsx");

function rolePermissions(role: string): string[] {
  const grant = matrix.grants[role];
  return [...new Set([
    ...Object.entries(grant.standard as Record<string, string[]>).flatMap(([resource, actions]) => actions.map(action => `${resource}.${action}`)),
    ...grant.workflow,
  ])].sort();
}

describe("P7.7 canonical administration contract", () => {
  it("protects the exact nine canonical roles and supports role-derived multi-role authority", () => {
    expect(roles.roles.map((role: { code: string }) => role.code).sort()).toEqual(Object.keys(matrix.grants).sort());
    expect(roles.roles).toHaveLength(9);
    expect(roles.roles.every((role: { systemManaged: boolean }) => role.systemManaged)).toBe(true);
    expect(matrix).toMatchObject({ denyByDefault: true, assignmentModel: "user-to-multiple-roles-only", protectedCanonicalRoles: true });
    expect(matrix.grants["system-administrator"].scopeRules).toEqual(expect.arrayContaining(["canonical-roles-protected", "custom-roles-supported"]));
  });

  it("resolves Rental Operations deterministically without duplicate permissions", () => {
    const roles = ["dispatcher", "equipment-coordinator", "operations-manager"];
    const first = [...new Set(roles.flatMap(rolePermissions))].sort();
    const second = [...new Set([...roles].reverse().flatMap(rolePermissions))].sort();
    expect(first).toEqual(second);
    expect(first).toHaveLength(47);
    expect(new Set(first).size).toBe(first.length);
  });

  it("groups the complete permission catalog into approved modules and actions", () => {
    expect(groups.groups.map((group: { label: string }) => group.label)).toEqual([
      "Rental", "Assignment", "Equipment", "Customer", "Operator", "Project", "Maintenance", "Billing", "Reports", "Administration",
    ]);
    const groupedResources = new Set(groups.groups.flatMap((group: { resources: string[] }) => group.resources));
    for (const resource of permissions.standardCatalog.resources) expect(groupedResources.has(resource)).toBe(true);
    for (const permission of permissions.workflowPermissions) expect(groupedResources.has(permission.resource)).toBe(true);
    expect(permissions.standardCatalog.actions.map((action: { action: string }) => action.action)).toEqual(["read", "create", "update", "delete", "approve", "close", "export"]);
  });

  it("defines all nine auditable configuration sections", () => {
    expect(groups.configurationSections).toEqual(["general", "numbering", "rental", "deur", "billing", "notifications", "scheduler", "security", "integrations"]);
    expect(groups.invariants).toEqual(expect.arrayContaining(["all-configuration-changes-audited"]));
  });

  it("records current implementation gaps without treating design metadata as implementation", () => {
    expect(userService).toContain("systemRoles: [...new Set(input.systemRoles)]");
    expect(userService).toContain("activate(actor");
    expect(userService).toContain("deactivate(actor");
    expect(userService).toContain("validateOperatorLink");
    expect(usersPage).toContain("systemRoles:form.roleCodes");
    expect(usersPage).toContain("Effective Canonical Access");
    expect(usersPage).toContain("Authorization History");
    expect(router).toMatch(/path:\s*["']roles["']/);
    expect(router).toMatch(/path:\s*["']permissions["']/);
    expect(settings).not.toContain("Integrations");
    expect(settings).not.toContain("Modified By");
    expect(settings).not.toContain("Audit History");
  });
});
