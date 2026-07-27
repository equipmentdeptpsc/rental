import { useMemo, useState } from "react";

import {
  useRentalWorkspaceAggregate,
} from "..";

import { getCompletedDeursForBillingPeriod } from "./BillingPreviewBuilder";

import { buildRentalLineAwareBillingPreview, createRentalLineAwareBillingStatement } from "@/features/rental/billingstatement/services/buildRentalLineAwareBilling";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";

export function useBillingWizard() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const { showToast } = useToast();
  const { billingStatement, deur } = useApplicationDependenciesCompatibility().repositories;
  const {equipment}=useEquipment();const{operators}=useOperator();

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
        return { lines: [], issues: [], notices: [], subtotal: 0, vat: 0, withholdingTax: 0, grandTotal: 0 };
      }
      return buildRentalLineAwareBillingPreview({ aggregate, from, to, equipment, operators });
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

    const result = createRentalLineAwareBillingStatement({ aggregate, from, to, equipment, operators }, { statements: billingStatement, deurs: deur });

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
    notices: previewResult.notices,

    totals: previewResult,

    completedDeurs,

    hasGenerated: generated,

    generate,

    saveDraft,

  };
}
