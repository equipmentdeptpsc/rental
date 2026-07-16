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

  const canCreate =
    !["Cancelled", "Closed"].includes(aggregate.rental.status) &&
    Boolean(aggregate.equipment && aggregate.operator && aggregate.contract);

  return (

    <div className="space-y-6">

      <BillingPeriodSelector
        from={wizard.from}
        to={wizard.to}
        onFromChange={wizard.setFrom}
        onToChange={wizard.setTo}
        onGenerate={wizard.generate}
        onSaveDraft={wizard.saveDraft}
        canCreate={canCreate}
        createUnavailableMessage="A valid rental, equipment, operator, and billing contract are required."
      />

      <BillingHeader
        from={wizard.from}
        to={wizard.to}
      />

      <BillingPreviewTable
        lines={wizard.preview}
      />

      <div className="grid gap-5 md:grid-cols-3">

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

      <div className="rounded-xl border bg-white p-6 space-y-4">

        <div className="flex items-center justify-between">

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
            className="rounded border px-3 py-2 text-sm w-64"
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
