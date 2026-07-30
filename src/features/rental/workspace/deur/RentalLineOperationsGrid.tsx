import type { RentalAggregate } from "@/features/rental/aggregate";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import { buildRentalLineOperations } from "./buildRentalLineOperations";

export default function RentalLineOperationsGrid({ aggregate, equipment, operators, evaluatedAt }: {
  aggregate: RentalAggregate;
  equipment: EquipmentRecord[];
  operators: Operator[];
  evaluatedAt: string;
}) {
  const states = buildRentalLineOperations({ lines: aggregate.rentalEquipmentLines, deurs: aggregate.deurs, evaluatedAt });
  return <section aria-label="Rental equipment line operations" className="space-y-3">
    <h2 className="text-lg font-semibold">Equipment Line Operations</h2>
    <div className="grid gap-4 xl:grid-cols-2">
      {states.map(({ line, deur, currentActivity, projectedOperationMinutes, idleMinutes, breakdownMinutes, billingEligible }) => {
        const machine = equipment.find((item) => item.id === line.equipmentId);
        const operator = operators.find((item) => item.id === line.operatorId);
        return <article className="rounded-xl border bg-white p-4 shadow-sm" data-rental-line-id={line.id} key={line.id}>
          <div className="flex justify-between gap-3"><div><h3 className="font-semibold">{machine ? `${machine.equipmentName} (${machine.assetNo})` : line.equipmentId}</h3><p className="text-xs text-slate-500">Line {line.id}</p></div><span className="text-sm font-medium">{line.status}</span></div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-slate-500">Operator</dt><dd>{operator?.name ?? line.operatorId}</dd></div>
            <div><dt className="text-slate-500">Assignment</dt><dd>{line.assignmentId ?? "Not assigned"}</dd></div>
            <div><dt className="text-slate-500">DEUR</dt><dd>{deur?.deurNumber ?? deur?.id ?? "Not started"}</dd></div>
            <div><dt className="text-slate-500">Status / Activity</dt><dd>{deur?.status ?? "No DEUR"}{currentActivity ? ` — ${currentActivity}` : ""}</dd></div>
            <div><dt className="text-slate-500">Operation / Idle</dt><dd>{projectedOperationMinutes} / {idleMinutes} min</dd></div>
            <div><dt className="text-slate-500">Standby / Breakdown</dt><dd>{deur?.totalMobilizationMinutes ?? 0} / {breakdownMinutes} min</dd></div>
            <div><dt className="text-slate-500">Customer</dt><dd>{deur?.status === "Acknowledged" ? "Acknowledged" : deur?.status === "Rejected" ? "Rejected" : "Pending"}</dd></div>
            <div><dt className="text-slate-500">Billing</dt><dd>{deur?.billingLocked || deur?.billingStatementId ? "Consumed" : billingEligible ? "Eligible" : "Not eligible"}</dd></div>
            <div className="col-span-2"><dt className="text-slate-500">Last updated</dt><dd>{deur?.updatedAt ? new Date(deur.updatedAt).toLocaleString() : line.updatedAt}</dd></div>
          </dl>
          <a className="mt-3 inline-block rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white" href={`/rentals/${aggregate.rental.id}/operator-deur?lineId=${encodeURIComponent(line.id)}`}>{deur && ["Draft", "In Progress"].includes(deur.status) ? "Continue Line" : "Open Line"}</a>
        </article>;
      })}
    </div>
  </section>;
}
