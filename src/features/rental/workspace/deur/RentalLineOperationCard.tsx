import { memo, useEffect, useMemo, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalLineOperationState } from "./buildRentalLineOperations";
import { RunningTimerEngine, type OperationalLineState } from "@/features/rental/realtime";
import { buildOperatorDeurLineUrl } from "@/features/rental/deur/operator/resolveOperatorDeurRouteLine";

function RentalLineOperationCardComponent({ rentalId, state, machine, operator }: {
  rentalId: string;
  state: RentalLineOperationState;
  machine?: EquipmentRecord;
  operator?: Operator;
}) {
  const { synchronization } = useApplicationDependenciesCompatibility();
  const [live, setLive] = useState<OperationalLineState>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!synchronization.tenantId) return;
    return synchronization.workspace.subscribeLine(state.line.id, setLive);
  }, [synchronization, rentalId, state.line.id]);
  useEffect(() => {
    if (live?.phase !== "running") return;
    const handle = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(handle);
  }, [live?.phase, live?.activeSince]);
  const timer = useMemo(
    () => live ? new RunningTimerEngine().project(live, now) : undefined,
    [live, now],
  );
  const { line, deur, idleMinutes, breakdownMinutes, billingEligible } = state;
  const currentActivity = live?.activeActivity ?? state.currentActivity;
  const operationMinutes = timer ? timer.elapsedOperationMs / 60_000 : state.projectedOperationMinutes;
  return <article className="rounded-xl border bg-white p-4 shadow-sm" data-rental-line-id={line.id}>
    <div className="flex justify-between gap-3"><div><h3 className="font-semibold">{machine ? `${machine.equipmentName} (${machine.assetNo})` : line.equipmentId}</h3><p className="text-xs text-slate-500">Line {line.id}</p></div><span className="text-sm font-medium">{line.status}</span></div>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <div><dt className="text-slate-500">Operator</dt><dd>{operator?.name ?? live?.operatorId ?? line.operatorId}</dd></div>
      <div><dt className="text-slate-500">Assignment</dt><dd>{line.assignmentId ?? "Not assigned"}</dd></div>
      <div><dt className="text-slate-500">DEUR</dt><dd>{deur?.deurNumber ?? deur?.id ?? "Not started"}</dd></div>
      <div><dt className="text-slate-500">Status / Activity</dt><dd>{deur?.status ?? "No DEUR"}{currentActivity ? ` — ${currentActivity}` : ""}</dd></div>
      <div><dt className="text-slate-500">Operation / Idle</dt><dd>{operationMinutes.toFixed(2)} / {idleMinutes} min</dd></div>
      <div><dt className="text-slate-500">Standby / Breakdown</dt><dd>{deur?.totalMobilizationMinutes ?? 0} / {breakdownMinutes} min</dd></div>
      <div><dt className="text-slate-500">Customer</dt><dd>{deur?.status === "Acknowledged" ? "Acknowledged" : deur?.status === "Rejected" ? "Rejected" : "Pending"}</dd></div>
      <div><dt className="text-slate-500">Billing</dt><dd>{deur?.billingLocked || deur?.billingStatementId ? "Consumed" : billingEligible ? "Eligible" : "Not eligible"}</dd></div>
      <div className="col-span-2"><dt className="text-slate-500">Last updated</dt><dd>{live?.lastEvent?.occurredAt ? new Date(live.lastEvent.occurredAt).toLocaleString() : deur?.updatedAt ? new Date(deur.updatedAt).toLocaleString() : line.updatedAt}</dd></div>
    </dl>
    <a className="mt-3 inline-block rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white" href={buildOperatorDeurLineUrl(rentalId,line.id)}>{deur && ["Draft", "In Progress"].includes(deur.status) ? "Continue Line" : "Open Line"}</a>
  </article>;
}

export const RentalLineOperationCard = memo(RentalLineOperationCardComponent);
