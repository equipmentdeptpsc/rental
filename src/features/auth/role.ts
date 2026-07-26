export type Role = "Admin" | "Manager" | "Operator";

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

  Manager: {
    canEdit: false,
    canDelete: false,
    canChangeStatus: true,
    canRestore: false,
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
