export type AssignmentStatus =
  | "Active"
  | "Completed"
  | "Cancelled";

export interface AssignmentRecord {
  id: string;

  equipmentId: string;

  operatorId: string;

  projectId: string;

  assignedDate: string;

  expectedReturn: string;

  returnedDate?: string;

  remarks: string;

  status: AssignmentStatus;

  deleted?: boolean;

  deletedAt?: number;
}

export interface AssignmentFormData {
  equipmentId: string;

  operatorId: string;

  projectId: string;

  remarks: string;
}
