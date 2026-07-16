export type RentalLifecycleStatus =
  | "Draft"
  | "Assigned"
  | "Reserved"
  | "Released"
  | "Active"
  | "Returned"
  | "Closed"
  | "Cancelled";

export interface RentalRecord {
  id: string;

  /** Optional for compatibility with records created before lifecycle numbering. */
  rentalNumber?: string;

  equipmentId: string;

  customerId?: string;

  projectId?: string;

  operatorId?: string;

  assignmentId?: string;

  customer: string;

  project: string;

  rentedBy: string;

  dateOut: string;

  expectedReturn: string;

  actualReturn?: string;

  remarks?: string;

  statusId: string;

  status: RentalLifecycleStatus;
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
