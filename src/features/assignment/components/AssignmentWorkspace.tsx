import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DetailsDrawer from "@/components/ui/DetailsDrawer";
import InteractiveTableRow from "@/components/ui/InteractiveTableRow";
import FilterBar from "@/components/ui/FilterBar";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/features/auth/AuthContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useActivityCodes } from "@/features/masters/activity-code";
import { canStartRentalFromCanonicalAssignment } from "@/features/assignment/services/assignmentRuntimeCapability";
import { canUseCanonicalRemoteRentalCreation, canUseLegacyRentalMutations } from "@/features/rental/services/rentalRuntimeCapability";
import { displayAssignmentDate, displayAssignmentExpectedReturn, getAssignmentNumber } from "@/features/assignment/utils/assignmentDisplay";
import type { CanonicalAssignmentData } from "@/features/assignment/hooks/useCanonicalAssignmentData";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { RentalRecord } from "@/features/rental/types";
import { getAssignmentRuntimeCapability } from "@/features/assignment/services/assignmentRuntimeCapability";
import { requestCanonicalAssignmentRefresh } from "@/features/assignment/remote/canonicalAssignmentRefresh";
import { useAssignmentRentalPreparation } from "@/features/assignment/hooks/useAssignmentRentalPreparation";
import { requestCanonicalEquipmentRefresh } from "@/features/equipment/remote/canonicalEquipmentRefresh";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";
import { getProjectDisplayLabel } from "@/features/project/projectDisplay";

const pageSize = 50;
const validStatuses = new Set(["", "Active", "Completed", "Cancelled"]);
const date = (value?: string) => value?.slice(0, 10) ?? "";

export default function AssignmentWorkspace({ data }: { data: CanonicalAssignmentData }) {
  const [params, setParams] = useSearchParams();
  const [queryInput, setQueryInput] = useState(params.get("aq") ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activityCodes = useActivityCodes().records ?? [];
  const filter = (name: string) => params.get(`a_${name}`) ?? "";
  const keyword = params.get("aq") ?? "";
  useEffect(() => { const timer = window.setTimeout(() => {
    if (queryInput === keyword) return;
    setParams((current) => { const next = new URLSearchParams(current); queryInput ? next.set("aq", queryInput) : next.delete("aq"); next.delete("a_page"); return next; }, { replace: true });
  }, 250); return () => window.clearTimeout(timer); }, [queryInput, keyword, setParams]);
  const update = (name: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); value ? next.set(`a_${name}`, value) : next.delete(`a_${name}`); next.delete("a_page"); return next; });
  const clear = () => { setQueryInput(""); setParams((current) => { const next = new URLSearchParams(current); for (const key of [...next.keys()]) if (key === "aq" || key.startsWith("a_")) next.delete(key); return next; }); };
  const equipmentById = useMemo(() => new Map(data.equipment.map((item) => [item.id, item])), [data.equipment]);
  const operatorsById = useMemo(() => new Map(data.operators.map((item) => [item.id, item])), [data.operators]);
  const projectsById = useMemo(() => new Map(data.projects.map((item) => [item.id, item])), [data.projects]);
  const customersById = useMemo(() => new Map(data.customers.map((item) => [item.id, item])), [data.customers]);
  const activitiesById = useMemo(() => new Map(activityCodes.map((item) => [item.id, item.activityCode])), [activityCodes]);
  const sorted = useMemo(() => [...data.assignments].sort((a, b) => b.assignedDate.localeCompare(a.assignedDate)), [data.assignments]);
  const visible = sorted.filter((assignment) => {
    const equipment = equipmentById.get(assignment.equipmentId), operator = operatorsById.get(assignment.operatorId), project = projectsById.get(assignment.projectId);
    const customer = project?.customerId ? customersById.get(project.customerId) : undefined;
    const text = `${getAssignmentNumber(assignment.id, data.assignments)} ${equipment?.assetNo ?? ""} ${equipment?.equipmentName ?? ""} ${operator?.name ?? ""} ${project?.name ?? ""} ${customer?.name ?? ""}`.toLowerCase();
    const status = filter("status");
    return text.includes(keyword.trim().toLowerCase()) && (!status || assignment.status === status) &&
      (!filter("equipment") || assignment.equipmentId === filter("equipment")) && (!filter("category") || equipment?.category === filter("category")) &&
      (!filter("operator") || assignment.operatorId === filter("operator")) && (!filter("customer") || project?.customerId === filter("customer")) &&
      (!filter("project") || assignment.projectId === filter("project")) && (!filter("location") || equipment?.location === filter("location")) &&
      (!filter("from") || date(assignment.assignedDate) >= filter("from")) && (!filter("to") || date(assignment.assignedDate) <= filter("to")) &&
      (!filter("quick") || filter("quick") === "missing" && !operator || filter("quick") === "assigned" && assignment.status === "Active");
  });
  const requestedPage = Math.max(1, Number(params.get("a_page") ?? 1) || 1);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const rows = visible.slice((page - 1) * pageSize, page * pageSize);
  const selected = selectedId ? data.assignments.find((item) => item.id === selectedId) : undefined;
  const customerId = filter("customer");
  const projectOptions = data.projects.filter((item) => !customerId || item.customerId === customerId);
  const select = (name: string, values: Array<[string, string]>) => <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{name}<select aria-label={name} className="assignment-filter-select app-control mt-1 w-full" value={filter(name.toLowerCase())} onChange={(event) => update(name.toLowerCase(), event.target.value)}><option value="">All {name.toLowerCase()}</option>{values.map(([id, label]) => <option className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100" key={id} value={id}>{label}</option>)}</select></label>;
  const distinct = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort().map((value) => [value, value] as [string, string]);
  const activeFilters = [...params.entries()].filter(([key, value]) => (key === "aq" || key.startsWith("a_")) && key !== "a_page" && Boolean(value));
  const filterDisplayValue = (key: string, value: string) => key === "a_project" ? getProjectDisplayLabel(projectsById.get(value) ?? { id: value }) : key === "a_operator" ? operatorsById.get(value)?.name ?? "Operator" : key === "a_customer" ? customersById.get(value)?.name ?? "Customer" : key === "a_equipment" ? `${equipmentById.get(value)?.assetNo ?? "Equipment"} · ${equipmentById.get(value)?.equipmentName ?? ""}` : value;
  return <section aria-label="Assignments" className="space-y-4">
    <FilterBar onClear={clear} canClear={activeFilters.length > 0}><label className="min-w-48 flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">Search assignments<input aria-label="Search assignments" className="app-control mt-1 w-full" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Equipment, operator, project…" /></label>
      {select("Category", distinct(data.equipment.map((item) => item.category)))}
      {select("Equipment", data.equipment.map((item) => [item.id, `${item.assetNo} · ${item.equipmentName}`]))}
      {select("Status", [...validStatuses].filter(Boolean).map((item) => [item, item]))}
      {select("Operator", data.operators.map((item) => [item.id, item.name]))}
      {data.customers.length > 0 && select("Customer", data.customers.map((item) => [item.id, item.name]))}
      {select("Project", projectOptions.map((item) => [item.id, getProjectDisplayLabel(item)]))}
      {distinct(data.equipment.map((item) => item.location)).length > 0 && select("Location", distinct(data.equipment.map((item) => item.location)))}
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Assigned from<input aria-label="Assigned from" type="date" className="app-control mt-1" value={filter("from")} onChange={(event) => update("from", event.target.value)} /></label>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Assigned to<input aria-label="Assigned to" type="date" className="app-control mt-1" value={filter("to")} onChange={(event) => update("to", event.target.value)} /></label>
      {select("Quick", [["assigned", "Assigned equipment"], ["missing", "Missing operator"]])}
    </FilterBar>
    {activeFilters.length > 0 && <div className="flex flex-wrap gap-2 text-xs" aria-label="Active filters">{activeFilters.map(([key, value]) => <button key={key} type="button" className="rounded-full border px-2 py-1 hover:bg-slate-100" onClick={() => key === "aq" ? setQueryInput("") : update(key.slice(2), "")}>{key === "aq" ? "Search" : key.slice(2)}: {filterDisplayValue(key, value)} ×</button>)}</div>}
    <p className="text-sm text-slate-500">Showing {rows.length} of {visible.length} assignments</p>
    <ResponsiveTable><div className="app-card min-w-[760px] overflow-hidden"><table className="app-table w-full text-sm"><thead className="sticky top-0 z-10 bg-white dark:bg-slate-900"><tr>{["Equipment", "Status", "Operator", "Customer", "Project", "Activity", "Assigned", "Expected end", "Location", "Action"].map((label) => <th key={label} className={`px-3 py-2 text-left ${["Customer", "Activity", "Location"].includes(label) ? "hidden lg:table-cell" : ""}`}>{label}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={10} className="p-8 text-center text-slate-500">{data.assignments.length === 0 ? "No assignments yet." : activeFilters.length ? "No assignments match these filters." : "No assignments found."}</td></tr> : rows.map((assignment) => {
      const equipment = equipmentById.get(assignment.equipmentId), operator = operatorsById.get(assignment.operatorId), project = projectsById.get(assignment.projectId), customer = project?.customerId ? customersById.get(project.customerId) : undefined;
      return <InteractiveTableRow key={assignment.id} onOpen={() => setSelectedId(assignment.id)} selected={selectedId === assignment.id} aria-label={`Open ${equipment?.assetNo ?? "equipment"} assignment`}><td className="px-3 py-2"><span className="block font-medium">{equipment?.equipmentName ?? "Equipment unavailable"}</span><span className="text-xs text-slate-500">{equipment?.assetNo ?? "—"}</span></td><td className="px-3 py-2"><StatusBadge tone={assignment.status === "Active" ? "warning" : assignment.status === "Completed" ? "success" : "neutral"}>{assignment.status}</StatusBadge></td><td className="px-3 py-2">{operator?.name ?? "—"}</td><td className="hidden px-3 py-2 lg:table-cell">{customer?.name ?? "—"}</td><td className="px-3 py-2">{project ? getProjectDisplayLabel(project) : "—"}</td><td className="hidden px-3 py-2 lg:table-cell">{activitiesById.get(assignment.activityCodeId ?? "") ?? "—"}</td><td className="px-3 py-2">{displayAssignmentDate(assignment.assignedDate)}</td><td className="px-3 py-2">{displayAssignmentExpectedReturn(assignment.expectedReturn)}</td><td className="hidden px-3 py-2 lg:table-cell">{equipment?.location || "—"}</td><td className="px-3 py-2"><Link aria-label={`View full assignment for ${equipment?.assetNo ?? "equipment"}`} className="text-blue-600 hover:underline" to={`/assignments/${assignment.id}`}>View</Link></td></InteractiveTableRow>;
    })}</tbody></table></div></ResponsiveTable>
    {pageCount > 1 && <div className="flex items-center justify-center gap-3 text-sm"><button disabled={page <= 1} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set("a_page", String(page - 1)); return next; })}>Previous</button><span>Page {page} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set("a_page", String(page + 1)); return next; })}>Next</button></div>}
    <AssignmentQuickDetails assignment={selected} data={data} activity={selected ? activitiesById.get(selected.activityCodeId ?? "") : undefined} onClose={() => setSelectedId(null)} />
  </section>;
}

function AssignmentQuickDetails({ assignment, data, activity, onClose }: { assignment?: AssignmentRecord; data: CanonicalAssignmentData; activity?: string; onClose: () => void }) {
  const { configuration, commandRepositories, readRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const preparation = useAssignmentRentalPreparation(assignment?.id);
  const [rental, setRental] = useState<{ status: "loading" | "ready" | "error"; value?: RentalRecord }>({ status: "loading" });
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  const canReadRental = Boolean(assignment) && hasPermission("rental.read");
  useEffect(() => {
    if (!canReadRental || !assignment) return;
    let active = true;
    setRental({ status: "loading" });
    void Promise.resolve(readRepositories.rentalEquipmentLines.list({ filters: { equipment_id: assignment.equipmentId } })).then(async (lines) => {
      if (!lines.success) { if (active) setRental({ status: "error" }); return; }
      const related = lines.value.items.filter((item) => item.assignmentId === assignment.id).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
      if (!related) { if (active) setRental({ status: "ready" }); return; }
      const record = await readRepositories.rentals.getById(related.rentalId);
      if (active) setRental(record.success ? { status: "ready", value: record.value ?? undefined } : { status: "error" });
    }).catch(() => { if (active) setRental({ status: "error" }); });
    return () => { active = false; };
  }, [assignment?.equipmentId, assignment?.id, canReadRental, readRepositories]);
  const equipment = assignment ? data.equipment.find((item) => item.id === assignment.equipmentId) : undefined, operator = assignment ? data.operators.find((item) => item.id === assignment.operatorId) : undefined, project = assignment ? data.projects.find((item) => item.id === assignment.projectId) : undefined;
  const customer = data.customers.find((item) => item.id === project?.customerId);
  const rentalCreationAvailable = canUseLegacyRentalMutations(configuration) || canUseCanonicalRemoteRentalCreation(configuration) && Boolean(commandRepositories.canonicalRental);
  const canStart = preparation.kind === "none" && canStartRentalFromCanonicalAssignment({ assignment, rentalCreationAvailable, hasRentalManagePermission: hasPermission("rental.create") });
  const canCancel = Boolean(assignment && preparation.kind === "none" && assignment.status === "Active" && typeof assignment.rowVersion === "number" && getAssignmentRuntimeCapability(configuration, Boolean(commandRepositories.canonicalAssignment)).canonicalCancellation && hasPermission("assignment.close"));
  const cancel = async () => {
    if (!assignment || !canCancel || !commandRepositories.canonicalAssignment || !window.confirm("Cancel this assignment booking?")) return;
    setCancelling(true); setCancelError(undefined);
    const result = await commandRepositories.canonicalAssignment.cancelAssignment({ commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), assignmentId: assignment.id, expectedVersion: assignment.rowVersion!, clientCreatedAt: new Date().toISOString(), deviceId: "erms-web" });
    setCancelling(false);
    if (!result.success) { setCancelError(result.message); return; }
    requestCanonicalAssignmentRefresh(); requestCanonicalRentalRefresh(); requestCanonicalEquipmentRefresh(); onClose();
  };
  const row = (label: string, value?: string) => <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm dark:border-slate-800"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value || "—"}</dd></div>;
  return <DetailsDrawer open={Boolean(assignment)} title={equipment ? `${equipment.assetNo} · ${equipment.equipmentName}` : "Assignment details"} onClose={onClose} busy={cancelling}><div className="space-y-5">{assignment && <><section><h3 className="font-semibold">Equipment</h3><dl>{row("Code", equipment?.assetNo)}{row("Category", equipment?.category)}{row("Condition", equipment?.condition)}{row("Location", equipment?.location)}</dl></section><section><h3 className="font-semibold">Assignment {getAssignmentNumber(assignment.id, data.assignments)}</h3><dl>{row("Status", assignment.status)}{row("Operator", operator?.name)}{row("Customer", customer?.name)}{row("Project", project ? getProjectDisplayLabel(project) : undefined)}{row("Activity", activity)}{row("Assigned", displayAssignmentDate(assignment.assignedDate))}{row("Expected end", displayAssignmentExpectedReturn(assignment.expectedReturn))}{row("Remarks", assignment.remarks)}</dl></section>{canReadRental && <section><h3 className="font-semibold">Related rental</h3>{rental.status === "loading" ? <p role="status">Loading rental…</p> : rental.status === "error" ? <p role="alert">Rental unavailable.</p> : <dl>{row("Rental", rental.value?.rentalNumber)}{row("Status", rental.value?.status)}{row("Date out", rental.value?.dateOut)}{row("Expected return", rental.value?.expectedReturn)}</dl>}</section>}{cancelError && <p role="alert" className="text-sm text-rose-700">{cancelError}</p>}<div className="flex flex-wrap gap-2 text-sm"><Link className="rounded border px-3 py-2" to={`/equipment/${assignment.equipmentId}`}>View equipment</Link><Link className="rounded border px-3 py-2" to={`/assignments/${assignment.id}`}>View assignment</Link>{preparation.kind === "committed" && <p role="status" className="text-amber-800">This assignment is already part of an approved or active rental and can no longer be cancelled from the preparation workflow.</p>}{preparation.kind === "error" && <p role="status" className="text-amber-800">Rental status could not be verified.</p>}{canStart && <Link className="rounded bg-slate-900 px-3 py-2 text-white" to={"/rentals/new?assignment=" + encodeURIComponent(assignment.id)}>Start Rental</Link>}{assignment.status === "Active" && preparation.kind === "draft" && preparation.count === 1 && hasPermission("rental.commercialTerms.read") && <Link className="rounded bg-slate-900 px-3 py-2 text-white" to={"/rentals/" + preparation.rental.id + "/commercial-terms"}>Continue Rental Preparation</Link>}{canCancel && <button type="button" className="rounded border px-3 py-2" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? "Cancelling…" : "Cancel Assignment"}</button>}{assignment.status === "Active" && preparation.kind === "draft" && hasPermission("assignment.close") && hasPermission("rental.update") && <Link className="rounded border px-3 py-2" to={"/assignments/" + assignment.id}>Cancel Assignment</Link>}</div></>}</div></DetailsDrawer>;
}
