import { useMemo, useState } from "react";

import {
  useRentalWorkspaceAggregate,
} from "..";

import {
  deurRepository,
} from "@/features/rental/deur/repository/deurRepository";

import {
  buildBillingPreview,
} from "./BillingPreviewBuilder";

import { createBillingStatementForRental } from "@/features/rental/billingstatement/services/BillingStatementWorkflow";
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

    const preview =
    useMemo(() => {
  
      if (!generated) {
        return [];
      }
  
      const contract =
        aggregate.contract;
  
      if (!contract) {
        return [];
      }
  
      const deurs =
        deurRepository.getByRentalId(
          aggregate.rental.id
        );
  
      return buildBillingPreview(
        deurs,
        contract,
        from,
        to
      );
  
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

    const result = createBillingStatementForRental(
      aggregate,
      from,
      to,
      preview
    );

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

    preview,

    hasGenerated: generated,

    generate,

    saveDraft,

  };
}
