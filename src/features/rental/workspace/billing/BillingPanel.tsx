import BillingHeader from "./components/BillingHeader";

import BillingPeriodSelector from "./components/BillingPeriodSelector";

import BillingPreviewTable from "./components/BillingPreviewTable";

import BillingDraftTable from "./components/BillingDraftTable";

import BillingMetricCard from "./BillingMetricCard";

import {
  useBillingSummary,
} from "./useBillingSummary";

import {
  useBillingWizard,
} from "./useBillingWizard";

import {
  useBillingDrafts,
} from "./useBillingDrafts";

export default function BillingPanel() {

  const billing =
    useBillingSummary();

  const wizard =
    useBillingWizard();

  const drafts =
    useBillingDrafts();

  return (

    <div className="space-y-6">

      <BillingPeriodSelector
        from={wizard.from}
        to={wizard.to}
        onFromChange={wizard.setFrom}
        onToChange={wizard.setTo}
        onGenerate={wizard.generate}
        onSaveDraft={wizard.saveDraft}
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
          label="Operating"
          value={billing.operatingCharge}
        />

        <BillingMetricCard
          label="Idle"
          value={billing.idleCharge}
        />

        <BillingMetricCard
          label="Mobilization"
          value={billing.mobilizationCharge}
        />

        <BillingMetricCard
          label="Demobilization"
          value={billing.demobilizationCharge}
        />

        <BillingMetricCard
          label="Subtotal"
          value={billing.subtotal}
        />

        <BillingMetricCard
          label="Outstanding"
          value={billing.outstanding}
        />

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
/>

      </div>

    </div>

  );

}