import type { User as DomainUser } from "../domain/user";
import type { SystemRole } from "../domain/systemRole";
import type { Role } from "../role";
import type { User as LegacyUser } from "../user";

export type AuthenticatedUser = DomainUser & LegacyUser;

const systemToLegacyRole: Readonly<Record<SystemRole, Role>> = {
  "system-administrator": "Admin",
  "rental-operations": "Admin",
  finance: "Operator",
  management: "Manager",
};

const legacyToSystemRole: Readonly<Record<Role, SystemRole>> = {
  Admin: "system-administrator",
  Manager: "management",
  Operator: "management",
};

export function adaptDomainUser(user: DomainUser): AuthenticatedUser {
  return Object.freeze({
    ...user,
    systemRoles: Object.freeze([...user.systemRoles]),
    name: user.displayName,
    role: systemToLegacyRole[user.systemRoles[0] as SystemRole] ?? "Operator",
  });
}

export function adaptLegacyUser(user: LegacyUser): AuthenticatedUser {
  const timestamp = "1970-01-01T00:00:00.000Z";
  return Object.freeze({
    ...user,
    username: user.name,
    displayName: user.name,
    systemRoles: Object.freeze([legacyToSystemRole[user.role]]),
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
