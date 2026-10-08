import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import WorkflowBanner from "@/components/ui/WorkflowBanner";
import WorkflowStepper from "@/components/ui/WorkflowStepper";
import { useRentalWorkspaceAggregate, useRentalWorkspacePresentationData } from "..";
import { resolveRentalWorkflowStatus } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import { buildRentalWorkflowSteps, workflowBannerTone } from "../presentation/rentalWorkflowPresentation";

export default function RentalWorkspaceWorkflowPanel() {
  const aggregate = useRentalWorkspaceAggregate();
  const { assignments } = useRentalWorkspacePresentationData();
  const { hasPermission } = useAuth();
  const effectiveDeurs = aggregate.rentalEquipmentLines
    .map((line) =>
      [...aggregate.deurs]
        .filter((record) =>
          (record.rentalEquipmentLineId ? record.rentalEquipmentLineId === line.id : record.equipmentId === line.equipmentId) &&
          !record.revision?.supersededByRevisionId,
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0],
    )
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
  const commercialTermsAvailable =
    aggregate.rentalEquipmentLines.length > 0 &&
    aggregate.rentalEquipmentLines.every((line) => Boolean(line.commercialSnapshot));
  const billableEvidence =
    effectiveDeurs.length === aggregate.rentalEquipmentLines.length &&
    effectiveDeurs.every((record) => Boolean(record.totals?.operationMinutes || record.totalOperatingMinutes));
  const workflow = resolveRentalWorkflowStatus({
    rental: aggregate.rental,
    effectiveDeurs,
    commercialTermsAvailable,
    billableEvidence,
  });
  const steps = buildRentalWorkflowSteps(workflow.stage);
  const preparationOpen = aggregate.rental.approvalStatus !== "Approved";
  const linkedAssignments = aggregate.rentalEquipmentLines.map(line => assignments.find(item => item.id === line.assignmentId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const [searchParams] = useSearchParams();
  const tabHint =
    workflow.stage === "BillingEligible" || workflow.stage === "Billed"
      ? "billing"
      : workflow.stage === "DeurInProgress" || workflow.stage === "AwaitingCustomerAcknowledgement"
        ? "deur"
        : workflow.stage === "Returned" || workflow.stage === "Closed"
          ? "closing"
          : "overview";
  const billingStatementId = searchParams.get("billingStatementId");
  const tabHref = {
    search: billingStatementId ? `tab=${tabHint}&billingStatementId=${billingStatementId}` : `tab=${tabHint}`,
  };

  return (
    <div className="space-y-4">
      <WorkflowStepper steps={steps} />
      {preparationOpen && <nav aria-label="Rental preparation steps" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-white px-4 py-3 text-sm">
        <span className="font-medium text-slate-600">Revise before approval:</span>
        {hasPermission("assignment.read") && linkedAssignments.map(assignment => <Link key={assignment.id} className="app-link underline" to={`/assignments/${encodeURIComponent(assignment.id)}?returnTo=${encodeURIComponent(`/rentals/${aggregate.rental.id}/commercial-terms?step=deur`)}`}>Assignment</Link>)}
        {hasPermission("rental.commercialTerms.read") && <><Link className="app-link underline" to={`/rentals/${aggregate.rental.id}/commercial-terms`}>Commercial Terms</Link><Link className="app-link underline" to={`/rentals/${aggregate.rental.id}/commercial-terms?step=deur`}>DEUR Preparation</Link></>}
      </nav>}
      <WorkflowBanner
        tone={workflowBannerTone(workflow.stage)}
        title={workflow.label}
        description={`${workflow.explanation} Next: ${workflow.recommendedNextAction}.`}
        action={
          aggregate.rental.status !== "Closed" ? (
            <Link className="app-link text-sm" to={tabHref}>
              Go to {tabHint === "deur" ? "Daily Operations" : tabHint.charAt(0).toUpperCase() + tabHint.slice(1)}
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
