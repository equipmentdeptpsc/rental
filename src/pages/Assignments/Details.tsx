import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import Button from "@/components/ui/Button";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";

import {
  useEquipmentHistory,
  createHistoryEvent,
} from "@/features/equipment/history";

import { useAudit } from "@/features/equipment/audit/AuditContext";
import { displayAssignmentExpectedReturn } from "@/features/assignment/utils/assignmentDisplay";

export default function AssignmentDetails() {
  const { id } = useParams();

  const navigate = useNavigate();

  const {
    assignments,
    completeAssignment,
  } = useAssignment();

  const {
    getEquipment,
    updateEquipment,
  } = useEquipment();

  const { projects } =
    useProject();

  const { operators } =
    useOperator();

  const { log } =
    useEquipmentHistory();

  const { logAction } =
    useAudit();

  const assignment =
    assignments.find(
      (a) => a.id === id
    );

  if (!assignment) {
    return (
      <div className="p-8">
        Assignment not found.
      </div>
    );
  }

  const equipment =
    getEquipment(
      assignment.equipmentId
    );

  const operator =
    operators.find(
      (o) =>
        o.id ===
        assignment.operatorId
    );

  const project =
    projects.find(
      (p) =>
        p.id ===
        assignment.projectId
    );

  function handleCompleteAssignment() {
    if (!assignment || !equipment) {
      return;
    }

    const confirmed =
      window.confirm(
        "Complete this assignment and return the equipment?"
      );

    if (!confirmed) return;

    const updated =
      completeAssignment(
        assignment.id,
        new Date()
          .toISOString()
          .split("T")[0]
      );

    if (!updated) return;

    updateEquipment({
      ...equipment,
      status: "Available",
      projectId: "",
      operatorId: "",
    });

    log(
      createHistoryEvent(
        equipment.id,
        "Assignment Completed",
        "Equipment returned and marked Available.",
        "RETURNED"
      )
    );

    logAction({
      action: "UPDATE",
      equipmentId:
        equipment.id,
      before: equipment,
      after: {
        ...equipment,
        status: "Available",
        projectId: "",
        operatorId: "",
      },
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
          Operational hub for this assignment.
        </p>

      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">

        <div className="grid gap-6 md:grid-cols-2">

          <Info
            label="Equipment"
            value={
              equipment
                ? `${equipment.assetNo} - ${equipment.equipmentName}`
                : "-"
            }
          />

          <Info
            label="Operator"
            value={
              operator?.name ??
              "-"
            }
          />

          <Info
            label="Project"
            value={
              project?.projectName ??
              "-"
            }
          />

          <Info
            label="Status"
            value={
              assignment.status
            }
          />

          <Info
            label="Assigned Date"
            value={
              assignment.assignedDate
            }
          />

          <Info
            label="Expected Return"
            value={
              displayAssignmentExpectedReturn(assignment.expectedReturn)
            }
          />

        </div>

        <div className="mt-6">

          <div className="text-sm font-medium text-slate-500">
            Remarks
          </div>

          <div className="mt-1 rounded-lg bg-slate-50 p-4">
            {assignment.remarks ||
              "-"}
          </div>

        </div>

      </div>

      <div className="flex flex-wrap gap-3">

        <Link
          to={`/rentals/new?assignment=${assignment.id}`}
        >
          <Button>
            Start Rental
          </Button>
        </Link>

        {assignment.status ===
          "Active" && (
          <Button
            onClick={
              handleCompleteAssignment
            }
          >
            Complete Assignment
          </Button>
        )}

        <Link to={`/assignments/${assignment.id}/edit`}>
          <Button variant="secondary">
            Edit Assignment
          </Button>
        </Link>

        <Button
          variant="secondary"
          disabled
        >
          Cancel Assignment
        </Button>

      </div>

    </div>
  );
}

interface InfoProps {
  label: string;
  value: string;
}

function Info({
  label,
  value,
}: InfoProps) {
  return (
    <div>

      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="mt-1 font-medium">
        {value}
      </div>

    </div>
  );
}
