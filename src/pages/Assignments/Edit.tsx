import { useNavigate, useParams } from "react-router-dom";

import AssignmentForm, {
  type AssignmentFormData,
} from "@/features/assignment/components/AssignmentForm";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";

export default function EditAssignment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAssignment, updateAssignment } = useAssignment();
  const assignment = id ? getAssignment(id) : undefined;

  if (!assignment) {
    return <div className="p-8">Assignment not found.</div>;
  }

  const existingAssignment = assignment;

  function handleSubmit(data: AssignmentFormData) {
    const updated = updateAssignment({
      ...existingAssignment,
      ...data,
      expectedReturn: existingAssignment.expectedReturn,
    });

    if (!updated) {
      alert("Equipment or operator is already assigned to an active assignment.");
      return;
    }

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
        initialEquipmentId={existingAssignment.equipmentId}
        initialData={{
          equipmentId: existingAssignment.equipmentId,
          operatorId: existingAssignment.operatorId,
          projectId: existingAssignment.projectId,
          remarks: existingAssignment.remarks,
        }}
        lockEquipment={equipmentLocked}
        submitLabel="Save Assignment"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
