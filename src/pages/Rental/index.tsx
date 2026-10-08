import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import TabBadge from "@/components/ui/TabBadge";
import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import RentalDeurExceptionsSection from "@/features/rental/components/RentalDeurExceptionsSection";
import { RentalMobileCard } from "@/features/rental/components/RentalListPresentation";
import RentalSharedFilters from "@/features/rental/components/RentalSharedFilters";
import InteractiveTableRow from "@/components/ui/InteractiveTableRow";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";
import RentalDeurComplianceIndicator from "@/features/rental/deur/compliance/RentalDeurComplianceIndicator";
import { buildRentalDeurComplianceReport } from "@/features/rental/deur/compliance/buildRentalDeurComplianceReport";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import { resolveRentalWorkflowStatus } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import { resolveRentalTransactionPresentation } from "@/features/rental/services/resolveRentalTransactionPresentation";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { collectionRepository } from "@/features/rental/collections/repository";
import { reconcileStatementCollections } from "@/features/rental/collections/collectionService";
import { projectRentalCollectionStatus } from "@/features/rental/collections/collectionStatusProjection";
import { projectActiveRentalEngagements } from "@/features/rental/services/projectActiveRentalEngagements";
import { useRentalListData } from "@/features/rental/hooks/useRentalListData";
import { filterRentalList, rentalFilterOptions, type RentalListFilters } from "@/features/rental/services/filterRentalList";
import { clearRentalFilterParams, readRentalFilters, updateRentalFilterParams } from "@/features/rental/services/rentalFilterUrl";
import { rentalWorkspaceFromListPath } from "@/features/rental/services/rentalListNavigation";
import { getProjectDisplayLabel } from "@/features/project/projectDisplay";
import { canUseAnyRentalMutations, canUseCanonicalRemoteRentalCreation, canUseLegacyRentalMutations, REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/rental/services/rentalRuntimeCapability";
import { useAuth } from "@/features/auth/AuthContext";
import { LoadingState, ErrorState, EmptyDataState } from "@/components/ui/AsyncState";

type RentalView = "rentals" | "engagements" | "deur-exceptions" | "approvals";

const VIEWS: { id: RentalView; label: string }[] = [
  { id: "rentals", label: "All Rentals" },
  { id: "engagements", label: "Engagements" },
  { id: "deur-exceptions", label: "DEUR Exceptions" },
];

function EngagementRentalLinks({ rentals, listSearch }: { rentals: readonly { id: string; rentalNumber?: string }[]; listSearch: string }) {
  const links = (items: typeof rentals) => items.map((rental) => <Link className="app-link" key={rental.id} to={rentalWorkspaceFromListPath(rental.id, listSearch)}>{rental.rentalNumber ?? "Rental workspace"}</Link>);
  return <div className="flex flex-wrap gap-2">{links(rentals.slice(0, 2))}{rentals.length > 2 && <details data-row-interactive className="w-full text-xs"><summary className="cursor-pointer text-blue-700">+ {rentals.length - 2} more rentals</summary><div className="mt-1 flex flex-wrap gap-2">{links(rentals.slice(2))}</div></details>}</div>;
}

export default function RentalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dependencies = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const { billingStatement: billingStatementRepository } = dependencies.repositories;
  const mutationsAvailable = canUseLegacyRentalMutations(dependencies.configuration)
    || (canUseCanonicalRemoteRentalCreation(dependencies.configuration) && Boolean(dependencies.commandRepositories.canonicalRental) && hasPermission("rental.create"));
  const anyMutationsAvailable = canUseAnyRentalMutations(dependencies.configuration, Boolean(dependencies.commandRepositories.canonicalRental));
  const rentalContext = useRental();
  const equipmentContext = useEquipment();
  const assignmentContext = useAssignment();
  const operatorContext = useOperator();
  const projectContext = useProject();
  const fallbackListData = useMemo(() => ({
    rentals: rentalContext.rentals,
    rentalEquipmentLines: rentalContext.rentalEquipmentLines,
    equipment: equipmentContext.equipment,
    assignments: assignmentContext.assignments,
    operators: operatorContext.operators,
    projects: projectContext.projects,
    customers: [], costCodes: [], activityCodes: [],
  }), [assignmentContext.assignments, equipmentContext.equipment, operatorContext.operators, projectContext.projects, rentalContext.rentalEquipmentLines, rentalContext.rentals]);
  const rentalList = useRentalListData(fallbackListData);
  const { rentals, rentalEquipmentLines, equipment: equipmentRecords, assignments, operators, projects, customers } = rentalList.data;
  const getEquipment = (id: string) => equipmentRecords.find((record) => record.id === id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [deurVersion, setDeurVersion] = useState(0);
  const filters = readRentalFilters(searchParams);
  const pageNumber = Math.max(1, Number(searchParams.get("r_page")) || 1);
  const sort = searchParams.get("r_sort") || "dateOut";
  const descending = searchParams.get("r_dir") === "desc";
  const setFilter = useCallback((key: keyof RentalListFilters, value: string) => setSearchParams((current) => updateRentalFilterParams(current, key, value), { replace: true }), [setSearchParams]);
  const clearFilters = useCallback(() => setSearchParams((current) => clearRentalFilterParams(current), { replace: true }), [setSearchParams]);
  const setPage = (page: number) => setSearchParams((current) => { const next = new URLSearchParams(current); page > 1 ? next.set("r_page", String(page)) : next.delete("r_page"); return next; }, { replace: true });
  const setSort = (field: string) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("r_sort", field); next.set("r_dir", sort === field && !descending ? "desc" : "asc"); next.delete("r_page"); return next; }, { replace: true });
  const openRental = (id: string) => navigate(rentalWorkspaceFromListPath(id, location.search));

  useEffect(() => subscribeDeurChanges(() => setDeurVersion((value) => value + 1)), []);

  const requestedView = (searchParams.get("view") as RentalView | null) ?? "rentals";
  const view = requestedView === "approvals" && hasPermission("rental.approval.decide") ? requestedView : requestedView === "engagements" || requestedView === "deur-exceptions" ? requestedView : "rentals";
  const setView = (next: RentalView) => {
    const params = new URLSearchParams(searchParams);
    if (next === "rentals") params.delete("view");
    else params.set("view", next);
    params.delete("r_page");
    setSearchParams(params, { replace: true });
  };

  const evaluationDate = new Date().toISOString().slice(0, 10);
  const { monitored: monitoredRentals, rows: attentionRows } = useMemo(() => buildRentalDeurComplianceReport({
    rentals,
    assignments,
    rentalEquipmentLines,
    deurs: deurRepository.getAll(),
    evaluationTimestamp: new Date().toISOString(),
    liveShiftWindows: deurShiftWindowRepository.getAll(),
  }), [rentals, assignments, rentalEquipmentLines, deurVersion, evaluationDate]);
  const options = useMemo(() => rentalFilterOptions({ rentals, lines: rentalEquipmentLines, equipment: equipmentRecords, operators, projects, customers, customer: filters.customer }), [rentals, rentalEquipmentLines, equipmentRecords, operators, projects, customers, filters.customer]);
  const filteredRentals = useMemo(() => {
    return filterRentalList({ rentals, lines: rentalEquipmentLines, equipment: equipmentRecords, operators, projects, filters });
  }, [equipmentRecords, operators, projects, filters.query, filters.customer, filters.project, filters.equipment, filters.operator, filters.status, filters.from, filters.to, rentalEquipmentLines, rentals]);
  const engagements = useMemo(() => projectActiveRentalEngagements({ rentals: filteredRentals, lines: rentalEquipmentLines }), [filteredRentals, rentalEquipmentLines]);
  const displayedRentals = view === "approvals"
    ? filteredRentals.filter((rental) => rental.status === "Reserved" && rental.approvalStatus === "Pending")
    : filteredRentals;
  const sortedRentals = useMemo(() => [...displayedRentals].sort((a, b) => {
    const value = (record: typeof a) => sort === "number" ? record.rentalNumber ?? "" : sort === "status" ? record.status : sort === "expectedReturn" ? record.expectedReturn ?? "" : sort === "customer" ? record.customer : record.dateOut;
    return (descending ? -1 : 1) * value(a).localeCompare(value(b), undefined, { numeric: true });
  }), [displayedRentals, sort, descending]);
  const total = view === "engagements" ? engagements.length : sortedRentals.length;
  const pageCount = Math.max(1, Math.ceil(total / 50));
  const currentPage = Math.min(pageNumber, pageCount);
  const pageRentals = sortedRentals.slice((currentPage - 1) * 50, currentPage * 50);
  const pageEngagements = engagements.slice((currentPage - 1) * 50, currentPage * 50);
  const allowedRentalIds = new Set(filteredRentals.map((rental) => rental.id));

  return (
    <div className="app-page">
      <PageHeader
        title="Rental Transactions"
        description="Manage equipment rentals, customer engagements, and DEUR compliance."
        actions={mutationsAvailable ? <Link to="/rentals/new"><Button>New Rental</Button></Link> : undefined}
      />

      <div className="app-card flex flex-wrap gap-2 p-2" role="tablist" aria-label="Rental list views">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${view === item.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {item.label}
            {item.id === "deur-exceptions" && <TabBadge count={attentionRows.length} tone="danger" />}
          </button>
        ))}
      </div>

      {!anyMutationsAvailable && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">{REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE}</div>}
      {rentalList.status === "loading" && <LoadingState label="Loading Rental data…" />}
      {rentalList.status === "error" && <ErrorState title="Rental data unavailable" message={rentalList.message} onRetry={rentalList.retry} />}
      {rentalList.status === "loaded" && <RentalSharedFilters filters={filters} options={options} onChange={setFilter} onClear={clearFilters} />}

      {rentalList.status === "loaded" && view === "engagements" && (
        <section className="app-card p-5">
          <h2 className="app-section-title">Active Customer / Project Engagements</h2>
          <p className="app-muted mb-4">Customer and project groups. Select a rental number to open that workspace.</p>
          {engagements.length === 0 ? <EmptyDataState title={rentals.length ? "No matching engagements" : "No active engagements"} description="Adjust the filters to see active or financially open rentals." /> : <>
            <div className="space-y-3 xl:hidden">{pageEngagements.map((engagement) => {
              const projectLabel = options.projects.find((item) => item.value === engagement.projectId)?.label ?? engagement.project;
              return <article key={engagement.key} className="rounded-lg border p-3 text-sm"><strong>{engagement.customer}</strong><p>{projectLabel}</p><p className="text-slate-500">{engagement.activeEquipmentCount} active equipment · {engagement.returnedFinanciallyOpenCount} returned, financially open</p><div className="mt-2"><EngagementRentalLinks rentals={engagement.rentals} listSearch={location.search} /></div></article>;
            })}</div>
            <table className="app-table hidden w-full table-fixed text-sm xl:table"><thead className="sticky top-0 bg-white dark:bg-slate-900"><tr>{["Customer / Project", "Rental Workspaces", "Equipment", "Attention"].map((label) => <th key={label} className="px-3 py-2 text-left">{label}</th>)}</tr></thead><tbody>{pageEngagements.map((engagement) => {
              const rentalIds = new Set(engagement.rentals.map((rental) => rental.id));
              const attention = attentionRows.filter((row) => rentalIds.has(row.rental.id)).length;
              const projectLabel = options.projects.find((item) => item.value === engagement.projectId)?.label ?? engagement.project;
              return <InteractiveTableRow key={engagement.key} aria-label={`Open rental ${engagement.rentals[0]?.rentalNumber ?? "workspace"}`} onOpen={() => openRental(engagement.rentals[0].id)}><td className="px-3 py-2"><strong className="block truncate">{engagement.customer}</strong><span className="block truncate text-xs text-slate-500">{projectLabel}</span></td><td className="px-3 py-2"><EngagementRentalLinks rentals={engagement.rentals} listSearch={location.search} /></td><td className="px-3 py-2">{engagement.activeEquipmentCount} active<span className="block text-xs text-slate-500">{engagement.returnedFinanciallyOpenCount} returned, financially open</span></td><td className="px-3 py-2">{attention ? `${attention} DEUR exceptions` : "—"}</td></InteractiveTableRow>;
            })}</tbody></table>
          </>}
        </section>
      )}

      {rentalList.status === "loaded" && (view === "rentals" || view === "approvals") && (
        <>
          {view === "approvals" && <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status"><strong>Manager approvals</strong><p className="mt-1">Reserved Rentals awaiting your decision.</p></section>}
          <div className="space-y-3 xl:hidden">
            {displayedRentals.length === 0 ? (
              <EmptyDataState title={view === "approvals" ? "No pending approvals" : rentals.length ? "No matching rentals" : "No rental transactions"} description={view === "approvals" ? "There are no Reserved Rentals awaiting your decision." : "Try a different search term or clear the filters."} />
            ) : pageRentals.map((rental) => {
              const presentation = resolveRentalTransactionPresentation({ rental, lines: rentalEquipmentLines, equipment: equipmentRecords, operators });
              const rentalDeurs = deurRepository.getByRentalId(rental.id);
              const effectiveDeur = rentalDeurs.at(-1);
              const workflow = resolveRentalWorkflowStatus({
                rental,
                effectiveDeur,
                commercialTermsAvailable: Boolean(effectiveDeur?.commercialSnapshot),
                billableEvidence: Boolean(effectiveDeur?.totals?.operationMinutes || effectiveDeur?.totalOperatingMinutes),
              });
              const statements = billingStatementRepository.getByRentalId(rental.id);
              const totals = statements.map((statement) => reconcileStatementCollections(statement, collectionRepository.getByStatementId(statement.id)));
              const collection = projectRentalCollectionStatus({
                hasStatement: statements.length > 0,
                totalInvoiced: totals.reduce((sum, item) => sum + item.invoiceTotal, 0),
                totalCollected: totals.reduce((sum, item) => sum + item.totalCollected, 0),
                outstandingBalance: totals.reduce((sum, item) => sum + item.outstandingBalance, 0),
              });
              const compliance = monitoredRentals.find((item) => item.rental.id === rental.id);
              return (
                <RentalMobileCard
                  key={rental.id}
                  rental={rental}
                  presentation={presentation}
                  workflowLabel={workflow.label}
                  collectionStatus={collection.status}
                  compliance={compliance ? <RentalDeurComplianceIndicator result={compliance.result} /> : null}
                  onOpen={() => openRental(rental.id)}
                  workspacePath={rentalWorkspaceFromListPath(rental.id, location.search)}
                />
              );
            })}
          </div>

          <div className="app-card hidden xl:block">
            <table className="app-table w-full table-fixed text-sm">
              <colgroup><col className="w-[21%]" /><col className="w-[10%]" /><col className="w-[20%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[12%]" /><col className="w-[12%]" /></colgroup>
              <thead className="sticky top-0 bg-white dark:bg-slate-900"><tr>
                {[["Rental / Equipment", "number"], ["Status", "status"], ["Customer / Project", "customer"], ["Operator", ""], ["Start", "dateOut"], ["Expected Return", "expectedReturn"], ["Attention", ""]].map(([label, field]) => <th className="px-3 py-2 text-left" key={label}>{field ? <button type="button" className="hover:text-blue-600" onClick={() => setSort(field)}>{label}{sort === field ? descending ? " ↓" : " ↑" : ""}</button> : label}</th>)}
              </tr></thead>
              <tbody>
                  {displayedRentals.length === 0 ? (
                    <tr><td colSpan={7} className="p-4"><EmptyDataState title={view === "approvals" ? "No pending approvals" : rentals.length ? "No matching rentals" : "No rental transactions"} description="Try a different search term or clear the filters." /></td></tr>
                  ) : pageRentals.map((rental) => {
                    const presentation = resolveRentalTransactionPresentation({ rental, lines: rentalEquipmentLines, equipment: equipmentRecords, operators });
                    const compliance = monitoredRentals.find((item) => item.rental.id === rental.id);
                    return (
                      <InteractiveTableRow key={rental.id} aria-label={`Open rental ${rental.rentalNumber ?? "workspace"}`} onOpen={() => openRental(rental.id)}>
                        <td className="px-3 py-2"><strong className="block truncate">{rental.rentalNumber ?? "Rental transaction"}</strong><span className="block truncate text-xs text-slate-500" title={presentation.equipmentLabel}>{presentation.equipmentLabel}</span></td>
                        <td className="px-3 py-2"><StatusBadge tone={rental.status === "Returned" ? "success" : "info"}>{rental.status}</StatusBadge></td>
                        <td className="px-3 py-2"><span className="block truncate">{rental.customer}</span><span className="block truncate text-xs text-slate-500">{projects.find((project) => project.id === rental.projectId) ? getProjectDisplayLabel(projects.find((project) => project.id === rental.projectId)) : rental.project}</span></td>
                        <td className="truncate px-3 py-2" title={presentation.operatorLabel}>{presentation.operatorLabel}</td>
                        <td className="px-3 py-2">{rental.dateOut.slice(0, 10)}</td>
                        <td className="px-3 py-2">{rental.expectedReturn?.slice(0, 10) ?? "Open"}</td>
                        <td className="px-3 py-2">{compliance && <RentalDeurComplianceIndicator result={compliance.result} />}</td>
                      </InteractiveTableRow>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rentalList.status === "loaded" && view === "deur-exceptions" && (
        <RentalDeurExceptionsSection
          attentionRows={attentionRows.filter((row) => allowedRentalIds.has(row.rental.id))}
          rentalEquipmentLines={rentalEquipmentLines}
          getEquipment={getEquipment}
          operators={operators}
          projects={projects}
        />
      )}
      {rentalList.status === "loaded" && view !== "deur-exceptions" && pageCount > 1 && <nav aria-label="Rental pages" className="flex items-center justify-center gap-3 text-sm"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount} · {total} {view === "engagements" ? "engagements" : "rentals"}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
    </div>
  );
}
