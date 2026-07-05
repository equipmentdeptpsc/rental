import { useNavigate, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useRental } from "@/features/rental/context/RentalContext";

import {
  useEquipmentHistory,
  createHistoryEvent,
} from "@/features/equipment/history";

export default function AssignmentDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const { assignments, updateAssignment } = useAssignment();
  const { getEquipment, updateEquipment } = useEquipment();
  const { rentals, updateRental } = useRental();
  const { log } = useEquipmentHistory();

  const assignment = assignments.find((a) => a.id === id);

  if (!assignment) {
    return (
      <div className="p-8">
        Assignment not found.
      </div>
    );
  }

  const equipment = getEquipment(assignment.equipmentId);
  
  if (!equipment) {
    return (
      <div className="p-8">
        Equipment not found.
      </div>
    );
  }

  function returnEquipment() {
    if (!equipment || !assignment) return;
  
    updateEquipment({
      ...equipment,
      projectId: "",
      operatorId: "",
      status: "Available",
    });

    log(
      createHistoryEvent(
        equipment.id,
        "Equipment Returned",
        "Equipment returned from assignment.",
        "RETURNED"
      )
    );

    updateAssignment({
      ...assignment,
      id: assignment.id,
      status: "Completed",
      returnedDate: new Date().toISOString().split("T")[0],
    });

    log(
      createHistoryEvent(
        equipment.id,
        "Assignment Completed",
        "Assignment completed.",
        "STATUS_CHANGE"
      )
    );

    const rental = rentals.find(
      (r) =>
        r.equipmentId === equipment.id &&
        r.status === "Active"
    );

    if (rental) {
      updateRental({
        ...rental,
        actualReturn: new Date().toISOString().split("T")[0],
        status: "Returned",
      });
    }

    navigate("/assignments");
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">
        Assignment Details
      </h1>

      <div className="rounded-lg border bg-white p-6 space-y-3">
        <div>
          <strong>Equipment</strong>
          <div>{equipment.equipmentName}</div>
        </div>

        <div>
          <strong>Status</strong>
          <div>{assignment.status}</div>
        </div>

        <div>
          <strong>Assigned Date</strong>
          <div>{assignment.assignedDate}</div>
        </div>

        <div>
          <strong>Expected Return</strong>
          <div>{assignment.expectedReturn}</div>
        </div>

        <div>
          <strong>Remarks</strong>
          <div>{assignment.remarks}</div>
        </div>
      </div>

      {assignment.status === "Active" && (
        <Button onClick={returnEquipment}>
          Return Equipment
        </Button>
      )}
    </div>
  );
}