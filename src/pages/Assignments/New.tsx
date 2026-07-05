import { useNavigate } from "react-router-dom";

import AssignmentForm from "@/features/assignment/components/AssignmentForm";

import type {
  AssignmentFormData,
} from "@/features/assignment/components/AssignmentForm";

import type {
  AssignmentRecord,
} from "@/features/assignment/types";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";

import {
  useEquipmentHistory,
  createHistoryEvent,
} from "@/features/equipment/history";

export default function NewAssignment() {
  const navigate = useNavigate();

  const { addAssignment } =
    useAssignment();

  const {
    getEquipment,
    updateEquipment,
  } = useEquipment();

  const { log } =
    useEquipmentHistory();

  function handleSubmit(
    data: AssignmentFormData
  ) {
    const assignment: AssignmentRecord =
      {
        id: crypto.randomUUID(),

        equipmentId:
          data.equipmentId,

        operatorId:
          data.operatorId,

        projectId:
          data.projectId,

        assignedDate:
          new Date()
            .toISOString()
            .split("T")[0],

        expectedReturn:
          data.expectedReturn,

        remarks:
          data.remarks,

        status: "Active",
      };

    addAssignment(
      assignment
    );

    const equipment =
      getEquipment(
        data.equipmentId
      );

    if (equipment) {
      updateEquipment({
        ...equipment,
        projectId:
          data.projectId,
        operatorId:
          data.operatorId,
        status:
          "Assigned",
      });

      log(
        createHistoryEvent(
          equipment.id,
          "Assigned",
          "Equipment assigned to project.",
          "ASSIGNED"
        )
      );
    }

    navigate(
      "/assignments"
    );
  }

  return (
    <div className="p-8 space-y-6">

      <h1 className="text-3xl font-bold">
        New Assignment
      </h1>

      <AssignmentForm
        onSubmit={
          handleSubmit
        }
      />

    </div>
  );
}