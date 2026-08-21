import type { Permission } from "./permission";

export type SystemRole =
  | "system-administrator"
  | "rental-operations"
  | "operator"
  | "finance"
  | "management";

export interface SystemRoleDefinition {
  readonly id: SystemRole;
  readonly displayName: string;
  readonly permissions: ReadonlySet<Permission>;
}
