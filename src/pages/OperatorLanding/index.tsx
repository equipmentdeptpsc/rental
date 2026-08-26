import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PersistenceMode } from "@/app/composition/ApplicationDependencies";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { resolveAuthenticatedOperator } from "@/features/rental/deur/operator/resolveAuthenticatedOperator";
import { resolveOperatorLandingState } from "@/features/rental/deur/operator/resolveOperatorLandingState";
import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";
import { useOperatorLandingData } from "@/features/rental/deur/operator/useOperatorLandingData";

const labels = {
  START_SHIFT: "Start Shift",
  CONTINUE_SHIFT: "Continue Shift",
  REVIEW_SUBMITTED_DEUR: "Review Submitted DEUR",
} as const;

export default function OperatorLandingPage() {
  const { user, hasPermission } = useAuth();
  const dependencies = useApplicationDependenciesCompatibility();
  const remote = dependencies.configuration.persistenceMode === PersistenceMode.Remote;
  const localAssignments = useAssignment().assignments;
  const localEquipment = useEquipment().equipment;
  const localOperators = useOperator().operators;
  const localProjects = useProject().projects;
  const localRental = useRental();
  const canonical = useOperatorLandingData(remote);
  const assignments = remote ? canonical.assignments : localAssignments;
  const equipment = remote ? canonical.equipment : localEquipment;
  const operators = remote ? canonical.operators : localOperators;
  const projects = remote ? canonical.projects : localProjects;
  const rentals = remote ? canonical.rentals : localRental.rentals;
  const rentalEquipmentLines = remote ? canonical.rentalEquipmentLines : localRental.rentalEquipmentLines;
  const deurs = remote ? canonical.deurs : deurRepository.getAll();
  const [version, setVersion] = useState(0);

  useEffect(
    () => subscribeDeurChanges(() => { setVersion((current) => current + 1); if (remote) void canonical.refresh(); }),
    [canonical.refresh, remote],
  );

  const identity = resolveAuthenticatedOperator(user ?? undefined, operators);
  const state = useMemo(
    () =>
      identity.status === "RESOLVED"
        ? resolveOperatorLandingState({
            operatorId: identity.operator.id,
            assignments,
            rentals,
            lines: rentalEquipmentLines,
            deurs,
            evaluationTimestamp: new Date().toISOString(),
          })
        : undefined,
    [assignments, deurs, identity, rentalEquipmentLines, rentals, version],
  );

  if (!user || user.status !== "active" || !hasPermission("deur.read")) {
    return <main className="p-5">Operator interface access is not authorized.</main>;
  }
  if (remote && canonical.loading) return <main className="p-5">Loading your equipment shift...</main>;
  if (remote && canonical.error) return <main className="p-5">Canonical Operator work data could not be loaded. Refresh and try again.</main>;
  if (identity.status !== "RESOLVED") {
    return <main className="p-5"><h1 className="text-2xl font-bold">My Equipment Shift</h1><p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">{identity.message}</p></main>;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <header className="rounded-2xl bg-slate-950 p-5 text-white">
        <p className="text-sm text-slate-300">{new Date().toLocaleDateString()}</p>
        <h1 className="mt-1 text-2xl font-bold">Hello, {identity.operator.name}</h1>
        <p className="mt-1 text-sm text-slate-300">My Equipment Shift</p>
      </header>

      {state?.status === "NO_ACTIVE_ASSIGNMENT" && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-5 font-medium">
          No active equipment assignment is available.
        </p>
      )}

      {state?.items.map((item) => {
        const machine = equipment.find((record) => record.id === item.line.equipmentId);
        const project = projects.find((record) => record.id === item.assignment.projectId);
        return (
          <article className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm" key={item.line.id}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active equipment</p>
              <h2 className="text-xl font-bold">{machine?.assetNo ?? item.line.equipmentId}</h2>
              <p>{machine?.equipmentName ?? "Equipment record unavailable"}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-500">Project</dt><dd>{project?.projectName ?? "Project unavailable"}</dd></div>
              <div><dt className="text-slate-500">Customer</dt><dd>{item.rental.customer}</dd></div>
              <div><dt className="text-slate-500">Rental</dt><dd>{item.rental.rentalNumber ?? item.rental.id}</dd></div>
              <div><dt className="text-slate-500">Assignment</dt><dd>{item.assignment.status}</dd></div>
              <div><dt className="text-slate-500">Shift</dt><dd>{item.deur?.status ?? "Not started"}</dd></div>
              <div><dt className="text-slate-500">DEUR</dt><dd>{item.deur?.deurNumber ?? "Not created"}</dd></div>
            </dl>
            <Link
              className="block min-h-12 rounded-xl bg-blue-700 px-5 py-3 text-center font-bold text-white"
              to={`/rentals/${item.rental.id}/operator-deur?lineId=${encodeURIComponent(item.line.id)}`}
            >
              {labels[item.action]}
            </Link>
          </article>
        );
      })}

      <p className="text-xs text-slate-500">
        Records persist on this device and synchronize across tabs in this browser.
        Cross-device synchronization requires a future server-connected deployment.
      </p>
    </main>
  );
}
