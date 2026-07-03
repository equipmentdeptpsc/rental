export interface RentalRecord {
  id: string;

  equipmentId: string;

  customer: string;

  project: string;

  rentedBy: string;

  dateOut: string;

  expectedReturn: string;

  actualReturn?: string;

  remarks?: string;

  status:
    | "Active"
    | "Returned";
}

export function isOverdue(
  rental: RentalRecord
) {
  if (
    rental.status === "Returned"
  ) {
    return false;
  }

  return (
    new Date(
      rental.expectedReturn
    ) < new Date()
  );
}