export type RentalCollectionStatus =
  | "Not Billed"
  | "Billed / Unpaid"
  | "Partially Collected"
  | "Fully Collected"
  | "No Amount Due";

export interface RentalCollectionProjection {
  status: RentalCollectionStatus;
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
}

/** Canonical read projection. Values must already be reconciled from persisted statements and collections. */
export function projectRentalCollectionStatus(input: {
  hasStatement: boolean;
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
}): RentalCollectionProjection {
  const totalInvoiced = Math.max(0, input.totalInvoiced);
  const totalCollected = Math.max(0, input.totalCollected);
  const outstandingBalance = Math.max(0, input.outstandingBalance);
  const status: RentalCollectionStatus = !input.hasStatement
    ? "Not Billed"
    : totalInvoiced === 0
      ? "No Amount Due"
      : outstandingBalance === 0 && totalCollected >= totalInvoiced
        ? "Fully Collected"
        : totalCollected > 0
          ? "Partially Collected"
          : "Billed / Unpaid";
  return { status, totalInvoiced, totalCollected, outstandingBalance };
}
