import {
  immutablePermissionSet,
  type Permission,
} from "../domain/permission";
import { getSystemRoleDefinition } from "../domain/rolePermissions";
import type { User } from "../domain/user";
import { OperatorPersonaAccessPolicy, type OperatorPersonaDirectory } from "./OperatorPersonaAccessPolicy";

export class AuthorizationService {
  private readonly personaPolicy: OperatorPersonaAccessPolicy;
  constructor(operators?: OperatorPersonaDirectory) { this.personaPolicy = new OperatorPersonaAccessPolicy(operators); }
  isOperatorPersona(user: User | null | undefined): boolean { return this.personaPolicy.isOperatorPersona(user); }
  getEffectivePermissions(user: User | null | undefined): ReadonlySet<Permission> {
    if (!user || user.status !== "active") {
      return immutablePermissionSet([]);
    }

    const effectivePermissions = new Set<Permission>();

    for (const role of user.systemRoles) {
      const definition = getSystemRoleDefinition(role);
      definition?.permissions.forEach((permission) => {
        if (this.personaPolicy.permits(user, permission)) effectivePermissions.add(permission);
      });
    }

    return immutablePermissionSet(effectivePermissions);
  }

  hasPermission(
    user: User | null | undefined,
    permission: Permission,
  ): boolean {
    return this.getEffectivePermissions(user).has(permission);
  }

  hasAnyPermission(
    user: User | null | undefined,
    permissions: readonly Permission[],
  ): boolean {
    const effectivePermissions = this.getEffectivePermissions(user);
    return permissions.some((permission) => effectivePermissions.has(permission));
  }

  hasAllPermissions(
    user: User | null | undefined,
    permissions: readonly Permission[],
  ): boolean {
    const effectivePermissions = this.getEffectivePermissions(user);
    return permissions.every((permission) => effectivePermissions.has(permission));
  }
}

export const authorizationService = new AuthorizationService();
