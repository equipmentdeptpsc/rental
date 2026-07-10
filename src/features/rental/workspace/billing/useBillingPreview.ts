import { useMemo } from "react";

import {
  useRentalWorkspaceAggregate,
} from "..";

import {
    deurRepository,
  } from "@/features/rental/deur/repository/deurRepository";

import {
  buildBillingPreview,
} from "./BillingPreviewBuilder";

export function useBillingPreview(
  from: string,
  to: string
) {
  const aggregate =
    useRentalWorkspaceAggregate();

  return useMemo(() => {

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
  ]);
}