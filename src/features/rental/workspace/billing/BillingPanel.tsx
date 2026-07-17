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
import { useRentalWorkspaceAggregate } from "..";

export default function BillingPanel() {

  const aggregate = useRentalWorkspaceAggregate();

  const wizard =
    useBillingWizard();

  const drafts =
    useBillingDrafts();

  const completedDeur = aggregate.deurs.some((deur) => Boolean(deur.endOfDay) && !deur.billingLocked);
  const prerequisites = [
    [!["Cancelled", "Closed"].includes(aggregate.rental.status), "Rental is Cancelled or Closed."],
    [Boolean(aggregate.contract), "A rental contract is required."],
    [Boolean(aggregate.equipment && aggregate.operator), "Equipment and operator relationships are required."],
    [completedDeur, "Complete a billable DEUR before generating billing."],
  ] as const;
  const eligibilityMessage = prerequisites.find(([valid]) => !valid)?.[1];
  const canGenerate = !eligibilityMessage;
  const canCreate = canGenerate && wizard.hasGenerated && wizard.preview.length > 0;

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
        createUnavailableMessage={wizard.hasGenerated && !wizard.preview.length ? "No billable DEUR entries exist for the selected period." : eligibilityMessage ?? "Generate valid billing lines before creating a statement."}
      />

      {!canGenerate && (
        <div className="min-w-0 rounded-xl border bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Billing prerequisites</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {prerequisites.filter(([valid]) => !valid).map(([, message]) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <BillingHeader
        from={wizard.from}
        to={wizard.to}
      />

      <BillingPreviewTable
        lines={wizard.preview}
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
  onDelete={
    drafts.deleteDraft
  }
  onInvoiceStatus={
    drafts.updateInvoiceStatus
  }
/>

      </div>

    </div>

  );

}
