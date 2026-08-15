import { Link, useSearchParams } from "react-router-dom";
import WorkflowBanner from "@/components/ui/WorkflowBanner";
import WorkflowStepper from "@/components/ui/WorkflowStepper";
import { useRentalWorkspaceAggregate } from "..";
import { resolveRentalWorkflowStatus } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import { buildRentalWorkflowSteps, workflowBannerTone } from "../presentation/rentalWorkflowPresentation";

export default function RentalWorkspaceWorkflowPanel() {
  const aggregate = useRentalWorkspaceAggregate();
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
