import type { AssignmentRecord } from "@/features/assignment/types";
import type { IEquipmentRepository } from "@/features/equipment/repository/IEquipmentRepository";
import type { IRentalRepository } from "@/features/rental/repository/IRentalRepository";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { rentalEquipmentLineRepository } from "@/features/rental/equipment-line/repository";
import type { AddRentalEquipmentInput, AddRentalEquipmentResult, CanonicalRentalEquipmentRepository } from "./contracts";

/**
  * Local mode keeps the same command shape and lifecycle boundary. Full D3
  * interval authority remains remote; local storage still enforces parent,
 * duplicate, and source-relationship rules needed by the UI contract.
 */
export class LocalCanonicalRentalEquipmentRepository implements CanonicalRentalEquipmentRepository {
  constructor(
    private readonly rentals: IRentalRepository,
    private readonly lines: typeof rentalEquipmentLineRepository,
    private readonly equipment: IEquipmentRepository,
    private readonly assignments: { getById(id: string): AssignmentRecord | undefined },
  ) {}

  async addEquipment(input: AddRentalEquipmentInput): Promise<AddRentalEquipmentResult> {
    const rental = this.rentals.getById(input.rentalId);
    if (!rental) return failure("NOT_FOUND", "Rental was not found.");
    if (["Cancelled", "Closed", "Returned"].includes(rental.status)) return failure("PARENT_READ_ONLY", "This Rental is read-only and cannot accept additional equipment.");
    if (!["Draft", "Reserved", "Released", "Active"].includes(rental.status)) return failure("PARENT_STATE_NOT_ELIGIBLE", "Additional equipment is not available in this Rental state.");
    if (input.proposedEffectiveStartDate < rental.dateOut || (rental.expectedReturn !== undefined && input.proposedEffectiveStartDate > rental.expectedReturn)) {
      return failure("INVALID_EFFECTIVE_START", "Choose an effective start date within the Rental interval.");
    }
    const machine = this.equipment.getById(input.equipmentId);
    if (!machine || machine.active === false || machine.deleted) return failure("NOT_FOUND", "Eligible Equipment was not found.");
    if (this.lines.getByRentalId(rental.id).some((line) => line.equipmentId === machine.id)) return failure("DUPLICATE_EQUIPMENT_LINE", "This equipment is already included in this Rental.");
    const assignment = input.sourceAssignmentId ? this.assignments.getById(input.sourceAssignmentId) : undefined;
    if (input.sourceAssignmentId && (!assignment || assignment.status !== "Active" || assignment.deleted || assignment.equipmentId !== machine.id || assignment.projectId !== rental.projectId)) {
      return failure("MISSING_RELATIONSHIP", "Referenced Rental information has changed or is unavailable. Refresh and try again.");
    }
    const now = new Date().toISOString();
    const line: RentalEquipmentLine = {
      id: crypto.randomUUID(), rentalId: rental.id, equipmentId: machine.id,
      ...(assignment ? { assignmentId: assignment.id, operatorId: assignment.operatorId } : { operatorId: "" }),
      status: "Draft", effectiveStartDate: input.proposedEffectiveStartDate,
      commercialSnapshotRequired: false, createdAt: now, updatedAt: now,
    };
    const saved = this.lines.createMany([line]);
    if (!saved.success) return failure("DUPLICATE_EQUIPMENT_LINE", saved.message);
    return { success: true, disposition: "ACCEPTED", value: { rentalId: rental.id, rentalNumber: rental.rentalNumber, rentalLineId: line.id, equipmentId: line.equipmentId, lineStatus: "Draft", canonicalLineStatus: "Draft", effectiveStartDate: line.effectiveStartDate!, ...(rental.expectedReturn ? { effectiveEndDate: rental.expectedReturn } : {}), ...(line.assignmentId ? { sourceAssignmentId: line.assignmentId } : {}), version: 1 } };
  }
}

function failure(code: Extract<AddRentalEquipmentResult, { success: false }>["code"], message: string): Extract<AddRentalEquipmentResult, { success: false }> {
  return { success: false, code, message };
}
