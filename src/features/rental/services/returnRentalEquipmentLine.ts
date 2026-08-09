import type { EquipmentRecord } from "@/features/equipment/types";
import type { RentalEquipmentLine } from "../equipment-line";
import type { DeurRecord } from "../deur/types";
import type { RentalRecord } from "../types";
import type { DeurShiftWindowDefinition } from "../types";
import { evaluateRentalEquipmentLineReturnReadiness } from "./evaluateRentalEquipmentLineReturnReadiness";

export function returnRentalEquipmentLine(input: {
  line: RentalEquipmentLine;
  rental: RentalRecord;
  equipment: EquipmentRecord;
  deurs: readonly DeurRecord[];
  returnedAt: string;
  liveShiftWindows?: DeurShiftWindowDefinition[];
}) {
  const readiness = evaluateRentalEquipmentLineReturnReadiness({ rental: input.rental, line: input.line, deurs: input.deurs, evaluationTimestamp: input.returnedAt, liveShiftWindows: input.liveShiftWindows });
  if (!readiness.eligible) return { success: false as const, code: readiness.reasonCodes[0], message: readiness.operatorMessage, readiness };
  return {
    success: true as const,
    line: { ...structuredClone(input.line), status: "Returned" as const, updatedAt: input.returnedAt },
    equipment: { ...structuredClone(input.equipment), status: "Available" as const, projectId: "", operatorId: "" },
  };
}
