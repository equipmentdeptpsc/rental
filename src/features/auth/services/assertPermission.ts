import type { User } from "../domain/user";
import type { Permission } from "../domain/permission";
import { authorizationService } from "./AuthorizationService";
import { AuthorizationError } from "./AuthorizationError";

export function assertPermission(
  user: User | null | undefined,
  permission: Permission,
): void {
  if (!authorizationService.hasPermission(user, permission)) {
    throw new AuthorizationError(permission);
  }
}
