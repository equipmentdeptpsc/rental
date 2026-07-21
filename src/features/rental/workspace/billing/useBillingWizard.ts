import { useMemo, useState } from "react";

import {
  useRentalWorkspaceAggregate,
} from "..";

import { getCompletedDeursForBillingPeriod } from "./BillingPreviewBuilder";

import { buildRentalLineAwareBillingPreview, createRentalLineAwareBillingStatement } from "@/features/rental/billingstatement/services/buildRentalLineAwareBilling";
import { useToast } from "@/components/ui/toast/ToastContext";

export function useBillingWizard() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const { showToast } = useToast();

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  const [from, setFrom] =
    useState(today);

  const [to, setTo] =
    useState(today);

  const [generated, setGenerated] =
    useState(false);

  const completedDeurs =
    useMemo(
      () => getCompletedDeursForBillingPeriod(
        aggregate.deurs,
        from,
        to
      ),
      [aggregate.deurs, from, to]
    );

  const previewResult =
    useMemo(() => {
      if (!generated) {
        return { lines: [], issues: [], subtotal: 0, vat: 0, withholdingTax: 0, grandTotal: 0 };
      }
      return buildRentalLineAwareBillingPreview({ aggregate, from, to });
    }, [
      aggregate,
      from,
      to,
      generated,
    ]);

  function generate() {
    setGenerated(true);
  }

  function saveDraft() {

    if (!generated) {
      return;
    }

    const result = createRentalLineAwareBillingStatement({ aggregate, from, to });

    if (!result.success) {
      showToast(result.message, "error");
      return;
    }

    showToast("Billing statement created successfully.", "success");
  }

  return {

    from,

    to,

    setFrom,

    setTo,

    preview: previewResult.lines,

    issues: previewResult.issues,

    totals: previewResult,

    completedDeurs,

    hasGenerated: generated,

    generate,

    saveDraft,

  };
}
