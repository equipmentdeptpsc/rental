import type {
    EquipmentRecord,
  } from "@/features/equipment/types";

  import {
    validateEquipmentAssignment,
  } from "../../utils/assignmentValidation";

import type {
    AssignmentFormData,
  } from "../../components/AssignmentForm";
  
  export interface AssignmentWorkflowDependencies {
    getEquipment(
      id: string
    ): EquipmentRecord | undefined;
  
    updateEquipment(
      equipment: EquipmentRecord
    ): void;

    isEquipmentAssigned?(
      equipmentId: string
    ): boolean;
  }
  
  export interface AssignmentWorkflowResult {
    success: boolean;
  
    message?: string;
  }
  
  export async function createAssignmentWorkflow(
    _data: AssignmentFormData,
    _deps: AssignmentWorkflowDependencies
  ): Promise<AssignmentWorkflowResult> {
    const equipment =
  _deps.getEquipment(
    _data.equipmentId
  );

const validation =
  validateEquipmentAssignment(
    equipment
  );

if (!validation.valid) {
  return {
    success: false,
    message:
      validation.message,
  };
}

if (!_data.startDate && _deps.isEquipmentAssigned?.(_data.equipmentId)) {
  return { success: false, message: "This equipment is already assigned." };
}

if (!equipment) {
    return {
      success: false,
      message:
        "Equipment not found.",
    };
  }

  return {
    success: true,
  };
  }
