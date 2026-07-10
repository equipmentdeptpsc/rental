import type {
    EquipmentRecord,
  } from "@/features/equipment/types";

  import {
    assignEquipment,
  } from "@/features/equipment/application";
  
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

if (!equipment) {
    return {
      success: false,
      message:
        "Equipment not found.",
    };
  }

const {
    equipment: updatedEquipment,
  } = assignEquipment(
    equipment,
    _data.projectId,
    _data.operatorId
  );
  
  _deps.updateEquipment(
    updatedEquipment
  );
  
  return {
    success: true,
  };
  }