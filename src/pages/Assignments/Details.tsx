import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useState } from "react";

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
import { displayAssignmentExpectedReturn, getAssignmentNumber } from "@/features/assignment/utils/assignmentDisplay";
import { useActivityCodes } from "@/features/masters/activity-code";
import AssignmentActivityCodeDisplay from "@/features/assignment/components/AssignmentActivityCodeDisplay";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { canUseCanonicalRemoteRentalCreation, canUseLegacyRentalMutations, REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/rental/services/rentalRuntimeCapability";
import { useAuth } from "@/features/auth/AuthContext";
import { useCanonicalAssignmentData } from "@/features/assignment/hooks/useCanonicalAssignmentData";
import { requestCanonicalAssignmentRefresh } from "@/features/assignment/remote/canonicalAssignmentRefresh";
import { canStartRentalFromCanonicalAssignment, getAssignmentRuntimeCapability, REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/assignment/services/assignmentRuntimeCapability";

export default function AssignmentDetails() {
  const { configuration } = useApplicationDependenciesCompatibility();
  const location = useLocation();
  const state = location.state && typeof location.state === "object" && "rentalWorkspace" in location.state ? location.state as { rentalWorkspace?: { returnTo?: unknown; rentalId?: unknown } } : undefined;
  const returnTo = typeof state?.rentalWorkspace?.returnTo === "string" && typeof state.rentalWorkspace.rentalId === "string" && state.rentalWorkspace.returnTo.startsWith(`/rentals/${state.rentalWorkspace.rentalId}/workspace`) ? state.rentalWorkspace.returnTo : undefined;
  return <>{returnTo && <div className="px-8 pt-6"><Link className="text-blue-700 underline" to={returnTo} state={location.state}>← Return to Rental Workspace</Link></div>}{getAssignmentRuntimeCapability(configuration).canonicalReads ? <RemoteAssignmentDetails /> : <LocalAssignmentDetails />}</>;
}

function RemoteAssignmentDetails() {
  const { id } = useParams();
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const state = useCanonicalAssignmentData();
  const [cancelMessage, setCancelMessage] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editMessage, setEditMessage] = useState<string>();
  const [revision, setRevision] = useState({ operatorId: "", projectId: "", assignedDate: "", expectedReturn: "", remarks: "" });
  if (state.status === "loading") return <div className="p-8 text-slate-500">Loading canonical Assignment…</div>;
  if (state.status === "error") return <div className="p-8" role="alert">{state.message}<button className="ml-3 underline" onClick={state.retry}>Retry</button></div>;
  const assignment = state.data.assignments.find((record) => record.id === id && !record.deleted);
  if (!assignment) return <div className="p-8">Assignment not found.</div>;
  const currentAssignment = assignment;
  const equipment = state.data.equipment.find((record) => record.id === assignment.equipmentId);
  const operator = state.data.operators.find((record) => record.id === assignment.operatorId);
  const project = state.data.projects.find((record) => record.id === assignment.projectId);
  const customer = state.data.customers.find((record) => record.id === (assignment.customerId ?? project?.customerId));
  const rentalCreationAvailable = canUseCanonicalRemoteRentalCreation(configuration) && Boolean(commandRepositories.canonicalRental);
  const showStartRental = canStartRentalFromCanonicalAssignment({ assignment, rentalCreationAvailable, hasRentalManagePermission: hasPermission("rental.create") });
  const capability = getAssignmentRuntimeCapability(configuration, Boolean(commandRepositories.canonicalAssignment));
  const canCancel = currentAssignment.status === "Active" && capability.canonicalCancellation && hasPermission("assignment.close");
  const canRevise = currentAssignment.status === "Active" && hasPermission("assignment.update") && Boolean(commandRepositories.canonicalAssignment?.reviseAssignment);
  const beginRevision = () => {
    setRevision({ operatorId: currentAssignment.operatorId, projectId: currentAssignment.projectId, assignedDate: currentAssignment.assignedDate.slice(0, 10), expectedReturn: currentAssignment.expectedReturn?.slice(0, 10) ?? "", remarks: currentAssignment.remarks });
    setEditMessage(undefined); setEditing(true);
  };
  async function handleRevise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRevise || !commandRepositories.canonicalAssignment || typeof currentAssignment.rowVersion !== "number") return;
    if (!revision.operatorId || !revision.projectId || !revision.assignedDate || (revision.expectedReturn && revision.expectedReturn < revision.assignedDate)) {
      setEditMessage("Select an Operator and Project, and enter a valid date interval."); return;
    }
    setEditBusy(true); setEditMessage(undefined);
    const commandId = crypto.randomUUID();
    const result = await commandRepositories.canonicalAssignment.reviseAssignment({ commandId, idempotencyKey: commandId, assignmentId: currentAssignment.id, expectedVersion: currentAssignment.rowVersion, ...revision });
    setEditBusy(false);
    if (!result.success) { setEditMessage(result.message); return; }
    setEditing(false); requestCanonicalAssignmentRefresh();
  }
  async function handleCancel() {
    if (!canCancel || !commandRepositories.canonicalAssignment || typeof currentAssignment.rowVersion !== "number") return;
    if (!window.confirm("Cancel this assignment booking?")) return;
    setCancelling(true);
    setCancelMessage(undefined);
    const result = await commandRepositories.canonicalAssignment.cancelAssignment({
      commandId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      assignmentId: currentAssignment.id,
      expectedVersion: currentAssignment.rowVersion,
      clientCreatedAt: new Date().toISOString(),
      deviceId: "erms-web",
    });
    setCancelling(false);
    if (!result.success) {
      setCancelMessage(result.message);
      return;
    }
    requestCanonicalAssignmentRefresh();
  }
  return <div className="space-y-6 p-4 sm:p-8"><div><h1 className="text-3xl font-bold">Assignment {getAssignmentNumber(assignment.id, state.data.assignments)}</h1><p className="text-slate-500">Canonical remote Assignment details.</p></div><div className="rounded-xl border bg-white p-6 shadow-sm"><div className="grid gap-6 md:grid-cols-2"><Info label="Equipment" value={equipment ? `${equipment.assetNo} - ${equipment.equipmentName}` : "Unknown canonical Equipment"} /><Info label="Operator" value={operator?.name || "Unknown canonical Operator"} /><Info label="Customer" value={customer?.name || "No readable Customer"} /><Info label="Project" value={project?.name || "Unknown canonical Project"} /><Info label="Activity Code ID" value={assignment.activityCodeId || "-"} /><Info label="Status" value={assignment.status} /><Info label="Assigned Date" value={assignment.assignedDate} /><Info label="End Date / Expected Return" value={displayAssignmentExpectedReturn(assignment.expectedReturn)} /></div><div className="mt-6"><div className="text-sm font-medium text-slate-500">Remarks</div><div className="mt-1 rounded-lg bg-slate-50 p-4">{assignment.remarks || "-"}</div></div></div>
    <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">Revisions are permitted only while this Assignment is active and has no linked Rental or DEUR. Completed, cancelled, or linked activity cannot be changed retroactively.</p>
    {!canCancel && !canRevise && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">{REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE}</p>}
    {cancelMessage && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950" role="alert">{cancelMessage}</p>}
    <div className="flex flex-wrap gap-3">{showStartRental && <Link to={`/rentals/new?assignment=${encodeURIComponent(assignment.id)}`}><Button>Start Rental</Button></Link>}{canRevise && <Button variant="secondary" onClick={beginRevision}>Edit / Revise</Button>}{canCancel && <Button variant="secondary" disabled={cancelling} onClick={handleCancel}>{cancelling ? "Cancelling…" : "Cancel Assignment"}</Button>}</div>
    {editing && <form className="space-y-4 rounded-xl border bg-white p-5" onSubmit={(event) => void handleRevise(event)} aria-label="Revise Assignment"><h2 className="text-xl font-semibold">Revise Assignment</h2>
      <label className="block text-sm font-medium">Operator<select className="app-control mt-1 w-full" value={revision.operatorId} onChange={(event) => setRevision((value) => ({ ...value, operatorId: event.target.value }))}>{state.data.operators.filter((item) => item.id === assignment.operatorId || item.status === "Active" && !item.deleted && !state.data.assignments.some((other) => other.id !== assignment.id && other.status === "Active" && other.operatorId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="block text-sm font-medium">Project<select className="app-control mt-1 w-full" value={revision.projectId} onChange={(event) => setRevision((value) => ({ ...value, projectId: event.target.value }))}>{state.data.projects.filter((item) => item.id === assignment.projectId || item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Assigned / Start Date<input required type="date" className="app-control mt-1 w-full" value={revision.assignedDate} onChange={(event) => setRevision((value) => ({ ...value, assignedDate: event.target.value }))} /></label><label className="block text-sm font-medium">Expected Return<input type="date" min={revision.assignedDate} className="app-control mt-1 w-full" value={revision.expectedReturn} onChange={(event) => setRevision((value) => ({ ...value, expectedReturn: event.target.value }))} /></label></div>
      <label className="block text-sm font-medium">Remarks<textarea maxLength={2000} className="app-control mt-1 w-full" value={revision.remarks} onChange={(event) => setRevision((value) => ({ ...value, remarks: event.target.value }))} /></label>
      {editMessage && <p role="alert" className="text-sm text-red-700">{editMessage}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel Edit</Button><Button type="submit" disabled={editBusy}>{editBusy ? "Saving…" : "Save Revision"}</Button></div>
    </form>}
  </div>;
}

function LocalAssignmentDetails() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const rentalCreationAvailable = canUseLegacyRentalMutations(configuration)
    || (canUseCanonicalRemoteRentalCreation(configuration) && Boolean(commandRepositories.canonicalRental) && hasPermission("rental.create"));
  const { id } = useParams();

  const navigate = useNavigate();

  const {
    assignments,
    completeAssignment,
    cancelAssignment,
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

  const { records: activityCodes } = useActivityCodes();

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

  const currentAssignment = assignment;

  function handleCancelAssignment() {
    if (!window.confirm("Cancel this assignment booking?")) return;
    if (!cancelAssignment(currentAssignment.id)) return;
    if (equipment && !assignments.some((item) => item.id !== currentAssignment.id && item.status === "Active" && item.equipmentId === currentAssignment.equipmentId)) {
      updateEquipment({ ...equipment, status: "Available", projectId: "", operatorId: "" });
    }
    log(createHistoryEvent(currentAssignment.equipmentId, "Assignment Cancelled", `Booking ${currentAssignment.startDate || currentAssignment.assignedDate} to ${currentAssignment.expectedReturn} cancelled.`, "UPDATED"));
    navigate("/assignments");
  }

  return (
    <div className="space-y-6 p-8">

      <div>

        <h1 className="text-3xl font-bold">
          Assignment {getAssignmentNumber(assignment.id, assignments)}
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

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Activity Code
            </div>
            <AssignmentActivityCodeDisplay
              activityCodeId={assignment.activityCodeId}
              records={activityCodes}
            />
          </div>

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

          <Info label="Start Date" value={assignment.startDate || assignment.assignedDate} />

          <Info
            label="End Date / Expected Return"
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

        {rentalCreationAvailable ? <Link
          to={`/rentals/new?assignment=${encodeURIComponent(assignment.id)}`}
        >
          <Button>
            Start Rental
          </Button>
        </Link> : <span className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" title={REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE}>Rental creation unavailable</span>}

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
          disabled={assignment.status !== "Active"}
          onClick={handleCancelAssignment}
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
