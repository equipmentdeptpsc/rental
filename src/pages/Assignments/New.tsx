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
  createHistoryEvent,
} from "@/features/equipment/history";

export default function NewAssignment() {
  const navigate =
    useNavigate();

  const [searchParams] =
    useSearchParams();

  const equipmentId =
    searchParams.get(
      "equipment"
    ) ?? "";

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

        status:
          "Active",
      };

    const success =
      addAssignment(
        assignment
      );

    if (!success) {
      alert(
        "Equipment or operator is already assigned."
      );

      return;
    }

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
        lockEquipment={
          Boolean(
            equipmentId
          )
        }
      />

    </div>
  );
}