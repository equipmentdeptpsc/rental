import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import StatusBadge from "@/components/ui/StatusBadge";
import TabBadge from "@/components/ui/TabBadge";
import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";
import RentalDeurExceptionsSection from "@/features/rental/components/RentalDeurExceptionsSection";
import { RentalMobileCard } from "@/features/rental/components/RentalListPresentation";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";
import RentalDeurComplianceIndicator from "@/features/rental/deur/compliance/RentalDeurComplianceIndicator";
import { buildRentalDeurComplianceReport } from "@/features/rental/deur/compliance/buildRentalDeurComplianceReport";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import ApprovalInvalidationNotice from "@/features/rental/approval/ApprovalInvalidationNotice";
import { resolveRentalWorkflowStatus } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import { resolveRentalTransactionPresentation } from "@/features/rental/services/resolveRentalTransactionPresentation";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { collectionRepository } from "@/features/rental/collections/repository";
import { reconcileStatementCollections } from "@/features/rental/collections/collectionService";
import { projectRentalCollectionStatus } from "@/features/rental/collections/collectionStatusProjection";
import { projectActiveRentalEngagements } from "@/features/rental/services/projectActiveRentalEngagements";
import { useRentalListData } from "@/features/rental/hooks/useRentalListData";
import { filterRentalList } from "@/features/rental/services/filterRentalList";
import { canUseLegacyRentalMutations, REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/rental/services/rentalRuntimeCapability";

type RentalView = "rentals" | "engagements" | "deur-exceptions";

const VIEWS: { id: RentalView; label: string }[] = [
  { id: "rentals", label: "All Rentals" },
  { id: "engagements", label: "Engagements" },
  { id: "deur-exceptions", label: "DEUR Exceptions" },
];

export default function RentalPage() {
  const dependencies = useApplicationDependenciesCompatibility();
  const { billingStatement: billingStatementRepository } = dependencies.repositories;
  const mutationsAvailable = canUseLegacyRentalMutations(dependencies.configuration);
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
  }), [assignmentContext.assignments, equipmentContext.equipment, operatorContext.operators, projectContext.projects, rentalContext.rentalEquipmentLines, rentalContext.rentals]);
  const rentalList = useRentalListData(fallbackListData);
  const { rentals, rentalEquipmentLines, equipment: equipmentRecords, assignments, operators, projects } = rentalList.data;
  const getEquipment = (id: string) => equipmentRecords.find((record) => record.id === id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [, setDeurVersion] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => subscribeDeurChanges(() => setDeurVersion((value) => value + 1)), []);

  const view = (searchParams.get("view") as RentalView | null) ?? "rentals";
  const setView = (next: RentalView) => {
    const params = new URLSearchParams(searchParams);
    if (next === "rentals") params.delete("view");
    else params.set("view", next);
    setSearchParams(params, { replace: true });
  };

  const { monitored: monitoredRentals, rows: attentionRows } = buildRentalDeurComplianceReport({
    rentals,
    assignments,
    rentalEquipmentLines,
    deurs: deurRepository.getAll(),
    evaluationTimestamp: new Date().toISOString(),
    liveShiftWindows: deurShiftWindowRepository.getAll(),
  });
  const engagements = projectActiveRentalEngagements({ rentals, lines: rentalEquipmentLines });
  const filteredRentals = useMemo(() => {
    return filterRentalList({ rentals, lines: rentalEquipmentLines, equipment: equipmentRecords, operators, query });
  }, [equipmentRecords, operators, query, rentalEquipmentLines, rentals]);

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

      {!mutationsAvailable && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">{REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE}</div>}
      {rentalList.status === "loading" && <div className="app-card p-6 text-center text-slate-600" role="status">Loading canonical Rental data…</div>}
      {rentalList.status === "error" && <div className="app-card border border-red-200 p-6" role="alert"><h2 className="font-semibold text-red-800">Rental data unavailable</h2><p className="mt-1 text-sm text-red-700">{rentalList.message}</p><Button className="mt-4" variant="secondary" onClick={rentalList.retry}>Retry</Button></div>}

      {rentalList.status === "loaded" && view === "engagements" && (
        <section className="app-card p-5">
          <h2 className="app-section-title">Active Customer / Project Engagements</h2>
          <p className="app-muted mb-4">Read-only grouping; every Rental and equipment-line identity remains independent.</p>
          <ResponsiveTable>
            <table className="app-table min-w-full text-sm">
              <thead>
                <tr>
                  {["Customer", "Project", "Active Equipment", "Returned / Financially Open", "DEUR Attention", "Rental Transactions", "Open Workspace"].map((label) => (
                    <th className="px-3 py-2 text-left" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {engagements.length === 0 ? (
                  <tr><td className="p-6 text-center text-slate-500" colSpan={7}>No active or financially-open engagements.</td></tr>
                ) : engagements.map((engagement) => {
                  const rentalIds = new Set(engagement.rentals.map((rental) => rental.id));
                  const attention = attentionRows.filter((row) => rentalIds.has(row.rental.id)).length;
                  return (
                    <tr className="border-t" key={engagement.key}>
                      <td className="px-3 py-2">{engagement.customer}</td>
                      <td className="px-3 py-2">{engagement.project}</td>
                      <td className="px-3 py-2">{engagement.activeEquipmentCount}</td>
                      <td className="px-3 py-2">{engagement.returnedFinanciallyOpenCount}</td>
                      <td className="px-3 py-2">{attention}</td>
                      <td className="px-3 py-2">{engagement.rentals.length}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {engagement.rentals.map((rental) => (
                            <Link className="app-link" key={rental.id} to={`/rentals/${rental.id}/workspace`}>
                              {rental.rentalNumber ?? rental.id}
                            </Link>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ResponsiveTable>
        </section>
      )}

      {rentalList.status === "loaded" && view === "rentals" && (
        <>
          <section className="app-card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              aria-label="Search rentals"
              className="app-control"
              placeholder="Search rental number, customer, project, equipment, or operator"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button variant="secondary" onClick={() => setQuery("")}>Clear</Button>
          </section>

          <div className="space-y-3 lg:hidden">
            {filteredRentals.length === 0 ? (
              <p className="app-muted text-center">No rental transactions found.</p>
            ) : filteredRentals.map((rental) => {
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
                />
              );
            })}
          </div>

          <ResponsiveTable>
            <div className="app-card hidden min-w-max lg:block">
              <table className="app-table min-w-full">
                <thead>
                  <tr>
                    {["Equipment", "Customer", "Project", "Date Out", "Expected Return", "Status", "DEUR Compliance", "Collection Status", "Actions"].map((label) => (
                      <th className="px-4 py-3 text-left" key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRentals.length === 0 ? (
                    <tr><td colSpan={9} className="py-10 text-center text-slate-500">No rental transactions found.</td></tr>
                  ) : filteredRentals.map((rental) => {
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
                      <tr key={rental.id} className="border-t">
                        <td className="px-4 py-3">
                          <p>{presentation.equipmentLabel}</p>
                          <p className="text-xs text-slate-500">{presentation.operatorLabel}</p>
                        </td>
                        <td className="px-4 py-3">{rental.customer}</td>
                        <td className="px-4 py-3">{rental.project}</td>
                        <td className="px-4 py-3">{rental.dateOut}</td>
                        <td className="px-4 py-3">{rental.expectedReturn}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={rental.status === "Returned" ? "success" : "info"}>{rental.status}</StatusBadge>
                          <p className="mt-1 text-xs text-slate-600">{workflow.label}</p>
                        </td>
                        <td className="px-4 py-3">{compliance && <RentalDeurComplianceIndicator result={compliance.result} />}</td>
                        <td className="px-4 py-3">{collection.status}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <Link to={`/rentals/${rental.id}/workspace`} className="app-link">Open Workspace</Link>
                            <RentalQuickActions rental={rental} />
                          </div>
                          <ApprovalInvalidationNotice rental={rental} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ResponsiveTable>
        </>
      )}

      {rentalList.status === "loaded" && view === "deur-exceptions" && (
        <RentalDeurExceptionsSection
          attentionRows={attentionRows}
          rentalEquipmentLines={rentalEquipmentLines}
          getEquipment={getEquipment}
          operators={operators}
          projects={projects}
        />
      )}
    </div>
  );
}
