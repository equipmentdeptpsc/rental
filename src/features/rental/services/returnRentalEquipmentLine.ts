import type { EquipmentRecord } from "@/features/equipment/types";
import type { RentalEquipmentLine } from "../equipment-line";
import type { DeurRecord } from "../deur/types";

export function returnRentalEquipmentLine(input: {
  line: RentalEquipmentLine;
  equipment: EquipmentRecord;
  deurs: readonly DeurRecord[];
  returnedAt: string;
}) {
  if (!["Released", "Active"].includes(input.line.status)) {
    return { success: false as const, code: "LINE_NOT_RETURNABLE", message: "Only Released or Active equipment lines can be returned." };
  }
  if (input.deurs.some((deur) => deur.rentalEquipmentLineId === input.line.id && ["Draft", "In Progress", "Submitted"].includes(deur.status))) {
    return { success: false as const, code: "LINE_DEUR_INCOMPLETE", message: "Complete and acknowledge the line DEUR before returning this equipment." };
  }
  return {
    success: true as const,
    line: { ...structuredClone(input.line), status: "Returned" as const, updatedAt: input.returnedAt },
    equipment: { ...structuredClone(input.equipment), status: "Available" as const, projectId: "", operatorId: "" },
  };
}
