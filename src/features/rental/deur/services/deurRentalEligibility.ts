import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalRecord } from "@/features/rental/types";

export interface EligibleDeurRental {
  rentalId: string; rentalNumber: string; equipmentId: string; equipmentLabel: string;
  operatorId: string; operatorLabel: string; projectId: string; projectLabel: string; assignmentId?: string; label: string;
}
export interface IneligibleDeurRental { rentalId: string; reason: string; }

export function getDeurRentalEligibility(rentals: RentalRecord[], equipment: EquipmentRecord[], operators: Operator[], projects: ProjectRecord[], assignments: AssignmentRecord[]) {
  const eligible: EligibleDeurRental[] = [];
  const excluded: IneligibleDeurRental[] = [];
  rentals.forEach((rental) => {
    if (rental.status !== "Released" && rental.status !== "Active") { excluded.push({ rentalId: rental.id, reason: "Rental must be released or active." }); return; }
    const machine = equipment.find((item) => item.id === rental.equipmentId);
    if (!machine) { excluded.push({ rentalId: rental.id, reason: "Equipment is missing." }); return; }
    const operatorId = rental.operatorId ?? assignments.find((item) => item.id === rental.assignmentId)?.operatorId;
    const operator = operators.find((item) => item.id === operatorId);
    if (!operator || !operatorId) { excluded.push({ rentalId: rental.id, reason: "Operator is missing." }); return; }
    const project = projects.find((item) => item.id === rental.projectId);
    if (!project) { excluded.push({ rentalId: rental.id, reason: "Project is missing." }); return; }
    const equipmentLabel = `${machine.assetNo} - ${machine.equipmentName}`;
    const projectLabel = `${project.projectCode} - ${project.projectName}`;
    eligible.push({ rentalId: rental.id, rentalNumber: rental.rentalNumber ?? "Rental", equipmentId: machine.id, equipmentLabel, operatorId, operatorLabel: operator.name, projectId: project.id, projectLabel, assignmentId: rental.assignmentId, label: `${rental.rentalNumber ?? "Rental"} — ${equipmentLabel} — ${projectLabel} — ${operator.name}` });
  });
  return { eligible, excluded };
}
