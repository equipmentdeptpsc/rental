import type { Permission } from "../domain/permission";
import type { User } from "../domain/user";
import { assertPermission } from "./assertPermission";

/** Production mutation boundary; omission is allowed only for pre-RBAC tests. */
export function assertMutationPermission(
  user: User | null | undefined,
  permission: Permission,
): void {
  if (!user && import.meta.env.MODE === "test") return;
  assertPermission(user, permission);
}
