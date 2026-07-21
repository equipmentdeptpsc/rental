import { useMemo } from "react";

import {
  useRentalWorkspaceAggregate,
} from "..";

import { buildRentalLineAwareBillingPreview } from "@/features/rental/billingstatement/services/buildRentalLineAwareBilling";

export function useBillingPreview(
  from: string,
  to: string
) {
  const aggregate =
    useRentalWorkspaceAggregate();

  return useMemo(() => {

    return buildRentalLineAwareBillingPreview({ aggregate, from, to }).lines;

  }, [
    aggregate,
    from,
    to,
  ]);
}
