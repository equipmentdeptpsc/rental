import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { filterMissingDeurItems, missingDeurCounts, type MissingDeurStatus } from "@/features/rental/deur/compliance/missingDeurList";
import { getRentalEquipmentLabel } from "@/features/rental/utils/rentalFormOptions";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { buildRentalDeurComplianceReport } from "@/features/rental/deur/compliance/buildRentalDeurComplianceReport";

type AttentionRow = ReturnType<typeof buildRentalDeurComplianceReport>["rows"][number];

export default function RentalDeurExceptionsSection({
  attentionRows,
  rentalEquipmentLines,
  getEquipment,
  operators,
  projects,
}: {
  attentionRows: AttentionRow[];
  rentalEquipmentLines: RentalEquipmentLine[];
  getEquipment: (id: string) => EquipmentRecord | undefined;
  operators: Operator[];
  projects: ProjectRecord[];
}) {
  const deurItems = attentionRows.map(({ rental, assignment, result, expectation }) => {
    const line = expectation?.rentalEquipmentLineId
      ? rentalEquipmentLines.find((item) => item.id === expectation.rentalEquipmentLineId)
      : undefined;
    const equipment = getEquipment(line?.equipmentId ?? rental.equipmentId);
    const operator = operators.find((item) => item.id === (line?.operatorId ?? rental.operatorId ?? assignment?.operatorId));
    const project = projects.find((item) => item.id === rental.projectId);
    const raw = expectation?.status ?? result.status;
    const status: MissingDeurStatus = raw.includes("PENDING_CORRECTION")
      ? "Pending Correction"
      : raw.includes("INCOMPLETE")
        ? "Incomplete"
        : raw.includes("ACKNOWLEDGED")
          ? "Acknowledged"
          : "Missing";
    return {
      id: expectation?.expectationId ?? rental.id,
      rental: rental.rentalNumber ?? "Rental transaction",
      workDate: expectation?.workDate ?? rental.dateOut,
      equipment: getRentalEquipmentLabel(equipment),
      operator: operator?.name ?? "Not assigned",
      project: project?.projectName ?? rental.project,
      shift: expectation?.shiftCode ?? "—",
      status,
      reason: expectation?.reason ?? result.reason,
      searchText: `${rental.billingMethod ?? ""} ${expectation?.matchingDeurNumber ?? expectation?.matchingEffectiveDeurId ?? ""}`,
      source: { rental, expectation, policy: rental.deurExpectationPolicy },
    };
  });

  const [deurQuery, setDeurQuery] = useState("");
  const [deurStatus, setDeurStatus] = useState<"All" | MissingDeurStatus>("All");
  const [deurFrom, setDeurFrom] = useState("");
  const [deurTo, setDeurTo] = useState("");
  const [deurOperator, setDeurOperator] = useState("");
  const [deurEquipment, setDeurEquipment] = useState("");
  const [deurRental, setDeurRental] = useState("");
  const [deurProject, setDeurProject] = useState("");
  const [deurPage, setDeurPage] = useState(1);
  const [expanded, setExpanded] = useState<string>();

  const filteredDeur = filterMissingDeurItems(deurItems, {
    query: deurQuery,
    status: deurStatus,
    from: deurFrom,
    to: deurTo,
    operator: deurOperator,
    equipment: deurEquipment,
    rental: deurRental,
    project: deurProject,
  });
  const deurCounts = missingDeurCounts(deurItems);
  const pageSize = 20;
  const pageRows = filteredDeur.slice((deurPage - 1) * pageSize, deurPage * pageSize);
  const pageCount = Math.max(1, Math.ceil(filteredDeur.length / pageSize));

  return (
    <section className="app-card p-5">
      <div className="mb-4">
        <h2 className="app-section-title">DEUR Exceptions</h2>
        <p className="app-muted">Operational compliance exceptions only; no records or billing actions are generated.</p>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(["All", "Missing", "Incomplete", "Pending Correction"] as const).map((label) => (
          <button
            type="button"
            key={label}
            aria-pressed={deurStatus === label}
            onClick={() => { setDeurStatus(label); setDeurPage(1); }}
            className={`rounded-lg border p-3 text-left ${deurStatus === label ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-950" : "border-slate-200 dark:border-slate-700"}`}
          >
            <span className="block text-xs text-slate-500">{label}</span>
            <strong className="text-xl">{deurCounts[label]}</strong>
          </button>
        ))}
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <input className="app-control xl:col-span-2" aria-label="Search DEUR exceptions" placeholder="Search rental, equipment, operator, project, or reason" value={deurQuery} onChange={(e) => { setDeurQuery(e.target.value); setDeurPage(1); }} />
        <input className="app-control" aria-label="DEUR work date from" type="date" value={deurFrom} onChange={(e) => { setDeurFrom(e.target.value); setDeurPage(1); }} />
        <input className="app-control" aria-label="DEUR work date to" type="date" value={deurTo} onChange={(e) => { setDeurTo(e.target.value); setDeurPage(1); }} />
        {[["Operator", deurOperator, setDeurOperator], ["Equipment", deurEquipment, setDeurEquipment], ["Rental", deurRental, setDeurRental], ["Project", deurProject, setDeurProject]].map(([label, value, setter]) => (
          <select className="app-control" aria-label={`${label} filter`} key={label as string} value={value as string} onChange={(e) => { (setter as (v: string) => void)(e.target.value); setDeurPage(1); }}>
            <option value="">All {label as string}</option>
            {[...new Set(deurItems.map((item) => item[(label as string).toLowerCase() as "operator" | "equipment" | "rental" | "project"]))].sort().map((option) => <option key={option}>{option}</option>)}
          </select>
        ))}
        <Button variant="secondary" onClick={() => { setDeurQuery(""); setDeurStatus("All"); setDeurFrom(""); setDeurTo(""); setDeurOperator(""); setDeurEquipment(""); setDeurRental(""); setDeurProject(""); setDeurPage(1); }}>Clear Filters</Button>
      </div>
      <p className="mb-2 text-xs text-slate-500">Showing {pageRows.length} of {filteredDeur.length} exceptions · newest work date first</p>
      <ResponsiveTable>
        <table className="app-table min-w-full text-sm">
          <thead>
            <tr>{["Rental", "Work Date", "Equipment", "Operator", "Shift", "DEUR Status", "Reason", "Action"].map((heading) => <th scope="col" key={heading} className="px-3 py-2 text-left">{heading}</th>)}</tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-500">No DEUR exceptions match the selected filters.</td></tr>
            ) : pageRows.map((item) => (
              <Fragment key={item.id}>
                <tr className="border-t">
                  <td className="px-3 py-2 font-medium">{item.rental}</td>
                  <td className="px-3 py-2">{item.workDate}</td>
                  <td className="px-3 py-2">{item.equipment}</td>
                  <td className="px-3 py-2">{item.operator}</td>
                  <td className="px-3 py-2">{item.shift}</td>
                  <td className="px-3 py-2"><span className={`status-badge ${item.status === "Missing" ? "status-danger" : item.status === "Incomplete" ? "status-warning" : "status-neutral"}`}>{item.status}</span></td>
                  <td className="max-w-sm px-3 py-2">{item.reason}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Link to={`/rentals/${item.source.rental.id}/workspace`}><Button variant="secondary" size="sm">View Rental</Button></Link>
                      <Button variant="ghost" size="sm" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? undefined : item.id)}>Details</Button>
                    </div>
                  </td>
                </tr>
                {expanded === item.id && (
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <td colSpan={8} className="px-4 py-3 text-xs">
                      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div><dt className="text-slate-500">Project</dt><dd>{item.project}</dd></div>
                        <div><dt className="text-slate-500">Billing Method</dt><dd>{item.source.rental.billingMethod ?? "Not configured"}</dd></div>
                        <div><dt className="text-slate-500">Expectation Policy</dt><dd>{item.source.policy?.frequency?.replaceAll("_", " ") ?? "Legacy rental fallback"}</dd></div>
                        <div><dt className="text-slate-500">Existing DEUR</dt><dd>{item.source.expectation?.matchingDeurNumber ?? item.source.expectation?.matchingEffectiveDeurId ?? "None"}</dd></div>
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </ResponsiveTable>
      {pageCount > 1 && (
        <nav aria-label="DEUR exception pages" className="mt-4 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={deurPage === 1} onClick={() => setDeurPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm">Page {deurPage} of {pageCount}</span>
          <Button variant="secondary" size="sm" disabled={deurPage === pageCount} onClick={() => setDeurPage((p) => p + 1)}>Next</Button>
        </nav>
      )}
    </section>
  );
}
