import { useNavigate, useParams } from "react-router-dom";

import AssignmentForm, {
  type AssignmentFormData,
} from "@/features/assignment/components/AssignmentForm";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { createHistoryEvent, useEquipmentHistory } from "@/features/equipment/history";

export default function EditAssignment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAssignment, updateAssignment } = useAssignment();
  const { log } = useEquipmentHistory();
  const assignment = id ? getAssignment(id) : undefined;

  if (!assignment) {
    return <div className="p-8">Assignment not found.</div>;
  }

  const existingAssignment = assignment;

  function handleSubmit(data: AssignmentFormData) {
    let updated = false;
    try {
      updated = updateAssignment({
        ...existingAssignment,
        ...data,
        assignedDate: data.assignmentDate!,
        startDate: data.startDate!,
        expectedReturn: data.endDate!,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Assignment update failed.");
      return;
    }

    if (!updated) {
      alert("Equipment or operator is already assigned to an active assignment.");
      return;
    }

    log(createHistoryEvent(existingAssignment.equipmentId, "Assignment Booking Updated", `Booking dates updated to ${data.startDate} through ${data.endDate}.`, "UPDATED"));

    navigate(`/assignments/${existingAssignment.id}`);
  }

  const equipmentLocked = existingAssignment.status === "Active";

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Edit Assignment</h1>
        <p className="mt-2 text-gray-500">
          Update the operator, project, and remarks for this assignment.
        </p>
      </div>

      {equipmentLocked && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Equipment cannot be changed while this assignment is active.
        </p>
      )}

      <AssignmentForm
        currentAssignmentId={existingAssignment.id}
        initialEquipmentId={existingAssignment.equipmentId}
        initialData={{
          equipmentId: existingAssignment.equipmentId,
          assignmentDate: existingAssignment.assignedDate,
          startDate: existingAssignment.startDate || existingAssignment.assignedDate,
          endDate: existingAssignment.expectedReturn || existingAssignment.startDate || existingAssignment.assignedDate,
          operatorId: existingAssignment.operatorId,
          projectId: existingAssignment.projectId,
          activityCodeId: existingAssignment.activityCodeId,
          remarks: existingAssignment.remarks,
        }}
        lockEquipment={equipmentLocked}
        submitLabel="Save Assignment"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
