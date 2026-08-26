import BillingHeader from "./components/BillingHeader";

import BillingPeriodSelector from "./components/BillingPeriodSelector";

import BillingPreviewTable from "./components/BillingPreviewTable";

import BillingDraftTable from "./components/BillingDraftTable";

import BillingMetricCard from "./BillingMetricCard";

import {
  useBillingWizard,
} from "./useBillingWizard";

import {
  useBillingDrafts,
} from "./useBillingDrafts";
import { useRentalWorkspaceAggregate, useRentalWorkspacePresentationData } from "..";
import { resolveRentalWorkflowStatus } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import { resolveRentalBillingBlockers } from "@/features/rental/billing/resolveRentalBillingBlockers";
import { developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import { useSearchParams } from "react-router-dom";

export default function BillingPanel() {

  const aggregate = useRentalWorkspaceAggregate();
  const [searchParams] = useSearchParams();
  const selectedBillingStatementId = searchParams.get("billingStatementId") ?? undefined;
  const { equipment } = useRentalWorkspacePresentationData();

  const wizard =
    useBillingWizard();

  const drafts =
    useBillingDrafts();

  const hasDeurEvidence = aggregate.deurs.some((deur) => !deur.billingLocked && deur.status === "Acknowledged");
  const workflow=resolveRentalWorkflowStatus({rental:aggregate.rental,effectiveDeur:aggregate.deurs.at(-1),commercialTermsAvailable:Boolean(aggregate.contract||aggregate.deurs.at(-1)?.commercialSnapshot),billableEvidence:hasDeurEvidence});
  const lineBlockers = resolveRentalBillingBlockers({
    lines: aggregate.rentalEquipmentLines,
    deurs: aggregate.deurs,
    equipment,
    pendingReviewDeurIds: new Set(developmentCustomerReviewOutbox.getAll().filter((entry) => entry.status === "Pending").map((entry) => entry.deurId)),
  });
  const prerequisites = [
    [!["Cancelled", "Closed"].includes(aggregate.rental.status), "Rental is Cancelled or Closed."],
    [aggregate.rentalEquipmentLines.length > 0, "At least one Rental Equipment Line is required."],
    [lineBlockers.length === 0, "Resolve Rental Equipment Line billing blockers."],
  ] as const;
  const eligibilityMessage = prerequisites.find(([valid]) => !valid)?.[1];
  const canGenerate = !eligibilityMessage;
  const canCreate = canGenerate && wizard.hasGenerated && wizard.preview.length > 0 && wizard.issues.length === 0;

  return (

    <div className="space-y-6">

      <BillingPeriodSelector
        from={wizard.from}
        to={wizard.to}
        onFromChange={wizard.setFrom}
        onToChange={wizard.setTo}
        onGenerate={wizard.generate}
        onSaveDraft={wizard.saveDraft}
        canGenerate={canGenerate}
        canCreate={canCreate}
        createUnavailableMessage={wizard.hasGenerated && wizard.issues.length ? "Resolve every DEUR eligibility issue before creating the statement." : wizard.hasGenerated && !wizard.preview.length ? "No billable DEUR entries exist for the selected period." : eligibilityMessage ?? "Generate valid billing lines before creating a statement."}
      />

      {!canGenerate && (
        <div className="min-w-0 rounded-xl border bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Billing prerequisites</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {lineBlockers.map((blocker) => <li key={blocker.rentalEquipmentLineId}><b>{blocker.label}</b><br/>{blocker.message} Next: {blocker.nextAction}.</li>)}
            {prerequisites.filter(([valid, message]) => !valid && message !== "Resolve Rental Equipment Line billing blockers.").map(([, message]) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="rounded border bg-slate-50 p-3 text-sm"><b>Workflow: {workflow.label}</b> — {workflow.explanation} Next: {workflow.recommendedNextAction}.</p>

      {wizard.hasGenerated && wizard.issues.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">Billing eligibility issues</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {wizard.issues.map((issue, index) => <li key={`${issue.deurId ?? "rental"}-${issue.code}-${index}`}><span className="font-medium">{issue.equipmentId ?? "Unknown equipment"}</span> / {issue.deurId ?? "Unknown DEUR"}: {issue.message}</li>)}
          </ul>
        </div>
      )}
      {wizard.hasGenerated && wizard.notices.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="font-semibold">Already billed</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {wizard.notices.map((notice, index) => <li key={`${notice.label}-${index}`}><span className="font-medium">{notice.label}</span><br/>{notice.message}</li>)}
          </ul>
        </div>
      )}

      <BillingHeader
        from={wizard.from}
        to={wizard.to}
      />

      <BillingPreviewTable
        lines={wizard.preview}
        completedDeurs={wizard.completedDeurs}
        rateUnavailable={false}
      />

      <div className="grid min-w-0 gap-5 md:grid-cols-3">

        <BillingMetricCard
          label="Persisted Subtotal"
          value={aggregate.billing.subtotal}
        />

        <div className="rounded-lg border bg-white p-5">
          <div className="text-sm text-slate-500">Invoice Status</div>
          <div className="mt-2 text-xl font-bold">
            {aggregate.billing.invoiceStatus ?? "No billing statement"}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5">
          <div className="text-sm text-slate-500">Invoice Preparation</div>
          <div className="mt-2 text-xl font-bold">
            {aggregate.billing.invoicePreparationComplete ? "Ready" : "Not ready"}
          </div>
        </div>

      </div>

      <div className="min-w-0 rounded-xl border bg-white p-4 sm:p-6 space-y-4">

        <div className="flex flex-wrap items-center justify-between gap-3">

          <h2 className="text-lg font-semibold">

            Saved Billing Statements

          </h2>

          <input
            type="text"
            placeholder="Search..."
            value={drafts.keyword}
            onChange={(e) =>
              drafts.setKeyword(
                e.target.value
              )
            }
            className="w-full min-w-0 rounded border px-3 py-2 text-sm sm:w-64"
          />

        </div>

        <BillingDraftTable
  drafts={drafts.drafts}
  selectedId={selectedBillingStatementId}
  onDelete={
    drafts.deleteDraft
  }
  onInvoiceStatus={
    drafts.updateInvoiceStatus
  }
  onCollect={drafts.collect}
/>

      </div>

    </div>

  );

}
