import { useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useToast } from "@/components/ui/toast/ToastContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useRentalWorkspaceAggregate } from "..";

export default function AssignmentQuickActions() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { completeAssignment } = useAssignment();
  const { updateEquipment } = useEquipment();
  const aggregate = useRentalWorkspaceAggregate();
  const completedAssignmentId = useRef<string | undefined>(undefined);

  const assignment = aggregate.assignment;
  const equipment = aggregate.equipment;
  const isActive = assignment?.status === "Active";

  if (!assignment) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">
        No assignment is linked to this rental.
      </div>
    );
  }

  function replaceOperator() {
    if (!isActive) {
      showToast("Only active assignments can be updated.", "error");
      return;
    }

    navigate(`/assignments/${assignment.id}/edit`);
  }

  function complete() {
    if (!isActive) {
      showToast("This assignment is already completed or unavailable.", "error");
      return;
    }

    if (!equipment) {
      showToast("Assignment equipment could not be found.", "error");
      return;
    }

    if (completedAssignmentId.current === assignment.id) {
      return;
    }

    if (!window.confirm("Complete this assignment and return the equipment?")) {
      return;
    }

    const updated = completeAssignment(
      assignment.id,
      new Date().toISOString().split("T")[0]
    );

    if (!updated) {
      showToast("Assignment could not be completed.", "error");
      return;
    }

    completedAssignmentId.current = assignment.id;
    updateEquipment({
      ...equipment,
      status: "Available",
      projectId: "",
      operatorId: "",
    });
    showToast("Assignment completed and equipment is available.", "success");
  }

  return (
    <div className="rounded-lg border bg-white p-6">
      <h3 className="mb-5 text-lg font-semibold">
        Quick Actions
      </h3>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-lg border px-4 py-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={!isActive}
          title={isActive ? "Update the assigned operator" : "Only active assignments can be updated."}
          onClick={replaceOperator}
        >
          Replace Operator
        </button>

        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={!isActive}
          title={isActive ? "Complete this assignment" : "This assignment is already completed or unavailable."}
          onClick={complete}
        >
          Complete Assignment
        </button>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        Equipment replacement is not available while an assignment is active.
      </p>
    </div>
  );
}
