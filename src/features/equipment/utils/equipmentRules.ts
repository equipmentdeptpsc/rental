import type { EquipmentRecord } from "../data/equipment.mock";

export function canEditEquipment(item: EquipmentRecord) {
  return item.status !== "Assigned";
}

export function canDeleteEquipment(item: EquipmentRecord) {
  return item.status === "Available";
}

export function getBlockedReason(
  action: "edit" | "delete",
  item: EquipmentRecord
) {
  if (action === "edit" && item.status === "Assigned") {
    return "Cannot edit equipment that is currently assigned.";
  }

  if (action === "delete" && item.status === "Assigned") {
    return "Cannot delete equipment while it is assigned to a project.";
  }

  if (action === "delete" && item.status === "Maintenance") {
    return "Cannot delete equipment under maintenance.";
  }

  return "";
}