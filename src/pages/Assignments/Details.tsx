import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useEffect, useRef, useState } from "react";

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
import AssignmentActivityCodeRepair from "@/features/assignment/components/AssignmentActivityCodeRepair";
import { useAssignmentRentalPreparation } from "@/features/assignment/hooks/useAssignmentRentalPreparation";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";

export default function AssignmentDetails() {
  const { configuration } = useApplicationDependenciesCompatibility();
  return getAssignmentRuntimeCapability(configuration).canonicalReads ? <RemoteAssignmentDetails /> : <LocalAssignmentDetails />;
}

function RemoteAssignmentDetails() {
  const { id } = useParams();
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const state = useCanonicalAssignmentData();
  const rentalState = useAssignmentRentalPreparation(id);
  const [cancelMessage, setCancelMessage] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const [confirmDraftCancellation, setConfirmDraftCancellation] = useState(false);
  if (state.status === "loading") return <div className="p-8 text-slate-500">Loading Assignment…</div>;
  if (state.status === "error") return <div className="p-8" role="alert">{state.message}<button className="ml-3 underline" onClick={state.retry}>Retry</button></div>;
  const assignment = state.data.assignments.find((record) => record.id === id && !record.deleted);
  if (!assignment) return <div className="p-8">Assignment not found.</div>;
  const currentAssignment = assignment;
  const equipment = state.data.equipment.find((record) => record.id === assignment.equipmentId);
  const operator = state.data.operators.find((record) => record.id === assignment.operatorId);
  const project = state.data.projects.find((record) => record.id === assignment.projectId);
  const rentalCreationAvailable = canUseCanonicalRemoteRentalCreation(configuration) && Boolean(commandRepositories.canonicalRental);
  const showStartRental = rentalState.kind === "none" && canStartRentalFromCanonicalAssignment({ assignment, rentalCreationAvailable, hasRentalManagePermission: hasPermission("rental.create") });
  const capability = getAssignmentRuntimeCapability(configuration, Boolean(commandRepositories.canonicalAssignment));
  const canCancel = currentAssignment.status === "Active" && capability.canonicalCancellation && hasPermission("assignment.close")
    && (rentalState.kind === "none" || (rentalState.kind === "draft" && hasPermission("rental.update")));
  async function handleCancel() {
    if (!canCancel || !commandRepositories.canonicalAssignment || typeof currentAssignment.rowVersion !== "number") return;
    if (rentalState.kind === "none" && !window.confirm("Cancel this assignment booking?")) return;
    setConfirmDraftCancellation(false);
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
    requestCanonicalRentalRefresh();
  }
  return <div className="space-y-6 p-8">
    <div><h1 className="text-3xl font-bold">Assignment {getAssignmentNumber(assignment.id, state.data.assignments)}</h1><p className="text-slate-500">remote Assignment details.</p></div>
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="grid gap-6 md:grid-cols-2">
        <Info label="Equipment" value={equipment ? equipment.assetNo + " - " + equipment.equipmentName : "Unknown Equipment"} />
        <Info label="Operator" value={operator?.name || "Unknown Operator"} />
        <Info label="Project" value={project?.name || "Unknown Project"} />
        <AssignmentActivityCodeRepair assignment={assignment} rentalState={rentalState} />
        <Info label="Status" value={assignment.status} />
        <Info label="Assigned Date" value={assignment.assignedDate} />
        <Info label="End Date / Expected Return" value={displayAssignmentExpectedReturn(assignment.expectedReturn)} />
      </div>
      <div className="mt-6"><div className="text-sm font-medium text-slate-500">Remarks</div><div className="mt-1 rounded-lg bg-slate-50 p-4">{assignment.remarks || "-"}</div></div>
    </div>
    {rentalState.kind === "committed" && <p role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">This assignment is already part of an approved or active rental and can no longer be cancelled from the preparation workflow.</p>}
    {rentalState.kind === "error" && <p role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">Rental status could not be verified. Refresh before changing this Assignment.</p>}
    {!capability.canonicalCancellation && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">{REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE}</p>}
    {cancelMessage && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950" role="alert">{cancelMessage}</p>}
    <div className="flex flex-wrap gap-3">
      {showStartRental && <Link to={"/rentals/new?assignment=" + encodeURIComponent(assignment.id)}><Button>Start Rental</Button></Link>}
      {rentalState.kind === "draft" && rentalState.count === 1 && hasPermission("rental.commercialTerms.read") && <Link to={"/rentals/" + rentalState.rental.id + "/commercial-terms"}><Button>Continue Rental Preparation</Button></Link>}
      {canCancel && <Button variant="secondary" disabled={cancelling} onClick={() => rentalState.kind === "draft" ? setConfirmDraftCancellation(true) : void handleCancel()}>{cancelling ? "Cancelling…" : "Cancel Assignment"}</Button>}
    </div>
    {confirmDraftCancellation && <DraftRentalCancellationDialog busy={cancelling} onKeep={() => setConfirmDraftCancellation(false)} onCancel={() => void handleCancel()} />}
  </div>;
}

function DraftRentalCancellationDialog({ busy, onKeep, onCancel }: { busy: boolean; onKeep(): void; onCancel(): void }) {
  const keepButton = useRef<HTMLButtonElement>(null);
  const keep = useRef(onKeep);
  const isBusy = useRef(busy);
  keep.current = onKeep;
  isBusy.current = busy;
  useEffect(() => {
    const priorFocus = document.activeElement as HTMLElement | null;
    keepButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !isBusy.current) keep.current(); };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); priorFocus?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation">
    <div role="alertdialog" aria-modal="true" aria-labelledby="assignment-cancel-title" aria-describedby="assignment-cancel-description" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <h2 id="assignment-cancel-title" className="text-lg font-semibold">Cancel this assignment?</h2>
      <p id="assignment-cancel-description" className="mt-3 text-sm text-slate-700">This assignment has a Draft Rental that has not yet been approved. Cancelling the assignment will also cancel the associated Draft Rental preparation.</p>
      <p className="mt-2 text-sm font-medium text-slate-700">This cannot be undone.</p>
      <div className="mt-5 flex justify-end gap-2"><Button ref={keepButton} size="sm" variant="secondary" disabled={busy} onClick={onKeep}>Keep Assignment</Button><Button size="sm" variant="danger" disabled={busy} onClick={onCancel}>{busy ? "Cancelling…" : "Cancel Assignment"}</Button></div>
    </div>
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
