import { useNavigate, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";

import type { EquipmentRecord } from "@/features/equipment/types";

export default function AssignmentDetails() {
  const { id } = useParams();

  const navigate = useNavigate();

  const {
    assignments,
    updateAssignment,
  } = useAssignment();

  const {
    equipment,
    updateEquipment,
  } = useEquipment();

  const { logAction } = useAudit();

  const assignment = assignments.find(
    (a) => a.id === id
  );

  if (!assignment) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">
          Assignment Not Found
        </h1>

        <Button
          className="mt-4"
          onClick={() =>
            navigate("/assignments")
          }
        >
          Back
        </Button>
      </div>
    );
  }

  const selectedEquipment =
    equipment.find(
      (e) =>
        e.id ===
        assignment.equipmentId
    );

  function completeAssignment() {
    if (!selectedEquipment) {
      return;
    }

    const currentAssignment = assignment;

if (!currentAssignment) {
  return;
}
    const updatedEquipment: EquipmentRecord =
      {
        ...selectedEquipment,

        projectId: "",

        operatorId: "",

        status: "Available",
      };

    updateEquipment(
      updatedEquipment
    );

    updateAssignment({
      ...currentAssignment,

      status: "Completed",

      returnedDate:
        new Date()
          .toISOString()
          .split("T")[0],
    });

    logAction({
      action: "UPDATE",

      equipmentId:
        selectedEquipment.id,

      before:
        selectedEquipment,

      after: updatedEquipment,
    });

    navigate("/assignments");
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">
          Assignment Details
        </h1>

        <p className="text-slate-500">
          Assignment ID:{" "}
          {assignment.id}
        </p>
      </div>

      <div className="rounded-lg border bg-white p-6 space-y-4">
        <div>
          <strong>
            Equipment ID:
          </strong>{" "}
          {assignment.equipmentId}
        </div>

        <div>
          <strong>
            Operator ID:
          </strong>{" "}
          {assignment.operatorId}
        </div>

        <div>
          <strong>
            Project ID:
          </strong>{" "}
          {assignment.projectId}
        </div>

        <div>
          <strong>
            Assigned Date:
          </strong>{" "}
          {assignment.assignedDate}
        </div>

        <div>
          <strong>
            Expected Return:
          </strong>{" "}
          {assignment.expectedReturn}
        </div>

        <div>
          <strong>Status:</strong>{" "}
          {assignment.status}
        </div>
      </div>

      <div className="flex gap-3">
        {assignment.status ===
          "Active" && (
          <Button
            onClick={
              completeAssignment
            }
          >
            Complete Assignment
          </Button>
        )}

        <Button
          variant="secondary"
          onClick={() =>
            navigate(
              "/assignments"
            )
          }
        >
          Back
        </Button>
      </div>
    </div>
  );
}