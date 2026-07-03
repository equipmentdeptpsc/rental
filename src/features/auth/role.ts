export type Role = "Admin" | "Operator";

export type Permission =
  | "canEdit"
  | "canDelete"
  | "canChangeStatus"
  | "canRestore";

type RolePermissionsMap = Record<Role, Record<Permission, boolean>>;

export const RolePermissions: RolePermissionsMap = {
  Admin: {
    canEdit: true,
    canDelete: true,
    canChangeStatus: true,
    canRestore: true,
  },

  Operator: {
    canEdit: true,
    canDelete: false,
    canChangeStatus: true,
    canRestore: false,
  },
};

export function can(role: Role, permission: Permission): boolean {
  return RolePermissions[role][permission];
}