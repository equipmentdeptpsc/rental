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
import { resolveRentalBillingReadiness } from "@/features/rental/billing/resolveRentalBillingReadiness";
import { developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import { useSearchParams } from "react-router-dom";
import { PersistenceMode, useApplicationDependencies } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { useRef, useState } from "react";

const UAT_APPROVAL_HOST = "uat.pscequipment.online";
const UAT_STATEMENT_ID = "b0e9fba1-b9ff-48bc-9b3e-b3be4da0fb15";
const UAT_RENTAL_ID = "fe225d54-5aec-42ab-b1e1-9ae731409e56";
const UAT_STATEMENT_NUMBER = "BS-2026-000002";

export default function BillingPanel() {

  const aggregate = useRentalWorkspaceAggregate();
  const dependencies = useApplicationDependencies();
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const selectedBillingStatementId = searchParams.get("billingStatementId") ?? undefined;
  const { equipment } = useRentalWorkspacePresentationData();

  const wizard =
    useBillingWizard();

  const drafts =
    useBillingDrafts();
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalAttempted, setApprovalAttempted] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");
  const approvalIdentity = useRef<{ commandId: string; idempotencyKey: string } | undefined>(undefined);

  const billingReadiness = resolveRentalBillingReadiness({ rentalEquipmentLines: aggregate.rentalEquipmentLines, deurs: aggregate.deurs, contract: aggregate.contract });
  const commercialTermsAvailable = aggregate.rentalEquipmentLines.length > 0 && aggregate.rentalEquipmentLines.every((line) => Boolean(line.commercialSnapshot));
  const workflow=resolveRentalWorkflowStatus({rental:aggregate.rental,effectiveDeurs:billingReadiness.effectiveDeurs,commercialTermsAvailable,billableEvidence:billingReadiness.ready});
  const lineBlockers = resolveRentalBillingBlockers({
    lines: aggregate.rentalEquipmentLines,
    deurs: aggregate.deurs,
    equipment,
    pendingReviewDeurIds: new Set(developmentCustomerReviewOutbox.getAll().filter((entry) => entry.status === "Pending").map((entry) => entry.deurId)),
  });
  const prerequisites = [
    [!["Cancelled", "Closed"].includes(aggregate.rental.status), "Rental is Cancelled or Closed."],
    [aggregate.rentalEquipmentLines.length > 0, "At least one Rental Equipment Line is required."],
    [lineBlockers.length === 0 && billingReadiness.ready, "Resolve Rental Equipment Line billing blockers."],
  ] as const;
  const eligibilityMessage = prerequisites.find(([valid]) => !valid)?.[1];
  const canGenerate = !eligibilityMessage;
  const canCreate = canGenerate && wizard.hasGenerated && wizard.preview.length > 0 && wizard.issues.length === 0;
  const uatApprovalTarget = typeof window !== "undefined" && window.location.hostname === UAT_APPROVAL_HOST
    ? drafts.drafts.find((statement) => statement.id === UAT_STATEMENT_ID && statement.rentalId === UAT_RENTAL_ID && statement.statementNo === UAT_STATEMENT_NUMBER && statement.approvalStatus === "Draft" && statement.invoiceStatus === "Not Invoiced" && statement.grandTotal === 1000)
    : undefined;
  const canApproveUatStatement = dependencies.configuration.persistenceMode === PersistenceMode.Remote && Boolean(uatApprovalTarget) && hasPermission("billing.update") && !approvalBusy && !approvalAttempted;
  const approveUatStatement = async () => {
    if (!uatApprovalTarget || !canApproveUatStatement || !window.confirm(`Approve ${UAT_STATEMENT_NUMBER} for PHP 1,000?\n\nDraft → Approved`)) return;
    setApprovalBusy(true);
    setApprovalAttempted(true);
    setApprovalMessage("");
    approvalIdentity.current ??= { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    try {
      const result = await dependencies.commandRepositories.billingFinancialCommands.finalizeStatement({ ...approvalIdentity.current, statementId: UAT_STATEMENT_ID });
      setApprovalMessage(result.success ? "Billing statement approved. Refresh to verify the audit result." : result.message);
      if (result.success) approvalIdentity.current = undefined;
    } catch {
      setApprovalMessage("Confirmation was not received from the remote service. Reconcile read-only before any further action.");
    } finally {
      setApprovalBusy(false);
    }
  };

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
            {billingReadiness.issues.map((issue) => <li key={`${issue.rentalEquipmentLineId}-${issue.code}`}><b>{issue.deurNumber ? `${issue.deurNumber}${issue.revisionNumber ? ` R${issue.revisionNumber}` : ""}` : issue.equipmentId ?? "DEUR"}</b><br/>{issue.message}</li>)}
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
          label="Rental persisted subtotal"
          value={aggregate.billing.subtotal}
        />

        <p className="text-sm text-slate-600 md:col-span-3">
          This is the rental-level total of persisted billing statements. It is not an amount for an individual DEUR; unbilled DEUR amounts are calculated in the billing preview above.
        </p>

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

        {uatApprovalTarget && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" aria-label="UAT billing statement approval">
            <h2 className="font-semibold">UAT approval control</h2>
            <p className="mt-1 text-sm">{UAT_STATEMENT_NUMBER} · PHP 1,000 · Draft → Approved</p>
            <p className="mt-1 text-xs text-slate-600">Canonical command: command_finalize_billing_statement · Permission: billing.update</p>
            <button type="button" className="mt-3 rounded bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!canApproveUatStatement} onClick={() => void approveUatStatement()}>
              {approvalBusy ? "Approving…" : approvalAttempted ? "Approval attempted — refresh to reconcile" : "Approve UAT billing statement"}
            </button>
            {approvalMessage && <p className="mt-2 text-sm" aria-live="polite">{approvalMessage}</p>}
          </section>
        )}

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
  allowLegacyActions={dependencies.configuration.persistenceMode !== PersistenceMode.Remote}
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
