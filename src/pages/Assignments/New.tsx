import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import AssignmentForm from "@/features/assignment/components/AssignmentForm";

import type {
  AssignmentFormData,
} from "@/features/assignment/components/AssignmentForm";

import type {
  AssignmentRecord,
} from "@/features/assignment/types";

import {
  useAssignment,
} from "@/features/assignment/context/AssignmentContext";

import {
  useEquipment,
} from "@/features/equipment/context/EquipmentContext";

import {
  useEquipmentHistory,
} from "@/features/equipment/history";

import {
  useAudit,
} from "@/features/equipment/audit/AuditContext";

import {
  assignEquipment,
  assignmentHistory,
  auditAssignment,
} from "@/features/equipment/application";

import {
  createAssignmentWorkflow,
} from "@/features/assignment/application";

export default function NewAssignment() {
  const navigate =
    useNavigate();

  const [searchParams] =
    useSearchParams();

  const equipmentId =
    searchParams.get(
      "equipment"
    ) ?? "";

  const { addAssignment, isEquipmentAssigned } =
    useAssignment();

  const {
    getEquipment,
    updateEquipment,
  } = useEquipment();

  const { log } =
    useEquipmentHistory();

  const { logAction } =
    useAudit();

    async function handleSubmit(
      data: AssignmentFormData
    ) {
      const workflow =
      await createAssignmentWorkflow(
        data,
        {
          getEquipment,
          updateEquipment,
          isEquipmentAssigned,
        }
      );
      if (!workflow.success) {
        throw new Error(workflow.message ?? "Assignment failed.");
      }

      const equipment =
  getEquipment(
    data.equipmentId
  );
  
    const assignment: AssignmentRecord =
      {
        id: crypto.randomUUID(),

        equipmentId:
          data.equipmentId,

        operatorId:
          data.operatorId,

        projectId:
          data.projectId,

        activityCodeId:
          data.activityCodeId || undefined,

        assignedDate:
          data.assignmentDate!,

        startDate: data.startDate!,

        expectedReturn:
          data.endDate!,

        remarks:
          data.remarks,

        status:
          "Active",
      };

    let success = false;
    try { success = addAssignment(assignment); } catch (error) {
      throw error instanceof Error ? error : new Error("Assignment failed.");
    }

    if (!success) {
      throw new Error("Equipment or operator is already booked for the selected dates.");
    }

    if (equipment) {
      const {
        equipment:
          updatedEquipment,
      } = assignEquipment(
        equipment,
        data.projectId,
        data.operatorId
      );

      updateEquipment(
        updatedEquipment
      );

      logAction(
        auditAssignment(
          equipment,
          updatedEquipment
        )
      );

      log(
        assignmentHistory(
          equipment.id
        )
      );
    }

    navigate(
      "/assignments"
    );
  }

  return (
    <div className="space-y-6 p-8">

      <div>

        <h1 className="text-3xl font-bold">
          New Assignment
        </h1>

        <p className="mt-2 text-gray-500">
          Assign equipment to a project and operator.
        </p>

      </div>

      <AssignmentForm
        onSubmit={
          handleSubmit
        }
        initialEquipmentId={
          equipmentId ||
          undefined
        }
      />

    </div>
  );
}
