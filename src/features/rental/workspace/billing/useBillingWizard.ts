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

import {
  createBillingStatement,
} from "./createBillingStatement";

export function useBillingWizard() {
  const aggregate =
    useRentalWorkspaceAggregate();

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

      const deurs =
        deurRepository.getByRentalId(
          aggregate.rental.id
        );

      return buildBillingPreview(
        deurs,
        from,
        to
      );

    }, [
      aggregate.rental.id,
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

    createBillingStatement(
      aggregate,
      from,
      to,
      preview
    );

    alert(
      "Billing Statement saved successfully."
    );
  }

  return {

    from,

    to,

    setFrom,

    setTo,

    preview,

    generate,

    saveDraft,

  };
}