import {
  ALL_PERMISSIONS,
  immutablePermissionSet,
  type Permission,
} from "./permission";
import type { SystemRole, SystemRoleDefinition } from "./systemRole";

function permissionSet(permissions: readonly Permission[]): ReadonlySet<Permission> {
  return immutablePermissionSet(permissions);
}

const supportingReadPermissions = [
  "equipment.read",
  "assignment.read",
  "rental.read",
  "deur.read",
  "customer.read",
  "project.read",
  "operator.read",
] as const satisfies readonly Permission[];

export const SYSTEM_ROLE_DEFINITIONS: Readonly<
  Record<SystemRole, SystemRoleDefinition>
> = Object.freeze({
  "system-administrator": Object.freeze({
    id: "system-administrator",
    displayName: "System Administrator",
    permissions: permissionSet(ALL_PERMISSIONS),
  }),
  "rental-operations": Object.freeze({
    id: "rental-operations",
    displayName: "Rental Operations",
    permissions: permissionSet([
      "dashboard.read",
      "equipment.read",
      "equipment.create",
      "equipment.update",
      "equipment.delete",
      "equipment.restore",
      "assignment.read",
      "assignment.manage",
      "rental.read",
      "rental.manage",
      "rental.release",
      "rental.return",
      "rental.approval.submit",
      "rental.commercialTerms.manage",
      "deur.read",
      "deur.create",
      "deur.review",
      "deur.correct",
      "customer.read",
      "customer.manage",
      "project.read",
      "project.manage",
      "operator.read",
      "operator.manage",
      "maintenance.read",
      "maintenance.manage",
      "dailyLog.read",
      "dailyLog.manage",
      "billing.read",
      "collections.read",
      "reports.read",
    ]),
  }),
  operator: Object.freeze({
    id: "operator",
    displayName: "Operator",
    permissions: permissionSet([
      "deur.read",
      "deur.create",
    ]),
  }),
  finance: Object.freeze({
    id: "finance",
    displayName: "Finance",
    permissions: permissionSet([
      "dashboard.read",
      ...supportingReadPermissions,
      "billing.read",
      "billing.create",
      "billing.update",
      "collections.read",
      "collections.manage",
      "reports.read",
    ]),
  }),
  management: Object.freeze({
    id: "management",
    displayName: "Management",
    permissions: permissionSet([
      "dashboard.read",
      ...supportingReadPermissions,
      "rental.approval.decide",
      "maintenance.read",
      "dailyLog.read",
      "billing.read",
      "collections.read",
      "reports.read",
    ]),
  }),
});

export function getSystemRoleDefinition(
  role: string,
): SystemRoleDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(SYSTEM_ROLE_DEFINITIONS, role)
    ? SYSTEM_ROLE_DEFINITIONS[role as SystemRole]
    : undefined;
}
