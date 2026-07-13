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

  statusId: string;

  status: string;
}

export function isOverdue(
  rental: RentalRecord
) {
  if (
    rental.status === "Returned" ||
    rental.status === "Closed"
  ) {
    return false;
  }

  return (
    new Date(
      rental.expectedReturn
    ) < new Date()
  );
}