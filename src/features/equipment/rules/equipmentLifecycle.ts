import type { EquipmentRecord } from "../types";

export type EquipmentStatus =
  | "Available"
  | "Assigned"
  | "Maintenance";

export interface StatusChangeResult {
  allowed: boolean;
  reason?: string;
}

export const EquipmentLifecycle = {
  canEdit(
    equipment: EquipmentRecord
  ): boolean {
    return equipment.status !== "Maintenance";
  },

  canDelete(
    equipment: EquipmentRecord
  ): boolean {
    return (
      equipment.status !== "Assigned" &&
      equipment.status !== "Maintenance"
    );
  },

  canChangeStatus(
    equipment: EquipmentRecord,
    nextStatus: EquipmentStatus
  ): boolean {
    return (
      this.changeStatus(
        equipment,
        nextStatus
      ).allowed
    );
  },

  changeStatus(
    equipment: EquipmentRecord,
    nextStatus: EquipmentStatus
  ): StatusChangeResult {
    if (equipment.status === nextStatus) {
      return {
        allowed: false,
        reason: "Already in this status.",
      };
    }

    if (
      equipment.status === "Maintenance" &&
      nextStatus === "Assigned"
    ) {
      return {
        allowed: false,
        reason:
          "Equipment under maintenance cannot be assigned.",
      };
    }

    return {
      allowed: true,
    };
  },

  getStatusLabel(
    status: EquipmentStatus
  ): string {
    switch (status) {
      case "Available":
        return "Ready for assignment";

      case "Assigned":
        return "Currently assigned";

      case "Maintenance":
        return "Under maintenance";

      default:
        return status;
    }
  },
};