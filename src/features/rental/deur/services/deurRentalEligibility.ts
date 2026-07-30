import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalRecord } from "@/features/rental/types";
import { materializeRentalEquipmentLineCompatibility, rentalEquipmentLineRepository } from "../../equipment-line";
import { getDeurStartEligibility } from "./DeurValidationService";

export interface EligibleDeurRental {
  rentalId: string; rentalEquipmentLineId: string; rentalNumber: string; equipmentId: string; equipmentLabel: string;
  operatorId: string; operatorLabel: string; projectId: string; projectLabel: string; assignmentId?: string; label: string;
}
export interface IneligibleDeurRental { rentalId: string; rentalEquipmentLineId?: string; equipmentId?: string; reason: string }

export function getDeurRentalEligibility(rentals: RentalRecord[], equipment: EquipmentRecord[], operators: Operator[], projects: ProjectRecord[], _assignments: AssignmentRecord[]) {
  const eligible: EligibleDeurRental[] = []; const excluded: IneligibleDeurRental[] = [];
  const allLines = materializeRentalEquipmentLineCompatibility(rentals, rentalEquipmentLineRepository.getAll()).lines;
  rentals.forEach((rental) => {
    const lifecycle = getDeurStartEligibility(rental);
    if (!lifecycle.eligible) { excluded.push({ rentalId: rental.id, reason: lifecycle.message }); return; }
    const lines = allLines.filter((line) => line.rentalId === rental.id);
    if (!lines.length) { excluded.push({ rentalId: rental.id, reason: "Rental has no Equipment Line." }); return; }
    const project = projects.find((item) => item.id === rental.projectId);
    if (!project) { excluded.push({ rentalId: rental.id, reason: "Project is missing." }); return; }
    lines.forEach((line) => {
      const base = { rentalId: rental.id, rentalEquipmentLineId: line.id, equipmentId: line.equipmentId };
      if (!["Released", "Active"].includes(line.status)) { excluded.push({ ...base, reason: "Rental Equipment Line is not operational." }); return; }
      const machine = equipment.find((item) => item.id === line.equipmentId);
      if (!machine) { excluded.push({ ...base, reason: "Equipment is missing." }); return; }
      const operator = operators.find((item) => item.id === line.operatorId);
      if (!operator) { excluded.push({ ...base, reason: "Operator is missing." }); return; }
      if (line.commercialSnapshotRequired && !line.commercialSnapshot) { excluded.push({ ...base, reason: "Commercial snapshot is missing." }); return; }
      const equipmentLabel = `${machine.assetNo} - ${machine.equipmentName}`; const projectLabel = `${project.projectCode} - ${project.projectName}`;
      eligible.push({ ...base, rentalNumber: rental.rentalNumber ?? "Rental", equipmentLabel, operatorId: operator.id, operatorLabel: operator.name, projectId: project.id, projectLabel, assignmentId: line.assignmentId, label: `${rental.rentalNumber ?? "Rental"} — ${equipmentLabel} — ${projectLabel} — ${operator.name}` });
    });
  });
  return { eligible, excluded };
}
